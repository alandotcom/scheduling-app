---
status: pending
created: 2026-01-26
started: null
completed: null
---
# Task: Embed Calendars/Resources Tabs and Remove Deep Routes

## Description
Embed the existing appointment type Calendars and Resources linking UIs inside the split-pane tabs and remove navigation to the deep relationship routes. Add the required integration test for selection + tab switching.

## Background
The redesign eliminates deep routes for appointment type relationships. The existing linking UIs from `$typeId.calendars.tsx` and `$typeId.resources.tsx` should be embedded within tabs in the detail panel.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/implementation/plan.md (Step 5 requirements)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. Embed the existing calendars linking UI inside the Calendars tab.
2. Embed the existing resources linking UI inside the Resources tab.
3. Remove or redirect navigation that used the deep relationship routes.
4. Preserve linking behavior and data flow.
5. Add the Step 5 integration test: selecting appointment type + switching tabs updates URL.

## Dependencies
- Appointment types split-pane tabbed detail panel from Task 1.
- Existing relationship linking components and data dependencies.
- Route definitions for appointment type relationship routes.

## Implementation Approach
1. Reuse existing relationship UIs inside the tab content.
2. Update navigation links to set tab state rather than route to deep pages.
3. Add integration test covering selection and tab switching with URL updates.

## Acceptance Criteria

1. **Relationship Tabs Embed**
   - Given a selected appointment type
   - When the Calendars or Resources tab is active
   - Then the existing linking UI is rendered within the detail panel

2. **Deep Route Removal**
   - Given the appointment types UI
   - When a user navigates to relationships
   - Then they remain within the split-pane view (no deep route navigation)

3. **Tab URL Updates**
   - Given a selected appointment type
   - When switching tabs
   - Then the URL search params reflect the active tab

4. **Integration Test Coverage**
   - Given the appointment types integration test
   - When selecting a type and switching tabs
   - Then the URL updates and tab content are asserted

## Metadata
- **Complexity**: Medium
- **Labels**: Appointment Types, Relationships, Routing, Testing
- **Required Skills**: React, routing, integration testing
