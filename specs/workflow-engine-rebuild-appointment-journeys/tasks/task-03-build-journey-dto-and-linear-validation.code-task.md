---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Build Journey DTO and Linear Validation

## Description
Replace graph-based workflow payload contracts with journey DTOs that allow only the v1 linear model and approved step set (Trigger, Wait, Send Message, Logger).

## Background
Current DTOs still allow branching and unsupported step types. This task enforces the core API contract boundary for the rebuild.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Define journey create/update DTOs that default new definitions to `draft` and accept only linear sequences.
2. Reject branching/switch/non-linear structures and unsupported step types with structured validation issues.
3. Enforce sequencing invariants (single Trigger, no dangling steps, valid ordered chain).
4. Provide a checkpoint with API contract tests proving valid linear payload persistence and non-linear rejection with no side effects.

## Dependencies
- task-02-implement-appointment-lifecycle-classifier.code-task.md

## Implementation Approach
1. Write failing schema/route tests for valid linear definitions, invalid non-linear definitions, and restricted step types.
2. Implement DTO schemas and route contract adoption for journey payloads.
3. Refactor validation wiring to keep API errors structured and tests green.

## Acceptance Criteria

1. **Linear Payload Persists in Draft State**
   - Given a valid linear journey payload
   - When create is called
   - Then the journey persists successfully in `draft` state.

2. **Non-Linear Payload Is Rejected Atomically**
   - Given a branching or malformed journey payload
   - When create or update is called
   - Then API returns validation errors and persists nothing.

3. **Step Set Restriction Enforced**
   - Given a payload containing unsupported step types
   - When validation runs
   - Then payload is rejected and only Trigger/Wait/Send Message/Logger remain valid.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running DTO/route validation tests
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: dto, validation, api-contracts, journeys
- **Required Skills**: zod-schemas, route-contracts, integration-testing
