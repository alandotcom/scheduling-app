---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Add Filter AST and Constrained CEL Evaluator

## Description
Implement journey trigger filters as structured AST with strict caps and one-level nesting, then evaluate filters through constrained backend `cel-js` translation without exposing raw expression authoring in UI.

## Background
Current filter execution uses a custom parser and does not satisfy structured AST + constrained CEL requirements. This slice defines the canonical AST contract and evaluation runtime.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. AST validator must enforce one-level nesting, maximum 12 conditions, and maximum 4 groups.
2. Validator must enforce field/operator compatibility and return structured error payloads.
3. Evaluator must translate AST to constrained `cel-js` and fail closed for unsupported operations.

## Dependencies
- task-05-implement-journey-lifecycle-services-and-apis.code-task.md

## Implementation Approach
1. Write failing AST validation and evaluation matrix tests, including cap/depth violations and truth-table checks.
2. Implement AST schema/semantic validation plus constrained CEL translation/evaluation wrapper.
3. Refactor filter callsites to persist canonical AST and remove custom parser dependencies.

## Acceptance Criteria

1. **AST Shape and Caps Enforced**
   - Given a filter payload that exceeds nesting depth or cap limits
   - When validation runs
   - Then validation fails with structured issues identifying the violated rule.

2. **Evaluator Produces Deterministic Boolean Results**
   - Given valid AST filters and appointment/client contexts
   - When evaluation runs
   - Then AND/OR/NOT, null checks, and date comparisons return expected deterministic outcomes.

3. **Unsupported Operations Fail Closed**
   - Given an unsupported field/operator operation
   - When evaluation is attempted
   - Then evaluation does not match and surfaces a controlled error path.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: filters, cel-js, validation, api
- **Required Skills**: testing, expression-evaluation
