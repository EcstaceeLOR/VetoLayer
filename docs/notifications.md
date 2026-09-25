# Notifications and outbound delivery

Issue #61 adds a durable event and delivery layer so important VetoLayer events reach people and systems without making the action that produced the event depend on an email provider or webhook destination.

## Event model

VetoLayer records one idempotent product event for each notification-worthy state change. The initial catalog is:

- `review.created`
- `review.assigned`
- `review.evidence_requested`
- `review.resolved`
- `decision.blocked_high_severity`
- `integration.disconnected`
- `integration.failed`
- `policy.activated`
- `policy.deactivated`

Events are scoped to workspace, project, and environment and carry a stable event ID plus a producer-defined idempotency key. Duplicate producer attempts recover the existing event rather than creating a second logical alert.

Review events deep-link to `/dashboard/reviews?case=<reviewCaseId>`. High-severity BLOCK events deep-link to the exact immutable Decision Receipt.

## Human notification preferences

Dashboard → Notifications provides per-user controls for in-product and email delivery. Preferences are independent by channel. An empty project subscription list means all workspace projects; selecting projects narrows that user's alerts to those projects only.

Default behavior keeps all supported events visible in-product while email defaults to human-review events and high-severity BLOCKs. Users can reduce or expand those channels without changing another workspace member's settings.

## In-product notification center

In-product notifications are durable and keyed by `(event_id, user_id)` so one event cannot create duplicate cards for the same user. The notification center exposes unread counts, individual read state, mark-all-read, event severity, timestamps, and stable deep links.

Browser roles do not access notification tables directly. Authenticated server routes enforce workspace membership and user ownership before reading or changing notification state.

## Email delivery

Email is delivered through the Resend HTTPS API. Configure:

```text
RESEND_API_KEY=...
VETOLAYER_NOTIFICATION_FROM_EMAIL=VetoLayer <alerts@example.com>
```

Each delivery uses the durable delivery ID as the provider idempotency key. Email payloads contain the product event title/message, severity, and an application deep link when `NEXT_PUBLIC_APP_URL` is configured. Server credentials are never included in the event payload.

If email is not configured, queued email jobs fail closed into the delivery history rather than affecting the review/decision/policy/integration request that produced the event.

## Signed outbound webhooks

Webhook endpoint CRUD, signing-secret rotation, test delivery, and legacy delivery history remain in Dashboard → Developer. Issue #61 expands the supported event catalog and routes the notification-worthy event types through the durable outbox.

Every product-event webhook includes:

```text
X-VetoLayer-Event-Id: evt_...
X-VetoLayer-Event-Type: review.assigned
X-VetoLayer-Signature: sha256=<HMAC-SHA256>
```

The JSON body includes the stable event ID/type, created time, exact workspace/project/environment scope, and event data. Receivers should use `X-VetoLayer-Event-Id` as their idempotency key because retries intentionally reuse the same logical event ID.

Compatibility subscriptions remain supported: granular policy events can satisfy `policy.changed`, granular integration events can satisfy `integration.changed`, granular review assignment/evidence events can satisfy `review.updated`, and high-severity BLOCK alerts can satisfy `decision.created` subscriptions.

## Durable outbox and retry policy

External email/webhook I/O does not run before the authoritative product mutation succeeds. VetoLayer first records the product event and delivery jobs, then attempts to drain jobs after the HTTP response using Next.js `after(...)`.

The durable worker endpoint is:

```text
GET|POST /api/internal/notification-deliveries
Authorization: Bearer <VETOLAYER_DELIVERY_WORKER_SECRET>
```

`CRON_SECRET` is accepted as a fallback. Production refuses to run the worker without one of those secrets configured.

Schedule the worker at least once per minute. It claims due jobs with a server-only Postgres function using `FOR UPDATE SKIP LOCKED`, which prevents concurrent workers from claiming the same delivery. The retry schedule is approximately:

1. 60 seconds
2. 5 minutes
3. 30 minutes
4. 2 hours
5. 12 hours

After the final failed attempt the job becomes `dead`. Delivery state and error text remain inspectable for operations. Developer Console manual webhook retry remains available for endpoint troubleshooting.

## Database migration

Apply `supabase/migrations/202609251700_notifications.sql`. It creates:

- `vetolayer_product_events`
- `vetolayer_notification_preferences`
- `vetolayer_notifications`
- `vetolayer_notification_deliveries`
- `vetolayer_claim_notification_deliveries(...)`

The migration adds unique idempotency constraints, unread/due/scope indexes, RLS, and revokes direct `anon`/`authenticated` table access. The delivery-claim RPC is executable only by `service_role`.

## Failure semantics

Notification fan-out is secondary to governance state. A notification-storage or delivery failure must never change a valid Decision Receipt, human-review transition, policy lifecycle change, or integration state update into a false product failure. Producers log enqueue failures separately; durable delivery retries handle downstream network failures.
