---
status: pending
created: 2026-01-25
started: null
completed: null
---
# Task: Refactor Appointments to Split-Pane Detail

## Description
Replace the `AppointmentDrawer` with a split-pane detail panel embedded in the shared `SplitPaneLayout`, while preserving the existing appointments list functionality.

## Background
Step 2 moves appointments from a drawer-based detail view to the new split-pane navigation pattern. The list should remain intact, but the detail view now lives in the right-hand panel and is driven by URL selection state created in Step 1.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/implementation/plan.md (Step 2 requirements)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. Replace `AppointmentDrawer` usage with a detail panel component inside the split-pane layout.
2. Preserve current list features (filters, pagination, sorting, row rendering) without regression.
3. Ensure detail panel shows a placeholder state when no appointment is selected.
4. Ensure detail panel reuses existing appointment detail content (no loss of functionality).

## Dependencies
- `SplitPaneLayout` component from Step 1.
- `useSelectionSearchParams` utilities from Step 1.
- Existing appointment detail components used by the drawer.

## Implementation Approach
1. Identify the appointments list route and remove the drawer wiring.
2. Embed the detail component in the split-pane detail region.
3. Wire the detail panel to use URL selection state instead of drawer open state.

## Acceptance Criteria

1. **Drawer Replacement**
   - Given the appointments list route
   - When the page loads
   - Then no drawer is rendered and the split-pane detail panel is present

2. **List Functionality Preserved**
   - Given the appointments list
   - When filtering, sorting, or paginating
   - Then the behavior matches pre-refactor functionality

3. **Detail Panel Behavior**
   - Given no appointment is selected
   - When the detail panel renders
   - Then an empty placeholder is shown

4. **Detail Content Preservation**
   - Given an appointment is selected
   - When the detail panel renders
   - Then the existing appointment detail content is displayed with no missing actions

5. **Unit Test Coverage**
   - Given the split-pane appointments view
   - When running the test suite
   - Then critical rendering (list + detail placeholder) has unit test coverage

## Metadata
- **Complexity**: Medium
- **Labels**: Appointments, UI, Split-Pane, Refactor
- **Required Skills**: React, component refactoring, UI testing
