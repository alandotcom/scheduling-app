#!/bin/bash

# Beads Loop Stop Hook
# Continues loop while bd ready returns tasks
# Stops when all tasks are complete

set -euo pipefail

HOOK_INPUT=$(cat)

# Check if beads-loop is active
STATE_FILE=".claude/beads-loop.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

# Parse frontmatter
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//')
MAX_ITERATIONS=$(echo "$FRONTMATTER" | grep '^max_iterations:' | sed 's/max_iterations: *//')
ISSUE_PREFIX=$(echo "$FRONTMATTER" | grep '^issue_prefix:' | sed 's/issue_prefix: *//' | sed 's/^"\(.*\)"$/\1/')

# Validate
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Beads loop: Invalid iteration count" >&2
  rm "$STATE_FILE"
  exit 0
fi

if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Beads loop: Invalid max iterations" >&2
  rm "$STATE_FILE"
  exit 0
fi

# Check max iterations
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "🛑 Beads loop: Max iterations ($MAX_ITERATIONS) reached."
  rm "$STATE_FILE"
  exit 0
fi

# Check if tasks remain
READY_OUTPUT=$(bd ready 2>/dev/null || echo "")

if [[ -z "$READY_OUTPUT" ]] || ! echo "$READY_OUTPUT" | grep -q "$ISSUE_PREFIX"; then
  echo "✅ Beads loop: All tasks complete!"
  bd list --status=closed 2>/dev/null | head -10 || true
  rm "$STATE_FILE"
  exit 0
fi

# Tasks remain - continue loop
NEXT_ITERATION=$((ITERATION + 1))

# Extract prompt (after closing ---)
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$STATE_FILE")

if [[ -z "$PROMPT_TEXT" ]]; then
  echo "⚠️  Beads loop: No prompt found in state file" >&2
  rm "$STATE_FILE"
  exit 0
fi

# Update iteration
TEMP_FILE="${STATE_FILE}.tmp.$$"
sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$STATE_FILE"

# Count ready tasks
READY_COUNT=$(echo "$READY_OUTPUT" | grep -c "$ISSUE_PREFIX" || echo "0")

SYSTEM_MSG="🔄 Beads iteration $NEXT_ITERATION | $READY_COUNT task(s) ready | Run 'bd ready' to see work"

jq -n \
  --arg prompt "$PROMPT_TEXT" \
  --arg msg "$SYSTEM_MSG" \
  '{
    "decision": "block",
    "reason": $prompt,
    "systemMessage": $msg
  }'

exit 0
