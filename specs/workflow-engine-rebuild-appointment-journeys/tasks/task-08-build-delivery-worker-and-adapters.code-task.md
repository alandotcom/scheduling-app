---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Build Delivery Worker and Adapters

## Description
Implement delivery worker runtime behavior that waits until due, revalidates eligibility, dispatches through channel adapters, and persists terminal states with cancellation race handling.

## Background
Planner-only logic is insufficient without a worker to execute sends. Worker must honor cancellation control events and keep delivery status transitions deterministic.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Worker must sleep until due time and execute send only if delivery remains eligible.
2. Worker must suppress sends on cancellation races and persist `canceled` status.
3. Worker must persist `sent|failed|canceled|skipped` terminal statuses and forward idempotency keys for resend safety.

## Dependencies
- task-07-build-planner-runtime-inngest.code-task.md

## Implementation Approach
1. Write failing runtime tests for send success, cancel race, provider failure/retry, and idempotency forwarding.
2. Implement worker function, adapter dispatch integration, and state persistence transitions.
3. Refactor cancellation and status update paths to ensure idempotent, race-safe behavior.

## Acceptance Criteria

1. **Due Deliveries Send Successfully**
   - Given a scheduled eligible delivery reaches due time
   - When worker executes
   - Then message dispatch occurs and delivery persists as `sent`.

2. **Cancel Race Suppresses Send**
   - Given a cancellation control event arrives before send execution
   - When worker wakes or processes cancellation
   - Then no channel send occurs and delivery persists as `canceled`.

3. **Provider Failure Persists Failed State**
   - Given adapter dispatch fails after retry policy execution
   - When worker completes
   - Then delivery persists as `failed` with error context.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: inngest, worker, delivery, adapters
- **Required Skills**: inngest-runtime, adapter-integration, testing
