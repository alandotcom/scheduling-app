#!/bin/bash

# Beads Loop Setup Script
# Creates state file and activates the loop

set -euo pipefail

MAX_ITERATIONS=0
PROMPT_FILE="PROMPT.md"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      cat << 'HELP_EOF'
Beads Loop - Iterate on tasks until all complete

USAGE:
  /beads-loop [OPTIONS]

OPTIONS:
  --max-iterations <n>   Maximum iterations (default: unlimited)
  --prompt-file <path>   Prompt file to use (default: PROMPT.md)
  -h, --help             Show this help

DESCRIPTION:
  Starts a loop that continues while bd ready returns tasks.
  Each iteration, Claude receives the prompt file content.
  Loop stops when all tasks are closed or max iterations reached.

EXAMPLES:
  /beads-loop                              # Run until all tasks done
  /beads-loop --max-iterations 20          # Stop after 20 iterations
  /beads-loop --prompt-file TASK.md        # Use custom prompt

STOPPING:
  - Loop stops automatically when bd ready returns no tasks
  - Or when --max-iterations is reached
  - Run /cancel-beads to force stop

MONITORING:
  bd ready                               # See remaining tasks
  bd list                                # See all tasks
  grep '^iteration:' .claude/beads-loop.local.md  # Current iteration
HELP_EOF
      exit 0
      ;;
    --max-iterations)
      if [[ -z "${2:-}" ]] || ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "❌ Error: --max-iterations requires a positive integer" >&2
        exit 1
      fi
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --prompt-file)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --prompt-file requires a path" >&2
        exit 1
      fi
      PROMPT_FILE="$2"
      shift 2
      ;;
    *)
      echo "❌ Unknown option: $1" >&2
      echo "   Run /beads-loop --help for usage" >&2
      exit 1
      ;;
  esac
done

# Verify beads is initialized
if ! command -v bd &> /dev/null; then
  echo "❌ Error: bd command not found" >&2
  echo "   Install: brew tap steveyegge/beads && brew install bd" >&2
  exit 1
fi

if [[ ! -d ".beads" ]]; then
  echo "❌ Error: Beads not initialized in this directory" >&2
  echo "   Run: bd init" >&2
  exit 1
fi

# Get issue prefix
ISSUE_PREFIX=$(bd info --json 2>/dev/null | jq -r '.issue_prefix // "bd-"' || echo "bd-")

# Verify prompt file exists
if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "❌ Error: Prompt file not found: $PROMPT_FILE" >&2
  echo "   Create it or specify with --prompt-file" >&2
  exit 1
fi

PROMPT_CONTENT=$(cat "$PROMPT_FILE")

# Check for ready tasks
READY_OUTPUT=$(bd ready 2>/dev/null || echo "")
if [[ -z "$READY_OUTPUT" ]] || ! echo "$READY_OUTPUT" | grep -q "$ISSUE_PREFIX"; then
  echo "⚠️  No ready tasks found!" >&2
  echo "   Run 'bd ready' to check, or 'bd list' to see all tasks" >&2
  exit 1
fi

READY_COUNT=$(echo "$READY_OUTPUT" | grep -c "$ISSUE_PREFIX" || echo "0")

# Create state file
mkdir -p .claude

cat > .claude/beads-loop.local.md <<EOF
---
active: true
iteration: 1
max_iterations: $MAX_ITERATIONS
issue_prefix: "$ISSUE_PREFIX"
prompt_file: "$PROMPT_FILE"
started_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
---

$PROMPT_CONTENT
EOF

cat <<EOF
🔄 Beads loop activated!

Iteration: 1
Max iterations: $(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo $MAX_ITERATIONS; else echo "unlimited"; fi)
Ready tasks: $READY_COUNT
Prompt file: $PROMPT_FILE

Loop continues while tasks remain in 'bd ready'.
Each iteration runs the same prompt against your task list.

Monitor:
  bd ready                    # See remaining work
  bd list                     # See all tasks
  /cancel-beads               # Force stop

═══════════════════════════════════════════════════════════
EOF

echo ""
echo "$PROMPT_CONTENT"
echo ""

# Show ready tasks
echo "📋 Ready tasks:"
echo "$READY_OUTPUT"
