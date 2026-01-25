---
description: "Start Beads task loop - iterate until all tasks complete"
argument-hint: "[--max-iterations N] [--prompt-file PATH]"
allowed-tools: ["Bash(.claude/scripts/setup-beads-loop.sh:*)"]
---

Start the Beads loop by running:

```bash
.claude/scripts/setup-beads-loop.sh $ARGUMENTS
```

Then work through tasks from `bd ready`. For each task:
1. Run `bd show <id>` to get details
2. Complete the work following existing patterns
3. Run backpressure: `pnpm typecheck && pnpm lint && pnpm test`
4. Run `bd close <id>` when done
5. Commit changes

When you exit, the loop checks `bd ready`. If tasks remain, you continue.
