#!/bin/bash

# Beads Loop - External loop script for fresh context per iteration
# Runs Claude as a subprocess, looping while bd ready returns tasks

set -euo pipefail

MAX_ITERATIONS=0
PROMPT_FILE="PROMPT.md"
ITERATION=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      cat << 'HELP_EOF'
Beads Loop - Iterate on tasks with fresh context each time

USAGE:
  beads-loop.sh [OPTIONS]

OPTIONS:
  --max-iterations <n>   Maximum iterations (default: unlimited)
  --prompt-file <path>   Prompt file to use (default: PROMPT.md)
  -h, --help             Show this help

DESCRIPTION:
  Runs Claude as a subprocess for each iteration, providing fresh context.
  Each iteration handles ONE task from bd ready.
  Loop stops when all tasks are closed or max iterations reached.

EXAMPLES:
  .agents/scripts/beads-loop.sh                      # Run until all tasks done
  .agents/scripts/beads-loop.sh --max-iterations 5   # Stop after 5 iterations
  .agents/scripts/beads-loop.sh --prompt-file TASK.md # Use custom prompt

STOPPING:
  - Loop stops automatically when bd ready returns no tasks
  - Or when --max-iterations is reached
  - Ctrl+C to interrupt

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
      echo "   Run with --help for usage" >&2
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

# Get issue prefix by extracting from first issue in list
# Format: "○ scheduling-app-xxx" or "● scheduling-app-xxx"
ISSUE_PREFIX=$(bd list 2>/dev/null | grep -oE '[a-z]+-[a-z]+-[a-z0-9]+' | head -1 | sed 's/-[^-]*$//' || echo "")
if [[ -z "$ISSUE_PREFIX" ]]; then
  echo "❌ Error: Could not determine issue prefix from bd list" >&2
  exit 1
fi
ISSUE_PREFIX="${ISSUE_PREFIX}-"

# Verify prompt file exists
if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "❌ Error: Prompt file not found: $PROMPT_FILE" >&2
  echo "   Create it or specify with --prompt-file" >&2
  exit 1
fi

# Verify claude command exists
if ! command -v claude &> /dev/null; then
  echo "❌ Error: claude command not found" >&2
  echo "   Install Claude Code CLI" >&2
  exit 1
fi

echo "═══════════════════════════════════════════════════════════"
echo "🔄 Beads Loop Starting"
echo "   Max iterations: $(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo $MAX_ITERATIONS; else echo "unlimited"; fi)"
echo "   Prompt file: $PROMPT_FILE"
echo "═══════════════════════════════════════════════════════════"

while true; do
  # Check for ready tasks
  READY_OUTPUT=$(bd ready 2>/dev/null || echo "")

  if [[ -z "$READY_OUTPUT" ]] || ! echo "$READY_OUTPUT" | grep -q "$ISSUE_PREFIX"; then
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "✅ All tasks complete!"
    echo ""
    bd list --status=closed 2>/dev/null | head -10 || true
    echo "═══════════════════════════════════════════════════════════"
    break
  fi

  ITERATION=$((ITERATION + 1))

  # Check max iterations
  if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -gt $MAX_ITERATIONS ]]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "🛑 Max iterations ($MAX_ITERATIONS) reached."
    echo ""
    echo "Remaining tasks:"
    bd ready 2>/dev/null || true
    echo "═══════════════════════════════════════════════════════════"
    break
  fi

  # Count ready tasks
  READY_COUNT=$(echo "$READY_OUTPUT" | grep -c "$ISSUE_PREFIX" || echo "0")

  echo ""
  echo "───────────────────────────────────────────────────────────"
  echo "🔄 Iteration $ITERATION | $READY_COUNT task(s) ready"
  echo "───────────────────────────────────────────────────────────"
  echo ""

  # Run Claude with fresh context
  # --dangerously-skip-permissions for unattended execution
  # @PROMPT.md passes the prompt file content
  claude --dangerously-skip-permissions "@$PROMPT_FILE"

  echo ""
  echo "───────────────────────────────────────────────────────────"
  echo "Iteration $ITERATION complete. Checking for remaining tasks..."
  echo "───────────────────────────────────────────────────────────"
done

echo ""
echo "Beads loop finished after $ITERATION iteration(s)."
