---
status: pending
created: 2026-01-25
started: null
completed: null
---
# Task: Add View/Date Search Params and List/Schedule Toggle

## Description
Introduce `view` and `date` search params for the Appointments route and add a list/schedule toggle that preserves selection and filters when switching views.

## Background
Step 3 adds a schedule view alongside the existing list view. The URL must capture the current view and date, and switching views should keep selection state consistent with the split-pane layout.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/implementation/plan.md (Step 3 requirements)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. Extend appointments search params to include `view` and `date` with defaults.
2. Add a list/schedule view toggle in the appointments UI.
3. Preserve `selected` and filters when switching between views.
4. Ensure invalid or missing `view`/`date` values are normalized.

## Dependencies
- `useSelectionSearchParams` utilities from Step 1.
- Appointments list route and toolbar controls.
- Validation schema for appointments route search params.

## Implementation Approach
1. Update route `validateSearch` to include `view` and `date` defaults.
2. Implement a toggle control that sets `view` in search params.
3. Ensure selection is preserved across toggles and does not reset on view change.

## Acceptance Criteria

1. **URL View Param**
   - Given the appointments route
   - When the view toggle is set to schedule
   - Then the URL includes `view=schedule`

2. **Date Param Handling**
   - Given a date is chosen or present in the URL
   - When the route renders
   - Then `date` is parsed and returned by the search param hook

3. **Selection Preservation**
   - Given an appointment is selected in list view
   - When switching to schedule view
   - Then the selection remains in URL and detail panel state

4. **Normalization**
   - Given invalid `view` or `date` values in the URL
   - When the route loads
   - Then values are normalized to safe defaults

5. **Unit Test Coverage**
   - Given the view/date helpers
   - When running the test suite
   - Then view/date parsing and normalization are covered

## Metadata
- **Complexity**: Medium
- **Labels**: Appointments, Search Params, View Toggle, Routing
- **Required Skills**: TanStack Router, React, Zod
