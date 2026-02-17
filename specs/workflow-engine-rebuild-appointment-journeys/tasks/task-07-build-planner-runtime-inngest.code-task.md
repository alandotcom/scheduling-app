---
status: completed
created: 2026-02-16
started: 2026-02-17
completed: 2026-02-17
---
# Task: Build Planner Runtime in Inngest

## Description
Implement the planner runtime as the source of truth for run and delivery planning, including deterministic identity, idempotent reprocessing, reschedule mismatch cancellation, and independent execution across journeys.

## Background
Planner behavior defines correctness for run creation and delivery planning. This slice must codify the R44 dedupe boundary so matching journeys for the same appointment do not dedupe each other.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Build planner Inngest function(s) that resolve matching journeys, create/update version-pinned runs, and plan deliveries.
2. Use deterministic run/delivery identities to make duplicate planner inputs idempotent.
3. Cancel pending unsent deliveries on reschedule mismatch and persist `skipped` with `reasonCode=past_due` when recomputed time is in the past.
4. Enforce run-scoped dedupe only: the same appointment matching multiple journeys must produce independent run/delivery sets.
5. Provide a checkpoint via planner integration tests for schedule, reschedule, duplicate input, and multi-journey matching.

## Dependencies
- task-06-add-filter-ast-and-constrained-cel-evaluator.code-task.md

## Implementation Approach
1. Write failing planner tests for schedule planning, mismatch cancellation, duplicate idempotency, independent multi-journey execution, and past-due handling.
2. Implement planner event handling, deterministic key construction, and delivery upsert/cancel logic.
3. Refactor planning modules for clear separation of matching, identity, and scheduling responsibilities while keeping tests green.

## Acceptance Criteria

1. **Matching Lifecycle Event Plans Runs and Deliveries**
   - Given a matching published journey
   - When the planner processes an appointment lifecycle event
   - Then a version-pinned run and its planned deliveries are persisted.

2. **Reschedule Mismatch Cancels Pending Unsent Deliveries**
   - Given an existing active run with pending deliveries
   - When planner re-evaluates after reschedule mismatch
   - Then pending unsent deliveries are canceled and past-due deliveries are marked skipped with `past_due`.

3. **Cross-Journey Independence Is Preserved**
   - Given two journeys that both match the same appointment event
   - When planner handles the event
   - Then each journey gets independent run/delivery identities with no cross-journey dedupe.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running planner/runtime tests
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: inngest, planner, runtime, idempotency
- **Required Skills**: event-driven-design, inngest, integration-testing
