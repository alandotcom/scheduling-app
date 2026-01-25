---
description: "Start Beads task loop - iterate until all tasks complete"
argument-hint: "[--max-iterations N] [--prompt-file PATH]"
---

**IMPORTANT: Run this from your terminal shell, not from within Claude Code.**

Exit Claude Code first, then run from your terminal:

```bash
.agents/scripts/beads-loop.sh --max-iterations 2
```

This script spawns fresh Claude instances for each iteration - it cannot run nested inside Claude.

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
