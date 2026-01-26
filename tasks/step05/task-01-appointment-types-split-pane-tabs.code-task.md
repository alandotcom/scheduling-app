---
status: pending
created: 2026-01-26
started: null
completed: null
---
# Task: Convert Appointment Types to Split-Pane with Tabbed Detail Panel

## Description
Replace the appointment type drawer with a split-pane detail panel that includes tabs for Details, Calendars, and Resources.

## Background
Step 5 moves Appointment Types to the shared split-pane layout and embeds relationship management in tabs. This eliminates the deep routes for calendars/resources and keeps all related configuration in the detail panel.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/implementation/plan.md (Step 5 requirements)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. Replace appointment type drawer usage with a split-pane detail panel.
2. Add tabs for Details, Calendars, and Resources.
3. Preserve current list functionality (filters, sorting, row rendering).
4. Show a placeholder state when no appointment type is selected.

## Dependencies
- `SplitPaneLayout` and `useSelectionSearchParams` from Step 1.
- Existing appointment type detail and relationship components.
- Tab UI component pattern used by admin UI.

## Implementation Approach
1. Remove drawer wiring from the appointment types list route.
2. Introduce tabbed detail panel in the split-pane.
3. Ensure tab components are ready to embed existing relationship UIs.

## Acceptance Criteria

1. **Drawer Replacement**
   - Given the appointment types list route
   - When the page loads
   - Then no drawer is rendered and the split-pane detail panel is present

2. **Tabbed Detail Panel**
   - Given a selected appointment type
   - When the detail panel renders
   - Then tabs for Details, Calendars, and Resources are visible

3. **List Functionality Preserved**
   - Given the appointment types list
   - When filtering or sorting
   - Then behavior matches pre-refactor functionality

4. **Empty State**
   - Given no appointment type is selected
   - When the detail panel renders
   - Then a placeholder state is shown

5. **Unit Test Coverage**
   - Given the appointment types split-pane view
   - When running the test suite
   - Then core tab rendering and empty state behavior are covered by unit tests

## Metadata
- **Complexity**: Medium
- **Labels**: Appointment Types, UI, Split-Pane, Tabs
- **Required Skills**: React, component refactoring, UI testing
