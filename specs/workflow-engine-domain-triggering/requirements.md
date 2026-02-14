# Requirements Q&A

## Q1
Question: What exact domain event list should be supported at launch (for example, `appointment.created`, `appointment.updated`, `appointment.deleted`, etc.), and which event fields must be included in each event payload for trigger evaluation?

Answer: Support all domain events and include all event fields.

## Q2
Question: Where is the canonical source of truth for “all domain events” in this repo (or should we create one), so triggers can validate event names and payload shapes consistently?

Answer: Canonical source already exists at `packages/dto/src/schemas/domain-event.ts`.

## Q3
Question: Should trigger matching behavior be identical to `../notifications-workflow` (same filtering/rules/execution semantics) with only the event source/type changed, or do you want any behavior differences at launch?

Answer: Keep trigger matching behavior identical to `../notifications-workflow`; only change event source/type.

## Q4
Question: For org-scoped RLS adaptation, should every workflow-related table copied from `../notifications-workflow` include `org_id` and enforce per-org access (no cross-org visibility/execution), consistent with existing protected tables in this repo?

Answer: Yes — include `org_id` and enforce per-org scoped access.

## Q5
Question: Should we copy all workflow engine + UI capabilities from `../notifications-workflow` at launch (builder, node/action types, run history, status controls, etc.) with no intentional feature cuts, unless blocked by oRPC/RLS differences?

Answer: Yes — copy all workflow engine and UI capabilities at launch, except adaptations required by oRPC and org-scoped RLS.

## Q6
Question: When a domain event’s payload schema changes in the future, should existing workflows evaluate against the latest schema immediately, or should workflows be pinned to the schema version they were created with?

Answer: Use current/latest schema; schema evolution is always backward compatible.

## Q7
Question: What delivery guarantee should workflow triggering assume for domain events (`at-most-once`, `at-least-once`, or `exactly-once` best effort), and should duplicate event deliveries be deduplicated by event ID?

Answer: Exactly-once semantics; use Inngest deduplication by event ID.

## Q8
Question: At launch, should webhook-event-triggered workflows remain supported in parallel, or should triggers be fully replaced so workflows only bind to domain event types?

Answer: Webhook delivery remains a separate feature; workflows should use the same domain events and payloads, not a separate webhook-specific event model.

## Q9
Question: Should workflow triggering consume the exact same emitted domain-event stream used by webhook delivery (single producer, two consumers), with no workflow-specific event transformation layer?

Answer: Yes — reuse the exact same domain-event stream used by webhook delivery, with no workflow-specific event transformation.

## Q10
Question: For database setup, should we follow this repo’s active-dev rule by updating the initial SQL migration/schema directly (no incremental migration), then reset/push schema + reseed as needed?

Answer: Yes — update initial schema directly (no incremental migration), then reset/push schema and reseed as needed.

## Q11
Question: Who should be allowed to create/edit/enable/disable/delete workflows at launch (for example, all authenticated org members vs admin-only roles)?

Answer: Admin-only for create/edit/enable/disable/delete operations.

## Q12
Question: Should viewing workflows and workflow run history also be admin-only, or read-only for all authenticated org members?

Answer: Read-only access.

## Q13
Question: Should run-time behavior defaults (retry policy, timeout, concurrency controls, failure handling) be copied exactly from `../notifications-workflow` unless technically incompatible?

Answer: Yes — copy run-time defaults exactly, unless technically incompatible.

## Q14
Question: Should we lock implementation against a specific `../notifications-workflow` commit/tag for parity, or just use whatever is currently on its local default branch?

Answer: Use what is currently on `main`.

## Q15
Question: Do you want demo/seed data for workflows (templates, sample runs, etc.) added to `pnpm db:seed`, or should workflow tables start empty by default?

Answer: No workflow demo/seed data; workflow tables should start empty.


## Status
Requirements clarification marked complete by user.
