# Implementation Plan

## Checklist
- [x] Step 1: Add workflow DTO schemas and contracts
- [x] Step 2: Add workflow DB schema with org-scoped RLS
- [x] Step 3: Implement minimal workflow repositories and CRUD services
- [x] Step 4: Expose workflow CRUD via oRPC and wire basic admin UI list
- [x] Step 5: Add domain-event trigger evaluation and minimal run start path
- [x] Step 6: Add full trigger orchestration (start/restart/stop/ignore + wait-state resume)
- [x] Step 7: Add execution history/logs/events/status/cancel APIs
- [x] Step 8: Add current-workflow autosave and duplicate/visibility parity APIs
- [x] Step 9: Port workflow editor core UI (routes, store, canvas, autosave)
- [x] Step 10: Port workflow config, trigger UI, and run panels with role-aware behavior
- [x] Step 11: Complete authorization hardening and idempotency/dedupe safeguards
- [x] Step 12: End-to-end validation, regression tests, and documentation updates

## Step 1: Add workflow DTO schemas and contracts
### Objective
Create workflow DTO modules (graph, trigger config, CRUD payloads, execution contracts) matching reference behavior and canonical domain events.

### Implementation Guidance
- Add new `packages/dto/src/schemas/workflow*.ts` modules.
- Port reference workflow schema/contracts and adapt trigger config from webhook-based to domain-event-based routing sets.
- Export through `packages/dto/src/schemas/index.ts` and package root exports.

### Test Requirements
- Add schema parsing tests for valid/invalid workflow graphs.
- Add contract tests for execution response unions (`running/cancelled/ignored/resumed`).
- Add tests for domain event routing config validation against canonical event types.

### Integration Notes
- Keep schemas consumable by both API and admin UI immediately.

### Demo Description
- Run DTO tests showing valid workflow payloads parse and invalid payloads fail with expected errors.

## Step 2: Add workflow DB schema with org-scoped RLS
### Objective
Create all workflow tables in `packages/db` with `org_id`, RLS policies, indexes, and relations.

### Implementation Guidance
- Update `packages/db/src/schema/index.ts` with workflow tables.
- Update `packages/db/src/relations.ts` with table relations.
- Update initial migration SQL and snapshot directly per active-dev rule (no incremental migration file for this feature).
- Ensure index strategy preserves reference query paths with `org_id` prefixes.

### Test Requirements
- Add RLS tests proving cross-org access is blocked.
- Add tests for unique constraints and key indexes (name uniqueness per org, run-id uniqueness strategy).

### Integration Notes
- All workflow tables should be queryable under `withOrg(orgId, ...)`.

### Demo Description
- Run DB tests showing org-isolated reads/writes and successful schema bootstrap.

## Step 3: Implement minimal workflow repositories and CRUD services
### Objective
Build repository/service layer for workflows (list/get/create/update/delete) using org context.

### Implementation Guidance
- Add `apps/api/src/repositories/workflows.ts` and service modules mirroring existing repository/service patterns.
- Enforce workflow name uniqueness per org and graph validation via DTO schema.
- Return API-ready shapes compatible with future UI usage.

### Test Requirements
- Unit tests for service validation and conflict handling.
- Integration tests for CRUD in one org and isolation from another org.

### Integration Notes
- Reuse `withOrg` and existing `ApplicationError`/oRPC error mapping patterns.

### Demo Description
- Create a workflow, update it, list it, and delete it via service tests with org isolation confirmed.

## Step 4: Expose workflow CRUD via oRPC and wire basic admin UI list
### Objective
Expose workflow CRUD through oRPC routes and replace stub list with real data.

### Implementation Guidance
- Add `apps/api/src/routes/workflows.ts` and register under `uiRouter`.
- Use `authed` for reads and `adminOnly` for writes.
- Update admin UI workflow list route/page to load from oRPC query and reflect permissions.

### Test Requirements
- Route tests for authz matrix (member read allowed, member write forbidden).
- UI test: list renders API data for both admin/member roles.

### Integration Notes
- This establishes first usable end-to-end workflow management path.

### Demo Description
- In admin UI, workflows list loads persisted workflows and shows write actions only for admin.

## Step 5: Add domain-event trigger evaluation and minimal run start path
### Objective
Introduce domain-event trigger definition and a minimal runtime path that starts executions from domain events.

### Implementation Guidance
- Port trigger registry infrastructure to API/shared layer.
- Add `DomainEvent` trigger evaluation with canonical event type and correlation key mapping by domain prefix.
- Add minimal execution creation + enqueue run request behavior.

### Test Requirements
- Trigger evaluation tests for event type extraction and correlation key mapping.
- Integration test for domain event causing execution row creation and run enqueue request.

### Integration Notes
- Keep orchestration minimal at this step (`start` path only), then expand in Step 6.

### Demo Description
- Emit a domain event and observe a workflow execution starts and is persisted.

## Step 6: Add full trigger orchestration (start/restart/stop/ignore + wait-state resume)
### Objective
Match reference trigger orchestration behavior completely.

### Implementation Guidance
- Port orchestrator and wait-state helper logic.
- Add restart/stop/ignore handling and wait-state resume/cancel transitions.
- Preserve response contract semantics from reference.

### Test Requirements
- Orchestrator table-driven tests for all routing decisions.
- Wait-state tests for resume/cancel transitions and ignored outcomes.

### Integration Notes
- Keep behavior identical to reference unless technically incompatible.

### Demo Description
- Show event-driven outcomes for start/restart/stop/ignore on a test workflow with waiting runs.

## Step 7: Add execution history/logs/events/status/cancel APIs
### Objective
Expose full run observability and control APIs needed by workflow runs UI.

### Implementation Guidance
- Add execution list/details/logs/events/status/cancel procedures in workflow routes.
- Ensure all queries are org-scoped and permissioned (read for authed, cancel for admin).

### Test Requirements
- Route tests for each endpoint, including not-found and forbidden paths.
- Integration tests verifying execution artifacts are returned in expected order.

### Integration Notes
- Use consistent pagination/ordering conventions from existing routes.

### Demo Description
- Query workflow runs and retrieve logs/events/status for a specific execution; cancel as admin.

## Step 8: Add current-workflow autosave and duplicate/visibility parity APIs
### Objective
Complete parity-oriented management APIs (`current` autosave, duplicate, visibility/isOwner fields).

### Implementation Guidance
- Add `workflows.current.get/save` procedures.
- Add duplicate workflow behavior with copied graph and reset runtime-only node state.
- Preserve visibility/isOwner parity fields while retaining org-role authz rules.

### Test Requirements
- Tests for current-workflow create/update behavior.
- Tests for duplicate behavior and conflict handling.

### Integration Notes
- Keep parity with reference defaults unless blocked by repo constraints.

### Demo Description
- Save current workflow draft, duplicate an existing workflow, and verify response fields.

## Step 9: Port workflow editor core UI (routes, store, canvas, autosave)
### Objective
Replace stub workflow route with functional editor shell and persisted state behavior.

### Implementation Guidance
- Add editor route `/_authenticated/workflows/$workflowId`.
- Port/adapt core store, canvas, and autosave interactions to target admin-ui architecture.
- Integrate with oRPC query/mutation APIs.

### Test Requirements
- UI tests for route load, graph rendering, and autosave mutation calls.
- Store tests for core node/edge state transitions.

### Integration Notes
- Keep component structure close to reference while adapting imports/primitives.

### Demo Description
- Open a workflow in editor, move/add nodes, and observe autosave persistence.

## Step 10: Port workflow config, trigger UI, and run panels with role-aware behavior
### Objective
Complete editor UX: node config, domain trigger config, run history/log/event panels, and role-based interactivity.

### Implementation Guidance
- Port config panels and runs UI components.
- Adapt trigger config UI to domain-event routing sets (not webhook paths).
- Enforce read-only mode for members and writable mode for admins.

### Test Requirements
- UI tests for trigger config validation and save behavior.
- UI tests verifying member read-only lockouts and admin write controls.

### Integration Notes
- Ensure UI behavior aligns with API authz for defense in depth.

### Demo Description
- Admin edits trigger routing and runs a workflow; member can view but cannot modify/execute.

## Step 11: Complete authorization hardening and idempotency/dedupe safeguards
### Objective
Harden edge cases around role enforcement and exactly-once expectations.

### Implementation Guidance
- Audit all workflow mutations for `adminOnly` usage.
- Ensure dedupe/idempotency keys are consistent from event ingress through execution persistence.
- Add explicit handling for duplicate/late events where needed.

### Test Requirements
- Security regression tests for role boundary violations.
- Idempotency tests for duplicate event delivery scenarios.

### Integration Notes
- Keep operational semantics explicit in logs/metrics for troubleshooting.

### Demo Description
- Replay the same event and verify no duplicate side effects beyond intended idempotent behavior.

## Step 12: End-to-end validation, regression tests, and documentation updates
### Objective
Finish with full verification and maintainability updates.

### Implementation Guidance
- Run full test suites for impacted packages.
- Validate formatting, linting, and typechecking at repo level.
- Update docs for workflow architecture, trigger model, and operational notes.

### Test Requirements
- Full relevant package tests + targeted end-to-end smoke tests.
- Confirm no regressions in existing webhook delivery behavior.

### Integration Notes
- Keep this step focused on stabilization, not new feature scope.

### Demo Description
- Demonstrate complete flow: create workflow, emit domain event, observe execution, inspect run history, verify member read-only access.
