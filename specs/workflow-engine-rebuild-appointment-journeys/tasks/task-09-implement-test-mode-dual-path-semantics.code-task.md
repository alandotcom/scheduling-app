---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Implement Test Mode Dual Path Semantics

## Description
Implement required test-mode behavior so both auto-triggered `test_only` journeys and manual test starts create real `mode=test` runs, with Email override enforced before run start.

## Background
Current `dryRun` behavior bypasses real execution and does not satisfy the accepted A68 semantics. This slice replaces dry-run semantics with real test run behavior.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. `test_only` auto-trigger path must create real runs with `mode=test`.
2. Manual test-start path must create real runs with `mode=test`.
3. Email step requires a single override destination string before test run start; missing value rejects start and prevents send attempts.

## Dependencies
- task-08-build-delivery-worker-and-adapters.code-task.md

## Implementation Approach
1. Write failing tests for both test run start paths and Email override gating behavior.
2. Implement run-start validation and mode assignment for auto and manual paths.
3. Refactor legacy `dryRun` branches and update contracts/queries to expose `test|live` mode consistently.

## Acceptance Criteria

1. **Auto Triggered Test-Only Runs Use Test Mode**
   - Given a journey in `test_only` state matches a lifecycle event
   - When planner starts a run
   - Then the created run is persisted as `mode=test`.

2. **Manual Test Start Uses Test Mode**
   - Given a manual test start request for an appointment
   - When run start succeeds
   - Then the created run is persisted as `mode=test` and executes normally.

3. **Email Override Is Required for Test Runs**
   - Given a test run path includes an Email step and no override destination
   - When run start is requested
   - Then start is rejected with a clear validation error and no send attempt is created.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: Medium
- **Labels**: test-mode, runtime, api, validation
- **Required Skills**: api-contracts, runtime-control, testing
