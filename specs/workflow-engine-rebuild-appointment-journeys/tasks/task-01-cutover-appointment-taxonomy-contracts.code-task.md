---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Cutover Appointment Taxonomy Contracts

## Description
Replace legacy appointment event names with the canonical lifecycle taxonomy across DTO and webhook contracts, and align Svix catalog sync behavior so downstream consumers only see supported event names.

## Background
The current domain-event and webhook schemas still expose legacy names and aliases. Taxonomy is coupled across DTO schemas, emitters, and Svix catalog sync, so this cutover must land consistently in one slice.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Domain and webhook appointment taxonomy must be exactly `appointment.scheduled`, `appointment.rescheduled`, and `appointment.canceled`.
2. Legacy appointment aliases must be rejected by schema validation and removed from snapshots/fixtures.
3. Svix catalog sync must create/update/prune so only canonical appointment events remain.

## Dependencies
- None.

## Implementation Approach
1. Write failing contract and catalog tests for canonical-only taxonomy.
2. Update DTO/webhook schemas and Svix catalog mapping logic until tests pass.
3. Refactor shared constants to remove duplicate string literals while keeping behavior unchanged.

## Acceptance Criteria

1. **Canonical Taxonomy Applied**
   - Given the updated DTO/webhook schemas
   - When appointment event types are validated
   - Then only `appointment.scheduled`, `appointment.rescheduled`, and `appointment.canceled` are accepted.

2. **Legacy Aliases Rejected**
   - Given a legacy appointment event alias payload
   - When schema validation runs
   - Then validation fails with a clear structured error.

3. **Catalog Contains Canonical Names Only**
   - Given catalog sync runs against existing Svix definitions
   - When sync completes
   - Then only canonical appointment lifecycle events remain in the catalog payload.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: Medium
- **Labels**: api, dto, webhooks, taxonomy
- **Required Skills**: testing, dto-contracts
