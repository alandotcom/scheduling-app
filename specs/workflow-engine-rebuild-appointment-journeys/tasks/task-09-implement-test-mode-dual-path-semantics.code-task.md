---
status: completed
created: 2026-02-16
started: 2026-02-17
completed: 2026-02-17
---
# Task: Implement Test Mode Dual-Path Semantics

## Description
Implement required test-mode behavior so both `test_only` auto-triggered runs and manual starts create real `mode=test` runs, enforce Email override gating, and keep wait timing identical to live mode.

## Background
The legacy dry-run model is incompatible with required real test execution. This slice introduces explicit `test|live` run separation and R40 timing invariance.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Ensure `test_only` auto-trigger path creates real `mode=test` runs.
2. Ensure manual test-start path creates real `mode=test` runs.
3. Reject test run start when an Email step exists and Email override is missing; do not create send attempts.
4. Keep Slack override optional in v1.
5. Enforce no test-mode wait acceleration: test-mode wait scheduling must match live-mode scheduling for identical configuration.
6. Provide a checkpoint by running tests that compare test and live scheduling outputs and both test-start paths.

## Dependencies
- task-08-build-delivery-worker-and-adapters.code-task.md

## Implementation Approach
1. Write failing tests for auto-trigger and manual test paths, Email override rejection, Slack optional behavior, and wait-timing equivalence.
2. Implement test-mode start paths and override validator while removing dry-run semantics.
3. Refactor run querying/serialization to expose `mode=test|live` consistently while keeping tests green.

## Acceptance Criteria

1. **Auto and Manual Test Paths Create Real Test Runs**
   - Given a `test_only` journey or manual test-start request
   - When run start is triggered
   - Then the run is persisted as `mode=test` and follows normal execution flow.

2. **Email Override Gate Is Enforced**
   - Given a test run configuration containing an Email step and no override destination
   - When run start is requested
   - Then start is rejected with a clear error and no send attempt is created.

3. **Test Wait Scheduling Matches Live Scheduling**
   - Given identical wait-step configuration in test and live runs
   - When scheduling is computed
   - Then planned due timestamps are equivalent with no acceleration path.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running test-mode service/planner tests
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: test-mode, runs, api, planner
- **Required Skills**: service-layer, runtime-semantics, integration-testing
