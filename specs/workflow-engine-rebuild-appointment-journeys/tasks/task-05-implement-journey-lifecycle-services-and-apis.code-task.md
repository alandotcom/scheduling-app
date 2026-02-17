---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Implement Journey Lifecycle Services and APIs

## Description
Implement journey lifecycle operations (create, update, publish, pause, resume, delete) with admin-only mutation enforcement, unique naming, version creation on publish, and active-run cancellation on delete.

## Background
Current workflow routes do not expose the new lifecycle semantics required by the design. This slice introduces the core service and route behavior for journey management.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Expose lifecycle APIs for create/update/publish/pause/resume/delete with state transition guards.
2. Enforce admin-only mutation access and unique journey name per org.
3. On publish, create immutable version snapshots; on delete, cancel active runs then hard-delete definition/version records.

## Dependencies
- task-04-replace-journey-persistence-model.code-task.md

## Implementation Approach
1. Write failing service and route integration tests for lifecycle transitions, access control, uniqueness, and delete behavior.
2. Implement lifecycle service methods and route handlers with explicit state validation.
3. Refactor route wiring and serializers to keep API outputs consistent and tests green.

## Acceptance Criteria

1. **Lifecycle Transitions Work**
   - Given a journey in each valid lifecycle state
   - When lifecycle actions are called in valid order
   - Then state transitions succeed and invalid transitions are rejected.

2. **Admin Guard and Uniqueness Enforced**
   - Given a non-admin caller or duplicate journey name request
   - When mutation endpoints are invoked
   - Then requests are rejected with clear authorization or uniqueness errors.

3. **Delete Cancels Active Runs and Hard Deletes Definitions**
   - Given a journey with active runs
   - When delete is executed
   - Then active runs are canceled and definition/version records are hard-deleted.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: api, services, lifecycle, authorization
- **Required Skills**: service-layer, api-routing, testing
