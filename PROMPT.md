# Task Execution Instructions

**CRITICAL: Complete ONE task, then exit. Do not loop or continue to other tasks.**

## Workflow

1. Run `bd ready` to find the next unblocked task
2. Pick ONE task and run `bd show <id>` to get full task details
3. Complete that ONE task following existing patterns
4. Run backpressure: `pnpm typecheck && pnpm lint && pnpm test`
5. If backpressure fails, fix issues and re-run until passing
6. Run `/senior-review` skill on your changes (entropy-reducing, favors simplification)
7. Run code review using the code-reviewer agent on your changes
8. If either review finds issues, fix them and re-run backpressure + reviews
9. For UI features: run agent-browser QA to verify the feature works correctly
10. When all checks pass, run `bd close <id>`
11. Git commit with descriptive message (see Git Commits section below)
12. Document significant learnings in `.agents/memories/` (see Knowledge Capture section below)
13. If blocked, run `bd create "Blocker: ..." --blocks <id>` and exit

## Code Review

After backpressure passes, run TWO review steps:

### Step 1: Senior Review (Skill)
Run the `/senior-review` skill first:
- Entropy-reducing review that favors deletion, consolidation, and simplification
- Diff-anchored but context-aware
- Focuses on avoiding over-engineering and unnecessary complexity

### Step 2: Code Reviewer Agent
Then spawn a code-reviewer agent:
- Use the Task tool with `subagent_type: "code-reviewer"`
- Prompt: "Review the staged changes for this task. Check for quality, security, and maintainability issues."
- If either reviewer finds issues, fix them before proceeding
- Re-run backpressure after any fixes

## UI Feature QA

After completing UI features, verify with agent-browser:
```bash
# Start the app
pnpm dev

# Basic verification workflow
agent-browser open http://localhost:5173
agent-browser snapshot -i        # Get interactive elements with refs
agent-browser click @e1          # Click by ref
agent-browser fill @e2 "text"    # Fill input
agent-browser screenshot         # Capture current state

# After DOM changes, re-snapshot to get fresh refs
agent-browser snapshot -i

# Close when done
agent-browser close
```

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

## Git Commits

After closing a task, commit your changes:

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat/fix/refactor: <short description>

- <bullet point of what changed>
- <another bullet point if needed>

Closes: <beads-id>
EOF
)"
```

Include `.beads/issues.jsonl` in every commit to track task state.

## Knowledge Capture

After completing a task, document significant learnings:

**When to capture:**
- Unexpected library behavior or gotchas
- Performance insights or optimizations discovered
- Bug patterns and their solutions
- Configuration quirks or workarounds
- Integration patterns that worked well

**Where to write:**
`.agents/memories/<topic>/<learning>.md`

**Example topics:** `drizzle/`, `better-auth/`, `hono/`, `tanstack-router/`, `postgres/`, `testing/`

**Format:**
```markdown
# <Title>

## Context
<When this applies>

## Learning
<What was discovered>

## Example
<Code or steps if applicable>
```
