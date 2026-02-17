---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Remove Legacy Runtime and Run Quality Gates

## Description
Delete obsolete workflow graph runtime surfaces across API, DTO, DB, and admin UI, then run full repository quality gates to verify only journey runtime paths remain active.

## Background
The rebuild is a big-bang replacement with no compatibility shims. Legacy workflow runtime code must be removed completely once journey paths are in place.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Remove legacy workflow graph runtime files, route registrations, DTO references, and UI entry points.
2. Ensure no compatibility shims for old workflow behavior remain.
3. Verify repository quality gates pass: `pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

## Dependencies
- task-11-update-runs-ui-overlap-warnings-and-history.code-task.md

## Implementation Approach
1. Write failing regression checks that assert no legacy workflow runtime entry points remain referenced.
2. Remove dead runtime code and update imports/registrations to journey-only paths.
3. Refactor remaining references and execute full quality gates until green.

## Acceptance Criteria

1. **Legacy Runtime Removed**
   - Given the rebuild implementation is complete
   - When scanning routes/services/contracts/UI entry points
   - Then legacy workflow graph runtime surfaces are absent.

2. **No Compatibility Shims Remain**
   - Given journey runtime is active
   - When reviewing runtime paths
   - Then no compatibility or dual-path legacy behavior is retained.

3. **Quality Gates Pass**
   - Given all code changes for the rebuild are complete
   - When running `pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`
   - Then all commands pass without suppressions.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: Medium
- **Labels**: cleanup, quality-gates, migration, journeys
- **Required Skills**: refactoring, testing, monorepo-tooling
