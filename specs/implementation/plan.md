# Implementation Plan

## Checklist
- [ ] Step 1: Establish search-param state + split-pane scaffolding
- [ ] Step 2: Refactor Appointments to split-pane (list + detail + URL state)
- [ ] Step 3: Add Schedule view scaffolding and toggle (list/schedule)
- [ ] Step 4: Convert Calendars to split-pane + embed availability tab
- [ ] Step 5: Convert Appointment Types to split-pane + embed relationships tabs
- [ ] Step 6: Convert Resources, Locations, Clients to split-pane
- [ ] Step 7: Command palette integration with selection state
- [ ] Step 8: Bulk actions + keyboard focus zones coverage
- [ ] Step 9: Mobile detail panel behavior
- [ ] Step 10: Cleanup deep routes + drawer removal
- [ ] Step 11: API prework alignment (endpoints + contract updates)
- [ ] Step 12: End-to-end validation + QA checklist

---

## Step 1: Establish search-param state + split-pane scaffolding
**Objective**: Create shared split-pane layout and URL-driven selection/tab utilities used by all list routes.

**Guidance**:
- Create a `SplitPaneLayout` component that renders list panel + detail panel with empty/loading states.
- Add a `useSelectionSearchParams` hook to read/write `selected`, `tab`, `view`, `date` from search params.
- Add route-level `validateSearch` schemas for list routes (appointments, calendars, types, resources, locations, clients).

**Tests**:
- Unit tests for search param helpers (set/clear selected, set tab).

**Integration with previous work**:
- No prior steps; this is the foundation.

**Demo**:
- Any list route shows the split-pane shell with a placeholder detail panel when no item is selected; selecting a row updates `selected` in the URL.

---

## Step 2: Refactor Appointments to split-pane (list + detail + URL state)
**Objective**: Replace drawer with split-pane detail for appointments list while preserving current list functionality.

**Guidance**:
- Replace `AppointmentDrawer` usage with a detail panel component embedded in the split-pane.
- Update row click to set `selected` in URL search params.
- Support `Esc` to clear selection and return focus to list.

**Tests**:
- Integration test: selecting a row updates URL and renders detail panel.

**Integration with previous work**:
- Uses `SplitPaneLayout` and search param utilities from Step 1.

**Demo**:
- Appointments list with right-side detail panel driven by URL search state.

---

## Step 3: Add Schedule view scaffolding and toggle (list/schedule)
**Objective**: Add schedule view toggle and preserve selection across list/schedule.

**Guidance**:
- Add `view` and `date` search params for Appointments.
- Implement schedule view scaffold (placeholder grid or minimal day/week layout).
- Keep detail panel on the right; selecting an event updates `selected`.

**Tests**:
- Integration test: switching view preserves selection and filters.

**Integration with previous work**:
- Builds on Appointments split-pane structure.

**Demo**:
- Toggle between list and schedule view; detail panel remains consistent.

---

## Step 4: Convert Calendars to split-pane + embed availability tab
**Objective**: Replace calendar drawer and deep availability route with a split-pane detail panel tab.

**Guidance**:
- Replace drawer with detail panel using tabs: Details, Availability, Appointments.
- Embed existing availability editor from `_authenticated/calendars/$calendarId.availability.tsx` into the Availability tab.
- Remove navigation to deep availability route.

**Tests**:
- Integration test: calendar selection updates URL and shows availability tab.

**Integration with previous work**:
- Uses shared split-pane layout and search params.

**Demo**:
- Calendars list with inline availability editing in detail panel tab.

---

## Step 5: Convert Appointment Types to split-pane + embed relationships tabs
**Objective**: Replace appointment type drawer and deep routes for calendars/resources with tabbed detail panel.

**Guidance**:
- Replace drawer with detail panel tabs: Details, Calendars, Resources.
- Embed current linking UIs from `$typeId.calendars.tsx` and `$typeId.resources.tsx` into tabs.
- Remove deep routes and update navigation accordingly.

**Tests**:
- Integration test: selecting appointment type + switching tabs updates URL.

**Integration with previous work**:
- Builds on shared split-pane + tab system.

**Demo**:
- Appointment Types list with relationship tabs embedded in detail panel.

---

## Step 6: Convert Resources, Locations, Clients to split-pane
**Objective**: Replace drawer detail views for remaining entities.

**Guidance**:
- Replace drawer with detail panel for each entity.
- Ensure action buttons and forms remain functional.

**Tests**:
- Smoke tests: selection opens detail panel for each entity.

**Integration with previous work**:
- Uses shared split-pane layout and URL search state.

**Demo**:
- All entity lists now use the split-pane pattern.

---

## Step 7: Command palette integration with selection state
**Objective**: Make command palette open list routes with `selected` set when selecting an item.

**Guidance**:
- Extend command palette actions to accept entity IDs and navigate with search params.
- Preserve command palette behavior as specified.

**Tests**:
- Integration test: selecting a command palette result opens list route with correct selection.

**Integration with previous work**:
- Uses search param navigation patterns.

**Demo**:
- Cmd+K -> search -> opens list with selected item and detail panel.

---

## Step 8: Bulk actions + keyboard focus zones coverage
**Objective**: Implement bulk actions UI and ensure keyboard zones align with spec.

**Guidance**:
- Add selection model to list and schedule view.
- Show bulk toolbar when selection count > 0.
- Implement `Cmd+L` / `Cmd+D` focus zones where applicable.

**Tests**:
- Integration tests: bulk eligibility + selection model + keyboard focus behavior.

**Integration with previous work**:
- Builds on list and schedule views and shared layout.

**Demo**:
- Bulk selection works and toolbar appears, keyboard shortcuts focus list/detail.

---

## Step 9: Mobile detail panel behavior
**Objective**: Ensure detail panel transforms into full-screen sheet on mobile.

**Guidance**:
- Add responsive breakpoint behavior to render detail as a sheet.
- Preserve selection/URL state while switching views.

**Tests**:
- Responsive UI test (manual or snapshot).

**Integration with previous work**:
- Uses same split-pane component with mobile render mode.

**Demo**:
- Mobile layout shows full-screen detail sheet when item is selected.

---

## Step 10: Cleanup deep routes + drawer removal
**Objective**: Remove legacy deep routes and drawer components now replaced.

**Guidance**:
- Delete the deep availability and appointment type relationship routes.
- Remove drawer components and wiring from routes.

**Tests**:
- Ensure no broken imports or route definitions.

**Integration with previous work**:
- Cleanup after split-pane conversions.

**Demo**:
- App loads without drawer routes or legacy deep routes.

---

## Step 11: API prework alignment (endpoints + contract updates)
**Objective**: Implement or align missing endpoints required by schedule view and bulk actions.

**Guidance**:
- Add appointments time-range query (start/end timestamps).
- Add merged availability feed endpoint.
- Add structured conflict metadata and override flag for reschedule.
- Add bulk status update endpoint with per-item results.
- Add client history summary endpoint.

**Tests**:
- API contract tests for new endpoints.

**Integration with previous work**:
- Enables schedule view and advanced detail behavior.

**Demo**:
- Schedule view consumes new endpoints with accurate shading and conflict handling.

---

## Step 12: End-to-end validation + QA checklist
**Objective**: Validate the redesign against the QA checklist and success metrics.

**Guidance**:
- Run through QA checklist in `UX-NAV-REDESIGN.md`.
- Validate keyboard shortcuts and selection state behavior.

**Tests**:
- Manual QA + automated regression where available.

**Integration with previous work**:
- Final verification step.

**Demo**:
- Live walkthrough showing all core flows with split-pane navigation and schedule view.
