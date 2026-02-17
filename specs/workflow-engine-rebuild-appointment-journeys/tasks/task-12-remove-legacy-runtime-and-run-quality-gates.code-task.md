---
status: completed
created: 2026-02-16
started: 2026-02-17
completed: 2026-02-17
---
# Task: Remove Legacy Runtime and Run Quality Gates

## Description
Delete obsolete workflow graph runtime codepaths across API, DTO, DB, and admin UI, then validate the rebuild with full repository quality gates.

## Background
The objective is a big-bang replacement, so legacy runtime compatibility layers are out of scope. Completion requires clean removal and passing format/lint/typecheck/test gates.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Remove unused legacy workflow graph runtime files, services, routes, DTO exports, and UI entry points.
2. Update imports/registrations so only journey runtime surfaces remain active.
3. Add regression checks proving legacy workflow runtime references are absent.
4. Run and pass `pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` without suppressions.
5. Provide a checkpoint by capturing command pass status and confirming repository references only journey runtime.

## Dependencies
- task-11-update-runs-ui-overlap-warnings-and-history.code-task.md

## Implementation Approach
1. Write failing regression checks for remaining legacy runtime references.
2. Delete legacy runtime surfaces and update route/module wiring to journey-only paths.
3. Refactor residual imports and run full quality gates until all checks pass.

## Acceptance Criteria

1. **Legacy Runtime Surfaces Are Removed**
   - Given repository source and route registration files
   - When legacy workflow runtime references are searched
   - Then obsolete workflow graph runtime entry points are absent.

2. **Journey Runtime Is Sole Active Path**
   - Given runtime and UI integration wiring
   - When the application is built and tested
   - Then only journey runtime paths are active and regression checks pass.

3. **Quality Gates Are Green**
   - Given final implementation changes
   - When running `pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`
   - Then all commands pass with no suppressions.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the full test suite
   - Then all tests for this task pass.

## Metadata
- **Complexity**: Medium
- **Labels**: cleanup, refactor, quality-gates, monorepo
- **Required Skills**: codebase-refactoring, test-automation, tooling
