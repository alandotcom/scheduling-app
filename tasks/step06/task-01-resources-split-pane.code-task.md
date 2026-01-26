---
status: pending
created: 2026-01-26
started: null
completed: null
---
# Task: Convert Resources to Split-Pane Detail Panel

## Description
Replace the Resources drawer with a split-pane detail panel while preserving all existing actions and forms. Add a smoke test that selection opens the detail panel.

## Background
Step 6 moves remaining entity screens to the shared split-pane layout. Resources is one of the remaining drawer-based flows and should be migrated without losing functionality.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/implementation/plan.md (Step 6 requirements)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. Replace drawer usage with a split-pane detail panel on the Resources list route.
2. Preserve existing actions/forms within the detail panel.
3. Show a placeholder state when no resource is selected.
4. Add a smoke test: selection opens the detail panel.

## Dependencies
- `SplitPaneLayout` and `useSelectionSearchParams` from Step 1.
- Existing Resource detail components used by the drawer.
- Test harness for admin UI smoke/integration tests.

## Implementation Approach
1. Remove drawer wiring from the Resources list route.
2. Embed Resource detail content in the split-pane detail region.
3. Add smoke test that selects a resource and asserts detail panel rendering.

## Acceptance Criteria

1. **Drawer Replacement**
   - Given the resources list route
   - When the page loads
   - Then no drawer is rendered and the split-pane detail panel is present

2. **Detail Content Preservation**
   - Given a selected resource
   - When the detail panel renders
   - Then existing actions and forms are available

3. **Empty State**
   - Given no resource is selected
   - When the detail panel renders
   - Then a placeholder is shown

4. **Smoke Test Coverage**
   - Given the resources smoke test
   - When a row is selected
   - Then the detail panel renders

## Metadata
- **Complexity**: Medium
- **Labels**: Resources, UI, Split-Pane, Testing
- **Required Skills**: React, UI refactor, testing
