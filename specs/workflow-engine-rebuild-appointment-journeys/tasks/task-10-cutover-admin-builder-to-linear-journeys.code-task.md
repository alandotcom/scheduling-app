---
status: completed
created: 2026-02-16
started: 2026-02-17
completed: 2026-02-17
---
# Task: Cut Over Admin Builder to Linear Journeys

## Description
Replace graph workflow authoring UX with a linear journey builder that supports only v1 step types and grouped filter AST editing with required cap and depth limits.

## Background
The current UI still exposes branch/switch controls and non-v1 actions. This task aligns authoring UX with strict journey contracts.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Remove branch/switch authoring controls and non-v1 step options from the builder.
2. Implement linear step editing/ordering UX for Trigger, Wait, Send Message, and Logger only.
3. Implement grouped filter AST builder enforcing one-level nesting and cap limits.
4. Expose journey state controls for `draft`, `published`, `paused`, and `test_only`.
5. Provide a checkpoint by creating and publishing a valid linear journey from UI tests/fixtures.

## Dependencies
- task-09-implement-test-mode-dual-path-semantics.code-task.md

## Implementation Approach
1. Write failing UI tests for step availability, linear editing validation, filter builder caps/depth, and state controls.
2. Implement linear builder/store changes and payload mapping to new journey DTO contracts.
3. Refactor legacy workflow graph UI components out of the active route path while keeping tests green.

## Acceptance Criteria

1. **Only V1 Linear Authoring Is Available**
   - Given the journey builder UI
   - When authors add and reorder steps
   - Then only Trigger/Wait/Send Message/Logger are available and non-linear controls are absent.

2. **Filter Builder Enforces AST Constraints**
   - Given grouped filter editing in the UI
   - When depth or cap limits are exceeded
   - Then client-side validation blocks invalid payload creation.

3. **Lifecycle Controls Match Journey States**
   - Given a draft or published journey
   - When users trigger lifecycle actions
   - Then controls map to `draft|published|paused|test_only` contract behavior.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running builder/UI contract tests
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: admin-ui, builder, journeys, ux
- **Required Skills**: react, state-management, frontend-testing
