# Objective
Implement the Admin UI Navigation Redesign (split-pane list/detail) as described in the design doc.

# Key Requirements
- Replace drawer detail views with split-pane list/detail across Appointments, Calendars, Appointment Types, Resources, Locations, Clients.
- Use URL search params (`selected`, `tab`, `view`, `date`) for selection and view state.
- Appointments include list + schedule toggle with shared filters/search and persistent detail panel.
- Remove deep routes for calendar availability and appointment type calendars/resources; embed as detail tabs.
- Preserve keyboard-first shortcuts and add list/detail focus zones.

# Acceptance Criteria
- All list routes use split-pane layout with URL-driven selection.
- Appointments list and schedule views both drive the same detail panel.
- No drawer components remain; deep routes removed.
- Navigation and command palette still work; selection is shareable via URL.

# Reference
See `./specs/design/detailed-design.md` for full requirements and architecture.

# Dev Server
The dev server will already be running; do not start it.
