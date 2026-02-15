# Workflow Runtime + Runs UI Refactor Plan

## Goal

Make workflow execution order deterministic and understandable, make Inngest traces useful for node-level debugging, and align Runs UI behavior with the reference experience.

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

---

## Suggested Implementation Order

1. Complete all Phase 1 UI/observability changes first (low risk, high immediate clarity).
2. Implement Phase 2 scheduler and branch/wait correctness.
3. Finish with Phase 3 cleanup and docs in the same PR series to avoid long-lived transitional states.
