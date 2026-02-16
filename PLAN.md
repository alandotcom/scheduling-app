# Workflow Runtime + Runs UI Refactor Plan

## Goal

Make workflow execution order deterministic and understandable, make Inngest traces useful for node-level debugging, and align Runs UI behavior with the reference experience.

## Current Status

- ✅ Phase 1 complete
- ✅ Phase 2 complete
- ✅ Phase 3 complete (consolidation + cleanup)

## Problem Summary

- Current `workflow/run.requested` executes as one long handler with limited step segmentation.
- Wait nodes can make branch progress feel out-of-order due to queue-driven execution.
- Runs event/log rendering is reverse chronological, which is hard to reason about.
- Runtime orchestration, action execution, templating, and persistence are too tightly coupled.

---

## Phase 1: Stabilize UX + Observability

### Objectives

- Make run timelines readable and consistent.
- Improve immediate debuggability without changing the full runtime architecture yet.

### Work

1. Runs timeline ordering and presentation
   - Render selected run events/logs oldest -> newest in UI.
   - Keep selected execution card pinned above other runs.
   - Ensure clear behavior resets run overlays when leaving Runs tab.

2. Audit event clarity
   - Include `nodeId` and `nodeName` metadata for `run.log` events.
   - Ensure event messages distinguish logger nodes and branch paths.

3. Inngest trace visibility (minimum segmentation)
   - Add `step.run(...)` wrappers for major node lifecycle boundaries (`start`, `execute`, `complete`) to avoid a single opaque trace span.

### Acceptance Criteria

- Selected run timeline reads top-to-bottom in execution order.
- Logger events clearly indicate which node produced them.
- Inngest UI shows per-node step boundaries instead of only one long function segment.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.

### Completion Snapshot (Implemented)

- [x] Runs timeline ordering and presentation updates are in place
  - Oldest -> newest ordering for selected execution events/logs in `apps/admin-ui/src/features/workflows/workflow-runs-panel.tsx`
  - Selected execution details render above other runs in `apps/admin-ui/src/features/workflows/workflow-runs-panel.tsx`
  - Run overlays reset when leaving Runs tab via panel cleanup + tab unmount in `apps/admin-ui/src/features/workflows/workflow-runs-panel.tsx` and `apps/admin-ui/src/features/workflows/workflow-editor-sidebar.tsx`
- [x] Audit event clarity is improved for logger activity
  - `run.log` includes `nodeId` and `nodeName` metadata in `apps/api/src/services/workflow-run-requested.ts`
  - Logger event messages include node label context in `apps/api/src/services/workflow-run-requested.ts`
- [x] Inngest trace segmentation is no longer one opaque span
  - Runtime step boundaries are wired via `step.run(...)` bridge in `apps/api/src/inngest/functions/workflow-run-requested.ts`
  - Node and wait lifecycle steps are emitted from `apps/api/src/services/workflow-run-requested.ts`

### Validation Status

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`

---

## Phase 2: Runtime Architecture Refactor (Core)

### Objectives

- Replace queue-first execution with dependency-ready scheduling.
- Ensure waits pause only their branch, not unrelated ready branches.
- Make retries/replays idempotent and explicit.

### Work

1. Introduce a scheduler layer
   - Compute node readiness from graph dependencies (fan-out parallel, fan-in gated).
   - Track node execution state as first-class runtime state.

2. Split execution responsibilities
   - Orchestrator/scheduler module.
   - Action executors (wait, switch, condition, http-request, logger).
   - Event/log persistence adapter.

3. Wait handling redesign
   - Wait node persists state and exits branch cleanly.
   - Resume path continues from that node and schedules downstream ready nodes only.
   - No duplicate wait/log events on replay.

4. Idempotency + ordering guarantees
   - Deterministic node keys for lifecycle events.
   - Safe re-entry behavior for already-successful nodes.
   - Explicit branch-level continuation rules.

### Acceptance Criteria

- Parallel branches execute independently when ready.
- Wait in one branch does not delay sibling branch execution.
- Replay/resume does not duplicate node completion semantics.
- Inngest trace and DB logs agree on node order/state transitions.
- New integration tests cover parallel branch + wait + logger scenarios.

### Completion Snapshot (Implemented)

- [x] Scheduler layer extracted and used by runtime orchestration
  - `apps/api/src/services/workflow-runtime/scheduler.ts`
  - Readiness is dependency-gated; fan-out can execute ready siblings in parallel; fan-in waits for all incoming nodes.
- [x] Execution responsibilities split into explicit modules
  - Orchestration entrypoint: `apps/api/src/services/workflow-run-requested.ts`
  - Scheduler: `apps/api/src/services/workflow-runtime/scheduler.ts`
  - Action executors: `apps/api/src/services/workflow-runtime/action-executors.ts`
  - Persistence adapter: `apps/api/src/services/workflow-runtime/persistence.ts`
  - Runtime contracts/types: `apps/api/src/services/workflow-runtime/contracts.ts`, `apps/api/src/services/workflow-runtime/types.ts`
- [x] Wait handling redesign implemented
  - Wait state persistence + waiting/resumed event lifecycle in `action-executors.ts`
  - Resume continues through normal readiness scheduling without duplicating wait state transitions.
- [x] Idempotency + ordering guarantees strengthened
  - Deterministic node step IDs from stable node-label slugs in `workflow-run-requested.ts`
  - Re-entry reuses prior successful node logs instead of re-running successful nodes.
- [x] Test coverage includes parallel branch + wait + logger + fan-in gating
  - `apps/api/src/services/workflow-run-requested.test.ts`
  - Includes: sibling wait/logger behavior, resumed wait without duplicate semantics, and fan-in join waiting for both parents.

### Validation Status

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`

---

## Phase 3: Consolidation + Cleanup

### Objectives

- Reduce long-term entropy and maintenance cost.
- Keep runtime behavior testable and easy to reason about.

### Work

1. Remove obsolete logic
   - Delete queue-specific transitional paths and redundant guards.
   - Remove no-longer-needed repository helper methods introduced for stop-gap replay behavior.

2. Harden contracts
   - Normalize execution event taxonomy (`run.*` vs `node.*`).
   - Document ordering guarantees and status transitions.

3. Test and docs upgrade
   - Add architecture notes for workflow execution lifecycle.
   - Expand tests for cancellation edge cases and retry boundaries.

### Acceptance Criteria

- Runtime service size and complexity are reduced via modular boundaries.
- Event vocabulary and ordering are documented and consistent.
- No dead or duplicate execution pathways remain.
- Full repo quality gates remain green.

### Completion Snapshot (Implemented)

- [x] Obsolete and transitional runtime logic removed or consolidated
  - Removed duplicate domain-event pre-check path in `apps/api/src/services/workflow-domain-triggers.ts` and now rely on DB uniqueness + insert handling.
  - Removed unused repository helper `findExecutionByTriggerEventId` from `apps/api/src/repositories/workflows.ts`.
  - Consolidated cancellation request and persistence flows in `apps/api/src/services/workflow-cancellation.ts`, reused by `workflows.ts` and `workflow-domain-triggers.ts`.
- [x] Execution event taxonomy normalized and centralized
  - Added shared execution event constants in `apps/api/src/services/workflow-execution-events.ts`.
  - Standardized persisted cancellation event naming to `run.cancel.requested`.
- [x] Cancellation/replay edge-case tests expanded
  - Added runtime terminal/replay/cancel-during-wait tests in `apps/api/src/services/workflow-run-requested.test.ts`.
  - Added stop-routing partial-cancel boundary coverage in `apps/api/src/services/workflow-domain-triggers.test.ts`.
  - Added cancellation conflict and send-failure route coverage in `apps/api/src/routes/workflows.test.ts`.
  - Added `retries: 0` assertion in `apps/api/src/inngest/functions/workflow-run-requested.test.ts`.
- [x] Workflow runtime lifecycle docs added and stale links cleaned up
  - Added `docs/guides/workflow-execution-lifecycle.md` with lifecycle/status/event/ordering guarantees.
  - Linked lifecycle guide from `docs/guides/workflow-engine-domain-events.md`.
  - Updated broken runtime plan/reference links in `docs/ARCHITECTURE.md`, `docs/README.md`, and `docs/plans/README.md`.

### Validation Status

- [x] `pnpm format`
- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`

---

## Suggested Implementation Order

1. Complete all Phase 1 UI/observability changes first (low risk, high immediate clarity).
2. Implement Phase 2 scheduler and branch/wait correctness.
3. Finish with Phase 3 cleanup and docs in the same PR series to avoid long-lived transitional states.
