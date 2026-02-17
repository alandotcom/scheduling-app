---
status: completed
created: 2026-02-16
started: 2026-02-17
completed: 2026-02-17
---
# Task: Implement Journey Lifecycle Services and APIs

## Description
Implement journey lifecycle endpoints and service behavior for create/update/publish/pause/resume/delete, including admin mutation guards, publish versioning, and explicit run-cancel scope for both individual and bulk cancellation.

## Background
Journey lifecycle behavior is the operational API surface for the rebuild and must include R31 semantics: individual run cancel and journey-level bulk cancel.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Implement lifecycle transitions and guards for create/update/publish/pause/resume/delete.
2. Enforce admin-only mutation access and unique journey name per org.
3. On publish, create immutable version snapshots; on delete, auto-cancel active runs and hard-delete definitions/versions.
4. Implement both run-cancel scopes: individual active run cancel and journey-level bulk cancel across active runs.
5. Provide a checkpoint by executing API tests for lifecycle transitions and both cancel paths.

## Dependencies
- task-04-replace-journey-persistence-model.code-task.md

## Implementation Approach
1. Write failing tests for lifecycle transitions, authorization, uniqueness, individual run cancel, bulk cancel, and delete behavior.
2. Implement service methods and route handlers with explicit state transition and scope rules.
3. Refactor route contracts/serializers so lifecycle responses and cancellation semantics remain clear and tests stay green.

## Acceptance Criteria

1. **Lifecycle Transition Semantics Are Enforced**
   - Given journeys in valid and invalid lifecycle states
   - When lifecycle actions are requested
   - Then valid transitions succeed and invalid transitions are rejected.

2. **Authorization and Name Constraints Hold**
   - Given non-admin mutation attempts or duplicate journey names
   - When lifecycle endpoints are called
   - Then requests fail with authorization or uniqueness errors.

3. **Individual and Bulk Cancel Scopes Are Correct**
   - Given active runs for one or more journeys
   - When individual run cancel or journey-level bulk cancel is executed
   - Then only the intended scope is canceled and already terminal runs remain idempotent no-ops.

4. **Delete Hard-Deletes Definitions While Preserving Run Records**
   - Given a journey with active and historical runs
   - When delete is executed
   - Then active runs are canceled and definition/version records are hard-deleted without erasing historical run visibility.

5. **Unit Tests Pass**
   - Given the implementation is complete
   - When running journey service/route tests
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: api, services, lifecycle, authorization, cancellation
- **Required Skills**: service-layer, api-routing, integration-testing
