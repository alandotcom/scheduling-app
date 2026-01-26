---
status: pending
created: 2026-01-25
started: null
completed: null
---
# Task: Implement Schedule View Scaffold with Detail Panel

## Description
Add a schedule view scaffold (placeholder grid or minimal day/week layout) for Appointments that integrates with the existing split-pane detail panel and supports selection.

## Background
The schedule view is introduced as a parallel view to the list. Step 3 requires a minimal scaffold (not full scheduling UX yet) that displays a schedule layout and supports selection-driven detail rendering.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/implementation/plan.md (Step 3 requirements)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. Implement a schedule view scaffold (placeholder grid or minimal day/week layout).
2. Keep the split-pane detail panel visible on the right.
3. Support selection: clicking a schedule item updates `selected` and shows the detail panel.
4. Maintain list filters or selection context where applicable.
5. Add the required integration test: switching view preserves selection and filters.

## Dependencies
- View toggle/search param updates from Task 1.
- `SplitPaneLayout` and selection search param utilities.
- Appointments data loading (existing list data or stub events for scaffold).

## Implementation Approach
1. Add a schedule view component with a placeholder grid or minimal layout.
2. Wire selection interactions to `setSelected` search params.
3. Ensure the detail panel renders consistently across list and schedule views.
4. Add integration test verifying view switch preserves selection and filters.

## Acceptance Criteria

1. **Schedule View Render**
   - Given the appointments route with `view=schedule`
   - When the page renders
   - Then a schedule scaffold is displayed

2. **Detail Panel Consistency**
   - Given an appointment selection
   - When in schedule view
   - Then the detail panel shows the selected appointment

3. **Selection Updates**
   - Given a schedule item is clicked
   - When the item is selected
   - Then `selected` is updated in the URL

4. **View Switch Preservation**
   - Given an appointment is selected in list view
   - When switching to schedule view
   - Then selection and filters remain unchanged

5. **Integration Test Coverage**
   - Given the appointments integration test
   - When switching views
   - Then selection preservation is asserted

## Metadata
- **Complexity**: Medium
- **Labels**: Appointments, Schedule View, Split-Pane, Testing
- **Required Skills**: React, routing, UI scaffolding, integration testing
