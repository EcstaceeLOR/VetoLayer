# Operational analytics and reporting

Issue #63 upgrades VetoLayer's compact Overview health snapshot into a production reporting surface at `/dashboard/analytics`.

## Source of truth

Operational analytics are derived from persisted product records only:

- `vetolayer_decisions` / `DecisionStore` for outcomes, policy findings, evidence state, execution channel, SERV usage and receipt lineage
- operational review cases for turnaround, aging and re-evaluation outcomes
- append-only integration-category audit events for connection failures, revocations and disconnects
- workspace/project/environment persistence for report dimensions

Seeded `demo` decisions are always excluded from operational metrics. The report surfaces how many matching demo receipts were excluded instead of silently blending examples into production trends.

## Shared filters

One validated filter object drives every card, trend, table, drill-down and export:

- from / to date range
- workspace (always fixed by authentication)
- optional project
- optional environment belonging to that project/workspace

Quick ranges are available for 7, 30, 90, 180 and 365 days. Historical archived projects/environments remain valid reporting dimensions because their persisted decisions remain part of governance history.

## Metrics

The report includes:

- ALLOW / REVIEW / BLOCK counts and trends
- governance-friction rate (`REVIEW + BLOCK`) plus change between the earlier and later halves of the selected decision series
- volume by project, environment and execution channel/integration tool
- policies associated with failed/uncertain findings on REVIEW/BLOCK decisions
- review cohort creation/resolution, average/median turnaround and unresolved aging buckets
- evidence completeness, decisions with missing evidence and top missing requirements
- deterministic-only vs SERV-assisted decisions
- SERV fallback rate, average/P95 latency and aggregate token counts when safely present in signed receipts
- re-evaluation outcomes and reasons (evidence change, approval, rejection)
- integration audit-event failure/disconnect rate

Policy friction aggregates immutable version references back to their logical policy ID (`policy@v3` → `policy`) so teams can see whether a logical policy is driving friction across versions. The Decision Explorer remains the source for exact version-level receipt investigation.

## Review-window semantics

Review turnaround and unresolved-aging cards use review cases created inside the selected date range and matching the same project/environment scope. Resolution is evaluated as of the report's `to` boundary, making historical reports deterministic instead of using a future resolution that had not happened yet.

Re-evaluation metrics use lineage entries whose re-evaluation timestamp falls inside the selected range.

## Privacy and provider telemetry

The Analytics report never exposes raw evidence payloads, prompts, model responses, provider endpoints, provider model names or provider request IDs.

For SERV, only these safe aggregates are consumed when present:

- provider status (`ok` / `fallback`)
- latency in milliseconds
- prompt/completion/total token counts

Detailed signed receipt investigation remains in Receipt Center and keeps its existing authorization and export protections.

## Drill-downs

Outcome, policy, project, environment, execution-channel and SERV metrics link directly into the existing Decision Explorer with the same date/project/environment scope. Review metrics link to the operational review queue. Integration reliability links to the append-only audit log.

This keeps analytics explanatory rather than becoming a disconnected warehouse of numbers.

## Export

`GET /api/analytics/export?format=csv|json` requires the same `decisions.read` permission as the report.

- JSON contains the aggregate `OperationalAnalyticsReport` only.
- CSV flattens aggregate report sections into `section,metric,dimension,value` rows.
- both responses are `private, no-store` and use attachment filenames containing the report dates.
- no raw receipt/evidence payload is included.

## Online-report bounds

The interactive report scans at most 5,000 matching persisted decisions and 5,000 matching audit events per request. If a selected scope exceeds either bound, the UI marks the report as truncated and asks the operator to narrow the window/project/environment. VetoLayer does not silently present a bounded sample as an exact total.

Review persistence is loaded through the existing workspace-scoped review store. If an installation grows beyond the current online reporting envelope, the next scaling step is a server-side aggregate/materialized reporting layer; the metric contract in `lib/operational-analytics.ts` remains the stable product interface.

## Low/no-data behavior

Charts and tables render explicit empty states. No seeded examples or generated values are inserted to make production analytics look populated.
