---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Cut Over Appointment Taxonomy Contracts

## Description
Replace legacy appointment event aliases with the canonical taxonomy across DTO domain events, webhook schemas, and Svix event catalog sync so all downstream surfaces use the same three lifecycle names.

## Background
The current taxonomy still contains legacy names. This step is the contract foundation for classifier, planner, webhooks, and UI integrations.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Restrict appointment lifecycle event types to `appointment.scheduled`, `appointment.rescheduled`, and `appointment.canceled` in DTO and webhook schemas.
2. Reject legacy aliases in validation and update tests/snapshots to prove only canonical names are accepted.
3. Update Svix catalog grouping/pruning logic so catalog sync outputs only canonical appointment lifecycle event names.
4. Provide a checkpoint by running taxonomy integration tests and recording catalog sync output expectations.

## Dependencies
- None (first implementation slice).

## Implementation Approach
1. Write failing tests for accepted canonical event names, rejected legacy aliases, and Svix catalog output.
2. Implement synchronized taxonomy cutover in DTO schemas, webhook payload maps, and catalog sync logic.
3. Refactor naming/constants to remove drift points while keeping tests green.

## Acceptance Criteria

1. **Canonical Taxonomy Enforced**
   - Given domain-event and webhook payload validation
   - When appointment lifecycle events are validated
   - Then only the three canonical event names are accepted.

2. **Legacy Aliases Rejected**
   - Given a payload using legacy appointment event aliases
   - When schema validation runs
   - Then validation fails with structured errors and no legacy alias remains in snapshots.

3. **Svix Catalog Uses Canonical Names Only**
   - Given catalog sync execution
   - When Svix event catalog entries are generated and pruned
   - Then only canonical appointment lifecycle names are present.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the relevant DTO/webhook/catalog tests
   - Then all tests for this task pass.

## Metadata
- **Complexity**: Medium
- **Labels**: dto, webhooks, taxonomy, api
- **Required Skills**: zod-schemas, api-testing, event-contracts
