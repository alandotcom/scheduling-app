---
status: completed
created: 2026-02-16
started: 2026-02-17
completed: 2026-02-17
---
# Task: Build Delivery Worker and Adapters

## Description
Implement delivery worker execution for scheduled deliveries with cancellation race handling, channel adapter dispatch, status persistence, resend idempotency forwarding, and Logger step sink behavior.

## Background
Worker correctness determines final delivery outcomes. This slice must explicitly satisfy R45: Logger steps must appear in timeline output and emit structured logger/console sink records.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Implement worker behavior to sleep until due time, revalidate eligibility, and dispatch through channel adapters.
2. Use Inngest `cancelOn` and runtime checks to suppress sends on cancel races, persisting `canceled` status.
3. Persist terminal statuses (`sent|failed|canceled|skipped`) and apply provider retry/idempotency semantics.
4. Implement Logger delivery execution to append timeline entries and emit structured output to real logger/console sink.
5. Provide a checkpoint via runtime tests from scheduled event to terminal delivery states including Logger behavior.

## Dependencies
- task-07-build-planner-runtime-inngest.code-task.md

## Implementation Approach
1. Write failing tests for sleep/send success, cancel race suppression, provider failure handling, idempotency forwarding, and logger sink behavior.
2. Implement worker function(s), adapter dispatch layer, and logger execution path.
3. Refactor retry/status persistence paths to keep worker logic deterministic and tests green.

## Acceptance Criteria

1. **Scheduled Delivery Executes or Cancels Correctly**
   - Given a planned delivery and optional cancel control event
   - When worker wakes and revalidates state
   - Then due deliveries send successfully and canceled races are suppressed with `canceled` status.

2. **Failure and Idempotency Semantics Persist Correctly**
   - Given provider failures or resend attempts
   - When worker executes
   - Then failures persist as `failed` with retry behavior and idempotency keys are forwarded.

3. **Logger Step Writes Timeline and Sink Output**
   - Given a Logger step delivery
   - When worker executes the step
   - Then run timeline includes the logger entry and structured output is emitted to logger/console.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running worker/adapter tests
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: inngest, worker, adapters, logging
- **Required Skills**: runtime-orchestration, retry-semantics, integration-testing
