---
status: pending
created: 2026-01-26
started: null
completed: null
---
# Task: Embed Availability Tab and Remove Deep Availability Route

## Description
Embed the existing calendar availability editor inside the Availability tab of the split-pane detail panel and remove navigation to the deep availability route. Add the required integration test for selection and tab rendering.

## Background
The redesign eliminates deep routes and drawers in favor of split-pane tabs. The existing availability editor (currently in `_authenticated/calendars/$calendarId.availability.tsx`) should live inside the detail panel without a separate route.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/implementation/plan.md (Step 4 requirements)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. Embed the availability editor into the Availability tab of the calendars detail panel.
2. Remove or redirect navigation that previously routed to the deep availability page.
3. Preserve current availability editing behavior and data flow.
4. Add the Step 4 integration test: calendar selection updates URL and shows availability tab.

## Dependencies
- Calendars split-pane tabbed detail panel from Task 1.
- Existing availability editor component and its data dependencies.
- Route definitions for calendars and the old availability route.

## Implementation Approach
1. Reuse the existing availability editor component inside the Availability tab.
2. Remove or replace deep availability route links, updating any navigation to use tab state.
3. Add integration test covering selection + availability tab rendering.

## Acceptance Criteria

1. **Availability Tab Embed**
   - Given a selected calendar
   - When the Availability tab is active
   - Then the existing availability editor is rendered in the detail panel

2. **Deep Route Removal**
   - Given the calendars UI
   - When a user attempts to access availability from the list
   - Then they remain within the split-pane view (no deep route navigation)

3. **Selection URL Update**
   - Given the calendars list
   - When a row is selected
   - Then the URL includes `selected=<calendarId>`

4. **Integration Test Coverage**
   - Given the calendars integration test
   - When selecting a calendar and switching to Availability tab
   - Then the URL update and availability embed are asserted

## Metadata
- **Complexity**: Medium
- **Labels**: Calendars, Availability, Routing, Testing
- **Required Skills**: React, routing, integration testing
