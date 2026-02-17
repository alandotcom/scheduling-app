---
status: completed
created: 2026-02-16
started: 2026-02-17
completed: 2026-02-17
---
# Task: Update Runs UI, Overlap Warnings, and History Views

## Description
Update journey runs and publish UX to show test/live run modes, logger timeline details, reason codes, explicit run-cancel scope actions, publish-time overlap warnings, and post-delete history visibility.

## Background
Runs UI is still execution-centric from legacy workflow runtime. This task brings UI behavior in sync with journey runtime semantics, including R31 scope cues and warning-only overlap publish behavior.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Add run list/detail filters and badges for `mode=test|live`.
2. Render run timelines with Logger entries and delivery reason codes.
3. Expose both individual run cancel and journey-level bulk cancel actions with clear scope labeling.
4. Display publish overlap warnings without blocking publish success.
5. Ensure deleted journey run history remains visible via snapshot context labels.
6. Provide a checkpoint via UI tests covering overlap warnings plus both cancel scopes.

## Dependencies
- task-10-cutover-admin-builder-to-linear-journeys.code-task.md

## Implementation Approach
1. Write failing UI tests for mode badges/filters, logger timeline display, reason codes, cancel scope actions, overlap warnings, and deleted-history rendering.
2. Implement runs panel/detail query and rendering updates plus overlap warning presentation.
3. Refactor action copy/labels for clear cancellation scope cues while keeping tests green.

## Acceptance Criteria

1. **Run Mode and Timeline Context Are Visible**
   - Given mixed test and live runs with logger deliveries
   - When users view run lists and details
   - Then mode badges/filters, logger timeline rows, and reason codes are shown correctly.

2. **Cancel Actions Communicate and Enforce Scope**
   - Given active runs in the UI
   - When users invoke individual run cancel or journey-level bulk cancel
   - Then action labels describe scope and resulting state updates match intended cancellation scope.

3. **Publish Warnings Are Non-Blocking and History Survives Delete**
   - Given overlapping trigger/filter journeys and deleted journey definitions
   - When publish occurs and historical runs are viewed
   - Then overlap warnings render while publish succeeds and snapshot-based history remains visible.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running runs/publish UI tests
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: admin-ui, runs, overlap, history, lifecycle
- **Required Skills**: react, query-state, frontend-testing
