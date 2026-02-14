# Objective
Implement the workflow engine + editor UI in this repo by porting parity behavior from `../notifications-workflow` while adapting trigger ingress to canonical domain events, adapting API to oRPC, and adapting data to org-scoped RLS.

# Source of Truth
- Use `specs/workflow-engine-domain-triggering/` as the authoritative spec package.
- Primary docs:
  - `design.md`
  - `plan.md`
  - `requirements.md`
  - `research/*.md`

# Key Requirements
- Copy workflow engine + UI capabilities (builder, runs, logs/events, execute/cancel, duplicate, current autosave) unless technically incompatible.
- Trigger workflows from canonical domain events (not webhook trigger model).
- Use existing canonical event schemas: `packages/dto/src/schemas/domain-event.ts`.
- Reuse existing domain event stream/payloads emitted in API services.
- Keep trigger/orchestration behavior parity: `start`, `restart`, `stop`, `ignore`.
- Enforce admin-only write operations and read-only workflow visibility for authenticated members.
- Add workflow tables with `org_id` and org-scoped RLS on all workflow-related tables.
- Follow active-dev DB policy: update initial schema/migration directly; no new incremental migration for this feature.
- Keep exactly-once behavior as best effort via Inngest dedupe + idempotency.
- Keep webhook delivery feature separate (do not regress existing webhook delivery behavior).

# Implementation Constraints
- Repo conventions must be followed (oRPC route style, Drizzle schema patterns, RLS + `withOrg` context).
- Do not introduce backward-compatibility shims or feature flags.
- No workflow seed/demo data by default.
- Ensure tests, lint, format, and typecheck pass.

# Acceptance Criteria (Given-When-Then)
1. Given an authenticated member, when listing workflows, then only org-scoped workflows are visible and write actions are forbidden.
2. Given an authenticated admin, when creating/updating/deleting/executing workflows, then operations succeed within active org only.
3. Given another org’s workflow ID, when accessed, then response is not visible across org boundary (`NOT_FOUND`/isolated behavior).
4. Given canonical domain event emission, when event is processed, then trigger evaluation uses event type + payload without transformation layer.
5. Given routing decision `start`, when event arrives, then a new execution is created and run is enqueued.
6. Given routing decision `restart`, when matching waits exist, then waits are cancelled and a replacement run starts.
7. Given routing decision `stop`, when matching waits exist, then waits are cancelled and no new run starts.
8. Given unconfigured event routing, when event arrives, then outcome is `ignored` with explicit reason.
9. Given duplicate delivery of same dedupe identity, when processed, then side effects remain idempotent.
10. Given member role in editor, when attempting mutation actions, then UI is read-only and API rejects writes.
11. Given admin role in editor, when editing graph/config, then autosave and explicit save persist updates.
12. Given executions exist, when viewing runs/logs/events/status, then persisted execution artifacts are returned correctly.
13. Given backward-compatible schema evolution, when existing workflows evaluate triggers, then current schema remains valid.
14. Given DB bootstrap, when workflow tables are initialized, then they start empty (no workflow seed rows).

# Execution Order
Follow `specs/workflow-engine-domain-triggering/plan.md` Step 1 through Step 12 in order.
