# Task Execution Instructions

## Workflow

1. Run `bd ready` to find the next unblocked task
2. Run `bd show <id>` to get full task details
3. Complete ONE task following existing patterns
4. Run backpressure: `pnpm typecheck && pnpm lint && pnpm test`
5. If backpressure fails, fix issues and re-run until passing
6. Run code review using the code-reviewer agent on your changes
7. If review finds issues, fix them and re-run backpressure + review
8. When all checks pass, run `bd close <id>` and commit changes (include .beads/issues.jsonl)
9. If blocked, run `bd create "Blocker: ..." --blocks <id>` and exit

## Code Review

After backpressure passes, spawn a code-reviewer agent to review your changes:
- Use the Task tool with `subagent_type: "code-reviewer"`
- Prompt: "Review the staged changes for this task. Check for quality, security, and maintainability issues."
- If the reviewer finds issues, fix them before proceeding
- Re-run backpressure after any fixes

## Rules

- Complete only ONE task per iteration
- Follow existing code patterns in the codebase
- Run all backpressure checks before closing
- Run code review after backpressure passes
- Fix any issues found in review before closing the task
- Create blocker tasks if you encounter issues
- Commit after each completed task
- Always include .beads/issues.jsonl in commits (tracks task state)

## Backpressure Commands

```bash
pnpm typecheck    # Type-check all packages
pnpm lint         # Run oxlint
pnpm test         # Run all tests
pnpm format       # Format code (always run after changes)
```
