---
status: pending
created: 2026-01-25
started: null
completed: null
---
# Task: Wire Appointment Selection and Escape Behavior

## Description
Hook up appointments row selection to URL search params and implement `Esc` to clear selection and return focus to the list. Add the Step 2 integration test to verify URL updates and detail rendering.

## Background
The split-pane appointments view uses URL-driven selection state. Step 2 requires row clicks to set `selected` in the URL and the `Esc` key to clear selection and return focus to the list, aligning with the new keyboard navigation expectations.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/implementation/plan.md (Step 2 requirements)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. On row click, set `selected` search param to the appointment ID.
2. Implement `Esc` behavior to clear selection and return focus to the list.
3. Ensure keyboard handling does not interfere with existing shortcuts or inputs.
4. Add an integration test: selecting a row updates URL and renders detail panel.

## Dependencies
- `useSelectionSearchParams` utilities from Step 1.
- Appointments list route and row components.
- Test harness for admin UI integration tests.

## Implementation Approach
1. Identify where row selection is handled; wire it to `setSelected` from the search param hook.
2. Add a keydown handler (route-level or list-level) to clear selection on `Esc` and restore focus.
3. Add integration test that selects a row, asserts URL search params, and verifies detail panel rendering.

## Acceptance Criteria

1. **URL Selection Updates**
   - Given the appointments list
   - When a row is clicked
   - Then the URL includes `selected=<appointmentId>`

2. **Escape Clears Selection**
   - Given an appointment is selected
   - When the user presses `Esc`
   - Then the `selected` param is cleared and focus returns to the list

3. **Detail Panel Rendering**
   - Given a selected appointment in the URL
   - When the route renders
   - Then the detail panel shows the selected appointment

4. **Integration Test Coverage**
   - Given the appointments list integration test
   - When a row is selected
   - Then the URL update and detail render are asserted

## Metadata
- **Complexity**: Medium
- **Labels**: Appointments, URL State, Keyboard, Testing
- **Required Skills**: TanStack Router, React, keyboard handling, integration testing
