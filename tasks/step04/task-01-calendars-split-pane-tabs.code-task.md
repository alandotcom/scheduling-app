---
status: pending
created: 2026-01-26
started: null
completed: null
---
# Task: Convert Calendars to Split-Pane with Tabbed Detail Panel

## Description
Replace the calendars drawer with a split-pane detail panel that includes tabs for Details, Availability, and Appointments.

## Background
Step 4 moves the Calendars area to the shared split-pane layout. The detail panel should be tabbed and replace the deep availability route with an embedded tab view.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/implementation/plan.md (Step 4 requirements)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. Replace any calendar drawer usage with a split-pane detail panel embedded in `SplitPaneLayout`.
2. Add tabs in the detail panel: Details, Availability, Appointments.
3. Keep list functionality intact (filters, sorting, row rendering).
4. Show a placeholder state when no calendar is selected.

## Dependencies
- `SplitPaneLayout` and `useSelectionSearchParams` from Step 1.
- Existing calendar detail components and drawer content.
- Tab UI component pattern used in the admin UI.

## Implementation Approach
1. Identify the calendars list route and remove drawer wiring.
2. Introduce a tabbed detail panel component within the split-pane.
3. Keep detail content modular so Availability and Appointments can be embedded in tabs.

## Acceptance Criteria

1. **Drawer Replacement**
   - Given the calendars list route
   - When the page loads
   - Then no drawer is rendered and the split-pane detail panel is present

2. **Tabbed Detail Panel**
   - Given a selected calendar
   - When the detail panel renders
   - Then tabs for Details, Availability, and Appointments are visible

3. **List Functionality Preserved**
   - Given the calendars list
   - When filtering or sorting
   - Then behavior matches pre-refactor functionality

4. **Empty State**
   - Given no calendar is selected
   - When the detail panel renders
   - Then a placeholder state is shown

5. **Unit Test Coverage**
   - Given the calendars split-pane view
   - When running the test suite
   - Then core tab rendering and empty state behavior are covered by unit tests

## Metadata
- **Complexity**: Medium
- **Labels**: Calendars, UI, Split-Pane, Tabs
- **Required Skills**: React, component refactoring, UI testing
