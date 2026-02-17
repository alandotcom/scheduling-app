---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Build Planner Runtime Inngest

## Description
Implement planner runtime functions that map lifecycle events to desired journey runs and deliveries using deterministic identity keys, including cancellation and past-due planning semantics.

## Background
The current runtime executes graph nodes directly. Rebuild architecture requires planner-first behavior that computes desired deliveries and emits scheduling/cancel control events.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Planner must create version-pinned runs and deterministic delivery identities from event input.
2. Planner must cancel pending unsent deliveries when reschedule/filter mismatch occurs.
3. Planner must mark past-due planned deliveries as `skipped` with `reasonCode=past_due`.

## Dependencies
- task-06-add-filter-ast-and-constrained-cel-evaluator.code-task.md

## Implementation Approach
1. Write failing planner runtime tests for scheduled match, reschedule mismatch cancellation, duplicate event idempotency, and past-due handling.
2. Implement planning service and Inngest planner function wiring for schedule/cancel emissions.
3. Refactor identity key builders and planner persistence paths to keep behavior deterministic.

## Acceptance Criteria

1. **Matching Events Plan Runs and Deliveries**
   - Given a published journey matching a lifecycle event
   - When planner processes the event
   - Then a run and corresponding deliveries are created deterministically.

2. **Reschedule Mismatch Cancels Pending Deliveries**
   - Given an existing run with pending unsent deliveries
   - When appointment changes invalidate planned eligibility
   - Then planner cancels pending unsent deliveries.

3. **Past Due Deliveries Are Skipped**
   - Given a computed scheduled send time already in the past
   - When planner computes desired deliveries
   - Then delivery is persisted as `skipped` with `reasonCode=past_due`.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: inngest, planner, runtime, idempotency
- **Required Skills**: inngest-runtime, testing
