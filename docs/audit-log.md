# Activity and security audit log

VetoLayer keeps administrative and governance activity in an append-only audit stream that is separate from Decision Receipts. Decision Receipts prove how an action was evaluated; audit events explain who changed the configuration and workflow around those decisions.

## Authorization and scope

Only workspace `owner` and `admin` roles receive `audit.read` and `audit.export`. Every read/export is resolved from the authenticated workspace context and always includes the workspace ID in the persistence query. Reviewers and members cannot query or export audit data.

Audit events may also carry project and environment IDs. Account-security events such as password changes or session revocation are workspace-level because they affect every workspace membership for that user.

## Event model

Each row records:

- immutable event ID and timestamp
- workspace, plus optional project/environment
- actor kind, user ID, display label and workspace role
- action/category
- affected resource type, ID and label
- stable product deep link when one exists
- request ID and optional correlation/trace ID
- source IP/user-agent when supplied by trusted request infrastructure
- redacted event metadata

The current event producers cover workspace/project/environment administration, invitations and role changes, API keys, developer webhooks, GitHub integration administration, Policy Studio lifecycle, human review actions, notification preferences, and available account-security events.

## Append-only enforcement

Normal application code receives an `AuditStore` with only `append` and `list`; there is no update/delete method or mutation API. In Supabase, `vetolayer_audit_events` has a database trigger that rejects every `UPDATE` and `DELETE`, including service-role attempts. Browser roles have no table privileges.

This means retention maintenance must be an explicit operational migration/archival procedure, not a product API call that silently rewrites history.

## Sensitive-data handling

Audit metadata is recursively redacted before persistence. Keys that look like passwords, tokens, credentials, API keys, signing/client secrets, private keys, cookies, Authorization/session/JWT material, and similar secrets are replaced with `[REDACTED]`. Bearer credentials and common secret-bearing URL query parameters are also scrubbed when they appear inside otherwise ordinary strings.

Do not deliberately send secret values to the audit writer. Redaction is defense in depth, not a reason to duplicate credentials into observability systems.

Review audit events intentionally record evidence IDs/types, counts and action outcomes rather than copying internal comment bodies, evidence references, or rationale text. The Review case remains the source of truth for that sensitive workflow content.

## Search and export

The dashboard Audit page supports filters for actor, action, resource, project, environment, and date range. Older events can be paged in chronological order. Authorized users can export the same filtered history as CSV or JSON.

Exports are bounded to 5,000 rows per request and return `X-VetoLayer-Audit-Truncated: true` when the bound is reached. For larger regulatory/compliance exports, use a controlled backend export process rather than removing the online safety bound.

## Retention design

Issue #62 deliberately does not auto-delete audit history. A production retention policy should define an online retention window and optional immutable cold archive based on the customer's regulatory requirements. Because the table is append-only, deletion/archival requires an explicit privileged maintenance process or migration with an auditable change record outside normal product APIs.

## Failure semantics

The authoritative product mutation is committed first. Audit persistence failures are logged as `audit.write.failed` or `audit.security_fanout.failed` and do not transform a successful workspace, policy, review, credential, or integration mutation into a misleading application failure. Production monitoring should alert on these error events because missing audit writes are an operational/security incident even when the underlying action succeeded.

## Migration

Apply:

`supabase/migrations/202609251145_audit_log.sql`

Production Audit APIs intentionally return `AUDIT_PERSISTENCE_REQUIRED` until durable Supabase persistence is available.
