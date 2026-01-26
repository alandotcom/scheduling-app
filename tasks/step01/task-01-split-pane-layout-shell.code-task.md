---
status: pending
created: 2026-01-25
started: null
completed: null
---
# Task: Build Split Pane Layout Shell

## Description
Create a reusable `SplitPaneLayout` component that renders a list panel and a detail panel with appropriate empty/loading states. This shared shell will be the foundation for all list routes moving from drawers to split-pane navigation.

## Background
The redesign shifts list-detail flows to a split-pane layout driven by URL state. Step 1 establishes the shared scaffolding used across appointments, calendars, appointment types, resources, locations, and clients. This task focuses on the layout shell only; URL state and validation are handled in a separate task.

## Reference Documentation
**Required:**
- Design: specs/design/detailed-design.md

**Additional References (if relevant to this task):**
- specs/summary.md (overall navigation goals)

**Note:** You MUST read the detailed design document before beginning implementation. Read additional references as needed for context.

## Technical Requirements
1. Implement a `SplitPaneLayout` component that accepts list and detail content regions.
2. Provide visual states for: no selection (empty placeholder) and loading (detail skeleton or spinner).
3. Ensure layout supports sticky/scroll behavior so list and detail can scroll independently if required by design.
4. Keep the component generic and route-agnostic for reuse across multiple list routes.

## Dependencies
- UI component library and existing layout primitives used by admin UI.
- Any shared loading/empty state components already present in the codebase.

## Implementation Approach
1. Inspect existing list and drawer layouts to mirror spacing and sizing rules in the split-pane shell.
2. Build `SplitPaneLayout` with a list panel and a detail panel, including empty/loading states.
3. Add minimal story/usage example in a list route or a simple preview component (if needed to verify behavior).

## Acceptance Criteria

1. **Split Pane Rendering**
   - Given a list route renders `SplitPaneLayout`
   - When the page loads
   - Then the list panel and detail panel are both visible in the layout

2. **Empty Detail State**
   - Given no item is selected
   - When the detail panel renders
   - Then a placeholder empty state is shown instead of a detail view

3. **Loading Detail State**
   - Given detail content is loading
   - When the detail panel renders
   - Then a loading indicator or skeleton is visible

4. **Reusable Layout**
   - Given different list routes consume `SplitPaneLayout`
   - When switching between routes
   - Then the layout remains consistent without route-specific logic

5. **Unit Test Coverage**
   - Given the `SplitPaneLayout` implementation
   - When running the test suite
   - Then core empty/loading state rendering has unit tests

## Metadata
- **Complexity**: Medium
- **Labels**: UI, Layout, Split-Pane, Navigation
- **Required Skills**: React, layout composition, component testing
