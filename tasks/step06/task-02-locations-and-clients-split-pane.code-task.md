---
status: pending
created: 2026-01-26
started: null
completed: null
---
# Task: Convert Locations and Clients to Split-Pane Detail Panels

## Description
Replace the Locations and Clients drawers with split-pane detail panels while preserving all existing actions and forms. Add smoke tests confirming selection opens each detail panel.

## Background
Step 6 completes the remaining entity migrations to the shared split-pane layout. Locations and Clients should adopt the same pattern with minimal behavior changes.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/implementation/plan.md (Step 6 requirements)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. Replace drawer usage with split-pane detail panels on the Locations and Clients list routes.
2. Preserve existing actions/forms within each detail panel.
3. Show placeholder states when no item is selected.
4. Add smoke tests: selection opens detail panel for each entity.

## Dependencies
- `SplitPaneLayout` and `useSelectionSearchParams` from Step 1.
- Existing Locations and Clients detail components used by drawers.
- Test harness for admin UI smoke/integration tests.

## Implementation Approach
1. Remove drawer wiring from the Locations and Clients list routes.
2. Embed detail content in split-pane detail regions.
3. Add smoke tests that select a row and assert detail panel rendering for each entity.

## Acceptance Criteria

1. **Drawer Replacement**
   - Given the locations or clients list route
   - When the page loads
   - Then no drawer is rendered and the split-pane detail panel is present

2. **Detail Content Preservation**
   - Given a selected location or client
   - When the detail panel renders
   - Then existing actions and forms are available

3. **Empty State**
   - Given no item is selected
   - When the detail panel renders
   - Then a placeholder is shown

4. **Smoke Test Coverage**
   - Given the locations/clients smoke tests
   - When a row is selected
   - Then the detail panel renders

## Metadata
- **Complexity**: Medium
- **Labels**: Locations, Clients, UI, Split-Pane, Testing
- **Required Skills**: React, UI refactor, testing
