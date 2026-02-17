---
status: completed
created: 2026-02-16
started: 2026-02-17
completed: 2026-02-17
---
# Task: Add Filter AST and Constrained CEL Evaluator

## Description
Implement trigger filter AST validation and backend evaluation using constrained `cel-js`, including one-level nesting, cap limits, and structured compatibility errors.

## Background
The new journey model requires structured filter authoring and backend-only expression evaluation. UI must never author raw CEL expressions.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Define AST schema supporting one-level group nesting with max 12 conditions and max 4 groups.
2. Validate field/operator compatibility and return structured errors for invalid combinations.
3. Implement constrained CEL translation/evaluation for AND/OR/NOT, null predicates, and date/time comparisons.
4. Fail closed for unsupported operations and prevent raw expression authoring paths.
5. Provide a checkpoint via deterministic evaluator matrix tests.

## Dependencies
- task-05-implement-journey-lifecycle-services-and-apis.code-task.md

## Implementation Approach
1. Write failing tests for AST shape caps, operator compatibility errors, and evaluator truth tables.
2. Implement AST validators and constrained CEL translation/evaluation modules.
3. Refactor callsites to use canonical AST persistence and evaluator wrapper while keeping tests green.

## Acceptance Criteria

1. **AST Shape and Limits Enforced**
   - Given valid and invalid filter AST payloads
   - When validation runs
   - Then one-level nesting is accepted and depth/cap violations are rejected.

2. **Compatibility Errors Are Structured**
   - Given incompatible field/operator filter clauses
   - When validation executes
   - Then payload is rejected with structured issue details.

3. **Constrained CEL Evaluation Is Deterministic**
   - Given valid AST filters and appointment/client contexts
   - When evaluation executes
   - Then boolean outcomes match expected truth tables and unsupported operations fail closed.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running validator/evaluator tests
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: filters, cel-js, validation, backend
- **Required Skills**: expression-evaluation, schema-validation, unit-testing
