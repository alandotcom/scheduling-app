# Task Execution Instructions

## Workflow

1. Run `bd ready` to find the next unblocked task
2. Run `bd show <id>` to get full task details
3. Complete ONE task following existing patterns
4. Run backpressure: `pnpm typecheck && pnpm lint && pnpm test`
5. If passing, run `bd close <id>` and commit changes
6. If blocked, run `bd create "Blocker: ..." --blocks <id>` and exit

## Rules

- Complete only ONE task per iteration
- Follow existing code patterns in the codebase
- Run all backpressure checks before closing
- Create blocker tasks if you encounter issues
- Commit after each completed task

## Backpressure Commands

```bash
pnpm typecheck    # Type-check all packages
pnpm lint         # Run oxlint
pnpm test         # Run all tests
pnpm format       # Format code (always run after changes)
```
