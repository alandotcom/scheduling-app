---
status: pending
created: 2026-01-25
started: null
completed: null
---
# Task: Add Selection Search Params Hook and Route Validation

## Description
Implement a `useSelectionSearchParams` hook for reading/writing selection-related search params (`selected`, `tab`, `view`, `date`) and add route-level `validateSearch` schemas for list routes. Include unit tests for selection/tab helpers as the plan requires.

## Background
Split-pane navigation relies on URL search params to persist selection and active tabs. Step 1 establishes shared URL utilities and validation for list routes (appointments, calendars, appointment types, resources, locations, clients) so later steps can rely on consistent behavior.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/summary.md (navigation patterns overview)
- specs/implementation/plan.md (Step 1 requirements)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. Create `useSelectionSearchParams` to read/write `selected`, `tab`, `view`, and `date` from URL search params.
2. Provide helpers to set/clear selection and set active tab in a predictable way.
3. Add `validateSearch` schemas for list routes: appointments, calendars, appointment types, resources, locations, clients.
4. Ensure URL param parsing gracefully handles missing/invalid values (fall back to defaults).
5. Add unit tests for selection helpers and tab setter behavior.

## Dependencies
- Router/search param utilities used by the admin UI (TanStack Router).
- Shared validation utilities (Zod schemas in `@scheduling/dto` or route-local validators).
- Testing framework used in the admin UI.

## Implementation Approach
1. Identify existing search param helpers and route-level `validateSearch` patterns.
2. Implement `useSelectionSearchParams` with getters/setters for selection/tab/view/date.
3. Wire up `validateSearch` in each list route to enforce expected param shapes.
4. Add unit tests covering set/clear selection and set tab behavior with invalid inputs.

## Acceptance Criteria

1. **Selection Param Set/Clear**
   - Given a list route with no selection
   - When `setSelected(id)` is called
   - Then the URL search params include `selected=<id>`
   - And when `clearSelected()` is called
   - Then the `selected` param is removed

2. **Tab Param Handling**
   - Given a list route with supported tabs
   - When `setTab('details')` is called
   - Then the URL search params include `tab=details`
   - And invalid tab values fall back to a default

3. **Route Validation**
   - Given any list route (appointments, calendars, appointment types, resources, locations, clients)
   - When the route loads with invalid search params
   - Then `validateSearch` normalizes them to safe defaults

4. **View/Date Params Support**
   - Given a list route that supports `view` and `date`
   - When these params are set in the URL
   - Then `useSelectionSearchParams` returns the parsed values

5. **Unit Test Coverage**
   - Given the search param helpers
   - When running the test suite
   - Then set/clear selected and set tab behaviors are covered by unit tests

## Metadata
- **Complexity**: Medium
- **Labels**: Routing, URL State, Search Params, Validation
- **Required Skills**: TanStack Router, Zod, unit testing
