---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Update Runs UI Overlap Warnings and History

## Description
Update runs and publish UX to show `test|live` mode distinctions, timeline reason codes, overlap publish warnings, and history visibility for runs tied to deleted journey definitions.

## Background
Runs UI is currently execution-centric and lacks mode facets, warning rendering, and snapshot-based history treatment required by the rebuild.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Runs views must expose `test|live` filters and badges from run mode fields.
2. Run timeline/details must render logger entries and typed delivery reason codes.
3. Publish flow must surface overlap warnings while still allowing publish success; deleted-journey run history must remain visible using snapshots.

## Dependencies
- task-10-cutover-admin-builder-to-linear-journeys.code-task.md

## Implementation Approach
1. Write failing UI tests for mode filtering/badges, timeline rendering, overlap warning display, and deleted-journey history visibility.
2. Implement runs query/transform updates and warning presentation components.
3. Refactor detail view labels to rely on snapshot context when source journey definitions are deleted.

## Acceptance Criteria

1. **Test and Live Runs Are Distinguishable**
   - Given mixed `test` and `live` runs
   - When the runs list is filtered and rendered
   - Then mode filters and badges accurately represent each run.

2. **Publish Warnings Are Non-Blocking**
   - Given publish overlap heuristic detects potential conflicts
   - When publish is triggered
   - Then warning messages are displayed and publish still succeeds.

3. **Deleted Journey Run History Remains Visible**
   - Given historical runs tied to a deleted journey definition
   - When viewing run details
   - Then history remains visible using stored snapshot context.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: Medium
- **Labels**: admin-ui, runs, overlap-warnings, history
- **Required Skills**: react-ui, api-integration, testing
