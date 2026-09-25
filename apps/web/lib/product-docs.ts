export type ProductDocSection = {
  heading: string;
  body?: string[];
  bullets?: string[];
  code?: string;
};

export type ProductDocTopic = {
  slug: string;
  title: string;
  summary: string;
  group: "Start" | "Build" | "Operate" | "Reference";
  updated: string;
  sections: ProductDocSection[];
};

export const DOCS_RELEASE = "2026.09";

const sdkQuickstart = `import { exampleActionRequests } from "@vetolayer/core";
import { createVetoLayerClient } from "@vetolayer/sdk";

const veto = createVetoLayerClient({
  baseUrl: process.env.VETOLAYER_URL!,
  apiKey: process.env.VETOLAYER_PROJECT_API_KEY!,
});

const evaluation = await veto.evaluate({
  action: exampleActionRequests.refund,
  evidence: [],
  facts: { customerRisk: "normal" },
});

if (evaluation.decision.outcome !== "ALLOW") {
  // REVIEW and BLOCK are stop states for the caller.
  return evaluation;
}

// Execute the real tool only after ALLOW.`;

const webhookVerify = `import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyVetoLayerWebhook(rawBody: string, header: string, secret: string) {
  const expected = ` + "`sha256=${createHmac(\"sha256\", secret).update(rawBody).digest(\"hex\")}`" + `;
  const left = Buffer.from(header);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}`;

export const productDocs: ProductDocTopic[] = [
  {
    slug: "concepts",
    title: "Core concepts",
    summary: "Actions, policies, evidence, REVIEW, receipts, and the workspace/project/environment boundary.",
    group: "Start",
    updated: "2026-09-25",
    sections: [
      { heading: "The evaluation model", body: ["VetoLayer sits between an autonomous system and the action it wants to execute. Integrations normalize the proposed work into an ActionRequest, resolve the active policy versions for the API key or product scope, evaluate deterministic rules first, and use contextual reasoning only when a contextual policy needs it."] },
      { heading: "Outcomes", bullets: ["ALLOW means the governed action may proceed.", "REVIEW means execution must stop until the operational review workflow produces a later re-evaluation.", "BLOCK means execution must stop. A human approval cannot override a deterministic hard block; human input is evidence for a new evaluation."] },
      { heading: "Evidence and receipts", body: ["Evidence is a typed observation or stable reference available at decision time. Every completed evaluation produces an immutable Decision Receipt containing the action, policy-version references, findings, evidence, reasoning metadata, outcome, integrity data, and timestamps. Re-evaluations create new receipts and are linked as lineage instead of overwriting history."] },
      { heading: "Scope", body: ["Workspace is the organization boundary. Projects isolate governed systems or applications. Environments isolate execution contexts such as development, staging, and production. Developer API keys are bound to one workspace/project/environment on the server; clients do not choose scope with headers or request fields."] },
    ],
  },
  {
    slug: "developer-quickstart",
    title: "Developer quickstart",
    summary: "Create a scoped API key, evaluate an action, and execute only after ALLOW.",
    group: "Build",
    updated: "2026-09-25",
    sections: [
      { heading: "1. Create a project API key", body: ["Open Developer in the dashboard, select the project/environment you want to govern, create a key with evaluate permission, and copy the secret when it is shown. VetoLayer stores only its hash and safe prefix."] },
      { heading: "2. Activate policy", body: ["Policy Studio active versions are authoritative for that project/environment. Request-supplied policies are only a backwards-compatible fallback when no managed policy is active."] },
      { heading: "3. Evaluate before execute", code: sdkQuickstart },
      { heading: "4. Investigate every result", body: ["Successful evaluations create real Decision Receipts. Use Decisions to search by action, actor, policy, receipt, outcome, SERV usage, review state, or date, then verify receipt integrity and lineage before incident or compliance review."] },
    ],
  },
  {
    slug: "api-reference",
    title: "API authentication and errors",
    summary: "Bearer-key authentication, scope, endpoints, rate limits, response shape, and error codes.",
    group: "Reference",
    updated: "2026-09-25",
    sections: [
      { heading: "Authentication", body: ["Send Authorization: Bearer <project-api-key>. Keys are server-bound to workspace, project, and environment. Do not send global workspace headers and do not put keys in browser bundles."] },
      { heading: "Endpoints", bullets: ["POST /api/v1/evaluate — evaluate an ActionRequest and create a receipt.", "GET /api/v1/decisions?limit=50 — list recent receipts in the key scope; limit is capped by the SDK/server.", "GET /api/v1/decisions/:receiptId — retrieve one receipt only when it belongs to the key scope."] },
      { heading: "Evaluate response", body: ["A successful response contains requestId, decision, receipt, trace, optional providerTrace, persistence, scope, policySource, managedPolicyVersions, and latencyMs. REVIEW and BLOCK are never approvals. Contextual-provider failure cannot become ALLOW."] },
      { heading: "Errors", bullets: ["API_KEY_REQUIRED / INVALID_API_KEY — missing or invalid bearer credential.", "API_KEY_SCOPE_FORBIDDEN — the credential cannot perform the requested operation.", "INVALID_JSON / INVALID_ACTION / INVALID_POLICY / INVALID_EVIDENCE — runtime contract validation failed.", "POLICIES_REQUIRED — there is no active managed policy and no allowed request-policy fallback.", "RATE_LIMITED — per-key evaluation limit reached; respect Retry-After.", "DECISION_NOT_FOUND — receipt does not exist in the authenticated scope.", "EVALUATION_FAILED / DECISION_STORE_UNAVAILABLE — evaluation or persistence failed closed."] },
    ],
  },
  {
    slug: "webhooks",
    title: "Webhook events and signatures",
    summary: "Subscribe to product events and verify every outbound delivery using the exact raw request body.",
    group: "Reference",
    updated: "2026-09-25",
    sections: [
      { heading: "Delivery contract", bullets: ["Content-Type: application/json", "User-Agent: VetoLayer-Webhook/1.0", "X-VetoLayer-Event-Id: stable event id", "X-VetoLayer-Event-Type: subscribed event type", "X-VetoLayer-Signature: sha256=<HMAC-SHA256 hex>"] },
      { heading: "Verify the signature", body: ["Compute HMAC-SHA256 over the exact raw request body using the endpoint signing secret. Compare the complete sha256= value with a timing-safe comparison. Parsing and re-stringifying JSON before verification changes the bytes and invalidates the signature."], code: webhookVerify },
      { heading: "Event types", bullets: ["decision.created", "decision.blocked_high_severity", "review.created / review.updated / review.assigned / review.evidence_requested / review.resolved", "policy.changed / policy.activated / policy.deactivated", "integration.changed / integration.disconnected / integration.failed"] },
      { heading: "Reliability", body: ["Outbound product delivery is queued separately from the authoritative action. Each event has an idempotency identity, retries use backoff, delivery history is visible in Developer, and a failing destination cannot roll back a valid decision, review action, policy change, or integration mutation."] },
    ],
  },
  {
    slug: "github-app",
    title: "GitHub App setup",
    summary: "Install VetoLayer without personal access tokens and bind repositories to the active product scope.",
    group: "Build",
    updated: "2026-09-25",
    sections: [
      { heading: "Platform setup", body: ["The VetoLayer deployment owner configures the GitHub App registration credentials server-side. Workspace users never paste a personal GitHub token into VetoLayer."] },
      { heading: "Workspace installation", bullets: ["Open Integrations → GitHub App.", "Start installation and choose the GitHub account/repositories allowed by the GitHub App installation.", "The callback verifies the signed installation state and verifies that the installer can access the installation before binding it.", "Select repositories for the active VetoLayer project/environment and refresh repository state when GitHub changes."] },
      { heading: "Runtime behavior", body: ["GitHub webhook requests are signature-verified and replay-protected. Repository activity is converted into VetoLayer action/evidence contracts, evaluated with managed policies plus trusted adapter safety policy where applicable, and persisted as Decision Receipts."] },
    ],
  },
  {
    slug: "policy-authoring",
    title: "Policy authoring and lifecycle",
    summary: "Draft, simulate, publish immutable versions, inspect conflicts, and roll back safely.",
    group: "Build",
    updated: "2026-09-25",
    sections: [
      { heading: "Choose deterministic vs contextual", bullets: ["Use deterministic policy for reproducible conditions such as thresholds, permissions, required evidence, environments, and hard deny rules.", "Use contextual policy only when the policy genuinely requires semantic judgment over evidence, exceptions, or competing facts."] },
      { heading: "Lifecycle", body: ["Edit drafts freely. Simulation does not publish. Activation publishes an immutable version and makes it authoritative for the project/environment. Editing a published policy creates a new version. Re-activating an older published version is a rollback; historical receipts keep their original policy@version references."] },
      { heading: "Safe activation", body: ["Before activation, review simulation output, lifecycle diff, and conflict warnings. A project/environment has one active version per logical policy, and callers cannot inject a request policy to weaken an active managed policy set."] },
    ],
  },
  {
    slug: "review-workflow",
    title: "Human review workflow",
    summary: "Assign, request evidence, add provenance, approve/reject with rationale, and re-evaluate safely.",
    group: "Operate",
    updated: "2026-09-25",
    sections: [
      { heading: "Operational queue", body: ["REVIEW cases expose assignment, ownership filters, due time/age, internal comments, evidence requests, evidence additions, and an auditable timeline. Mutations are revisioned so stale reviewers receive a conflict instead of silently overwriting newer work."] },
      { heading: "Approval is evidence", body: ["Approve and reject actions require rationale and create human-review evidence. VetoLayer then runs the real orchestrator again and creates a new signed receipt. A human approval never bypasses deterministic hard BLOCK policy."] },
      { heading: "Lineage", body: ["The original receipt remains immutable. Every re-evaluation is appended to receipt lineage, allowing Decision Explorer to compare what changed in evidence, policy findings, SERV output, human review actions, and final outcome."] },
    ],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    summary: "Diagnose SERV, GitHub, authentication, persistence, webhook, and stale-settings failures.",
    group: "Operate",
    updated: "2026-09-25",
    sections: [
      { heading: "API authentication", bullets: ["401: confirm the project API key is active and sent as a bearer token.", "403: confirm the key permission and project/environment binding; clients cannot override scope.", "429: respect Retry-After and reduce evaluation rate."] },
      { heading: "SERV/contextual reasoning", bullets: ["If contextual reasoning is unavailable, inspect the receipt/provider trace and integration health. Provider failure fails closed and never becomes ALLOW.", "If SERV is not expected, inspect the active policy versions and confirm whether a contextual policy is applicable."] },
      { heading: "GitHub", bullets: ["Disconnected or stale installation: reconnect from Integrations and refresh repository state.", "No repositories: verify the GitHub App installation includes the repository and the active VetoLayer project/environment has selected it.", "Webhook rejection: verify GitHub webhook secret/configuration and inspect integration audit events; do not replace the GitHub App with a personal token."] },
      { heading: "Settings and reviews", bullets: ["SETTINGS_CONFLICT or REVIEW_CONFLICT means another writer changed the record. Refresh, inspect the newest state, and retry intentionally.", "Persistence unavailable in production is a configuration failure; do not rely on development memory mode for durable operational history."] },
    ],
  },
  {
    slug: "release-notes",
    title: "Release notes",
    summary: "What changed in the current product documentation release and the operational surfaces it describes.",
    group: "Reference",
    updated: "2026-09-25",
    sections: [
      { heading: "2026.09 — finished-product hardening", bullets: ["Workspace/project/environment onboarding and RBAC-backed product scoping.", "Production GitHub App integration and Developer Console with scoped API keys and signed webhooks.", "Versioned Policy Studio, operational Human Review, Decision Explorer/Receipt Center, notifications, append-only audit, analytics, and consolidated Settings.", "In-product documentation now links those surfaces to current setup, operating, troubleshooting, and developer references."] },
      { heading: "Compatibility notes", body: ["Developer API scope comes from the project/environment key, not global workspace headers. GitHub uses the installed GitHub App, not user personal-access tokens. Managed Policy Studio versions are authoritative when active; request policies remain only as a migration fallback for scopes without active managed policy."] },
    ],
  },
];

export function getProductDoc(slug: string) {
  return productDocs.find((topic) => topic.slug === slug);
}

export function productDocsByGroup() {
  return ["Start", "Build", "Operate", "Reference"].map((group) => ({
    group,
    topics: productDocs.filter((topic) => topic.group === group),
  })).filter((entry) => entry.topics.length);
}
