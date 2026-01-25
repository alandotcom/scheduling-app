---
description: "Start Beads task loop - iterate until all tasks complete"
argument-hint: "[--max-iterations N] [--prompt-file PATH]"
---

Start the Beads loop by running the external loop script:

```bash
.agents/scripts/beads-loop.sh $ARGUMENTS
```

This script runs `claude` as a subprocess for each iteration, providing fresh context.
Each iteration handles ONE task from `bd ready`, then exits so the next iteration starts clean.

**How it works:**
1. Script checks `bd ready` for available tasks
2. If tasks exist, runs `claude --dangerously-skip-permissions "@PROMPT.md"`
3. Claude picks ONE task, completes it, then exits
4. Script loops back to step 1 with fresh context
5. Stops when no tasks remain or max iterations reached

**Options:**
- `--max-iterations N` - Stop after N iterations (default: unlimited)
- `--prompt-file PATH` - Use custom prompt file (default: PROMPT.md)

**Stopping:**
- Ctrl+C to interrupt
- Loop auto-stops when `bd ready` returns no tasks
