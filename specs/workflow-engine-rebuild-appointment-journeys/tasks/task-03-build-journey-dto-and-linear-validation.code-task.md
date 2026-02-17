---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Build Journey DTO and Linear Validation

## Description
Replace workflow graph DTO contracts with journey-specific contracts that enforce the v1 step set and strict linear structure at create/update boundaries.

## Background
Current DTOs allow graph constructs, branch nodes, and non-v1 actions. Rebuild scope requires a linear model with only Trigger, Wait, Send Message, and Logger steps.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Journey definition schema must accept only linear sequences with exactly one Trigger start and supported step transitions.
2. Step types must be limited to Trigger, Wait, Send Message, and Logger.
3. API validation must reject non-linear payloads with structured issues and persist nothing.

## Dependencies
- task-02-implement-appointment-lifecycle-classifier.code-task.md

## Implementation Approach
1. Write failing DTO and route-contract tests for valid linear payloads and invalid non-linear payloads.
2. Implement journey schemas and linear validation rules in shared DTO contracts.
3. Refactor API consumers to use the new DTOs and remove graph-specific contract usage.

## Acceptance Criteria

1. **Valid Linear Journey Persists as Draft**
   - Given a payload with a valid linear chain and allowed step set
   - When create is called
   - Then the journey persists successfully in `draft` state.

2. **Non-Linear Payload Rejected Without Side Effects**
   - Given a payload with branching, malformed sequencing, or unsupported steps
   - When create or update is called
   - Then API validation fails and no persistence side effects occur.

3. **Step Set Restriction Enforced**
   - Given a payload containing a non-v1 step type
   - When validation runs
   - Then the payload is rejected with a structured validation error.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: dto, validation, api-contracts, journeys
- **Required Skills**: testing, schema-design
