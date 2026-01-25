---
name: plan
description: Structured planning workflow for complex tasks. Guides through idea-honing, research, design, and implementation planning phases, then creates a Beads epic with child tasks and dependencies. Use when starting a new feature, refactor, or multi-step project.
---

# Planning Workflow

This skill guides structured planning for complex tasks, outputting a Beads epic with properly typed and sequenced child tasks.

## Phases

### Phase 1: Rough Idea
Capture the initial problem statement:
- What is the user trying to accomplish?
- What triggered this need?
- What does success look like?

### Phase 2: Idea Honing
Ask clarifying questions using AskUserQuestion:
- Constraints (time, tech, compatibility)?
- Scope boundaries?
- Existing patterns to follow?
- Risks or unknowns?

Continue until requirements are clear.

### Phase 3: Research
Explore the codebase using Glob, Grep, Read, and Task (Explore agent):
- Existing patterns and conventions
- Files that will be affected
- Dependencies and integration points
- Potential challenges

### Phase 4: Design
Document key decisions (keep concise):
- Architecture approach
- Data flow
- API contracts (if applicable)
- Edge cases

### Phase 5: Implementation Plan
Break into concrete steps with:
- Clear acceptance criteria per step
- Appropriate issue types
- Dependencies between steps

## Output: Beads Epic with Children

After user approval, create a Beads epic with child tasks:

```bash
# 1. Create the epic (parent container)
EPIC=$(bd create "Epic: Feature Name" \
  --type=epic \
  --description "Overview of the initiative" \
  --silent)

# 2. Create child tasks under the epic
TASK1=$(bd create "Extract repository layer" \
  --type=task \
  --parent $EPIC \
  --description "Acceptance: Repository file exists with CRUD methods" \
  --silent)

TASK2=$(bd create "Add service layer" \
  --type=task \
  --parent $EPIC \
  --description "Acceptance: Service wraps repository with business logic" \
  --silent)

TASK3=$(bd create "Write integration tests" \
  --type=task \
  --parent $EPIC \
  --description "Acceptance: Tests cover happy path and edge cases" \
  --silent)

# 3. Set dependencies (task depends on its blocker)
bd dep add $TASK2 $TASK1   # Service depends on Repository
bd dep add $TASK3 $TASK2   # Tests depend on Service

# 4. Show the structure
bd children $EPIC
```

## Issue Types

| Type | Use For |
|------|---------|
| `epic` | Parent container for related work |
| `feature` | New user-facing functionality |
| `task` | Implementation work, refactoring |
| `bug` | Defect fixes |
| `chore` | Maintenance, config, docs |

## Priority Scale

- `P0` - Critical, drop everything
- `P1` - High, do soon
- `P2` - Medium (default)
- `P3` - Low
- `P4` - Backlog

## Commands Reference

```bash
bd create "Title" --type=task --parent $EPIC --description "..." --priority=2
bd dep add <child> <blocker>     # Child depends on blocker
bd children $EPIC                # List children of epic
bd ready                         # Show unblocked work
bd show <id>                     # Task details
bd close <id>                    # Mark complete
bd epic status $EPIC             # Epic completion progress
```

## Workflow Summary

1. **Understand** - Capture idea, ask clarifying questions
2. **Research** - Explore codebase, find patterns
3. **Design** - Document key decisions
4. **Plan** - Break into typed, sequenced steps
5. **Create Epic** - Output to Beads after approval

## Important

- Do NOT skip phases
- Do NOT create tasks until user approves
- Keep steps small enough to complete independently
- Include acceptance criteria for unambiguous completion
- Use appropriate types (feature vs task vs bug)
