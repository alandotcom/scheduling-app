---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Cutover Admin Builder to Linear Journeys

## Description
Replace graph-based workflow authoring UI with a linear journey builder that supports only v1 step types, linear sequencing, grouped AST filters, and lifecycle controls for draft/publish/pause/test-only states.

## Background
Current editor supports branching/switching and legacy action sets that conflict with journey constraints. UI must align with strict linear contracts to avoid invalid payloads.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Builder must expose only Trigger, Wait, Send Message, and Logger steps.
2. Builder must enforce linear step ordering and remove branch/switch controls.
3. Filter builder must enforce one-level grouping and cap limits consistent with backend AST constraints.

## Dependencies
- task-09-implement-test-mode-dual-path-semantics.code-task.md

## Implementation Approach
1. Write failing UI tests for step availability, linear editing constraints, grouped filter caps, and state controls.
2. Implement linear builder and filter UI mapped to new journey DTO payloads.
3. Refactor/remove legacy graph editor state/actions while preserving existing design system patterns.

## Acceptance Criteria

1. **Only V1 Steps Are Authorable**
   - Given an admin creates or edits a journey
   - When opening step selection
   - Then only Trigger, Wait, Send Message, and Logger are available.

2. **Non-Linear Authoring Is Prevented**
   - Given an admin attempts to create branch/switch structures
   - When interacting with the builder
   - Then UI blocks non-linear structures and produces validation feedback.

3. **Filter Builder Enforces AST Limits**
   - Given an admin edits grouped filters
   - When group depth or cap limits are exceeded
   - Then UI validation blocks submission with clear errors.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: admin-ui, builder, validation, journeys
- **Required Skills**: react-ui, tanstack-stack, testing
