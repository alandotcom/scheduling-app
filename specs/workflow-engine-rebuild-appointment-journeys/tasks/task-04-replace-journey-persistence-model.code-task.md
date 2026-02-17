---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Replace Journey Persistence Model

## Description
Replace legacy workflow runtime tables with journey-specific persistence entities (journeys, versions, runs, deliveries) including deterministic identity constraints and history snapshot retention.

## Background
The rebuild requires a big-bang schema replacement. Per repo policy, baseline migration artifacts must be updated directly with no incremental migration files.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Define journey schema tables/relations for definitions, immutable versions, runs, and deliveries.
2. Add deterministic uniqueness constraints for run and delivery identities.
3. Enforce delete behavior where journey definitions/versions hard-delete while run history snapshots remain queryable.
4. Update `packages/db/src/migrations/20260208064434_init/migration.sql` directly and remove legacy workflow runtime schema artifacts.
5. Provide a checkpoint via DB tests proving version pinning constraints and post-delete history visibility.

## Dependencies
- task-03-build-journey-dto-and-linear-validation.code-task.md

## Implementation Approach
1. Write failing DB schema tests for constraints, deterministic indexes, and delete/history behavior.
2. Implement Drizzle schema/relations and baseline migration updates for journey entities.
3. Refactor schema exports and fixtures to keep tests green and remove legacy workflow persistence references.

## Acceptance Criteria

1. **Journey Runtime Schema Replaces Legacy Tables**
   - Given the updated DB schema artifacts
   - When schema tests and snapshots are evaluated
   - Then journey entities exist and legacy workflow runtime tables are removed.

2. **Deterministic Identity Constraints Enforced**
   - Given duplicate run or delivery identity inputs
   - When inserts/upserts execute
   - Then uniqueness constraints enforce deterministic idempotency.

3. **Delete Retains Historical Run Visibility**
   - Given a journey with historical runs
   - When the journey definition is deleted
   - Then definitions/versions are hard-deleted and historical run snapshots remain queryable.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running DB schema tests
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: database, drizzle, schema, migrations
- **Required Skills**: drizzle-orm, postgres-schema-design, db-testing
