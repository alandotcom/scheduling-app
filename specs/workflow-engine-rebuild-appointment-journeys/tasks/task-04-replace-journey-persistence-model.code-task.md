---
status: completed
created: 2026-02-16
started: 2026-02-16
completed: 2026-02-16
---
# Task: Replace Journey Persistence Model

## Description
Replace legacy workflow runtime tables with journey-specific persistence entities, deterministic uniqueness constraints, and run snapshot retention behavior aligned with hard-delete requirements.

## Background
The current DB schema persists graph workflow runtime artifacts. The rebuild requires journey/version/run/delivery tables with version pinning and post-delete history visibility.

## Reference Documentation
**Required:**
- Design: specs/workflow-engine-rebuild-appointment-journeys/design.md

**Additional References:**
- specs/workflow-engine-rebuild-appointment-journeys/context.md (codebase patterns)
- specs/workflow-engine-rebuild-appointment-journeys/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Introduce journey persistence entities and relations for `journeys`, `journey_versions`, `journey_runs`, and `journey_deliveries`.
2. Add deterministic uniqueness/index constraints for run and delivery identities.
3. Update baseline migration artifacts directly (no new incremental migration) and remove legacy workflow runtime tables.

## Dependencies
- task-03-build-journey-dto-and-linear-validation.code-task.md

## Implementation Approach
1. Write failing DB schema tests for table constraints, identity uniqueness, and delete/history behavior.
2. Implement schema and relations updates plus baseline migration changes.
3. Refactor fixtures/helpers to align with journey tables while preserving test readability.

## Acceptance Criteria

1. **Journey Runtime Schema Enforced**
   - Given the updated schema artifacts
   - When DB tests validate table shape and constraints
   - Then journey entities and deterministic indexes are present and valid.

2. **Hard Delete Preserves Run History Visibility**
   - Given a journey with runs and snapshot context
   - When journey definitions and versions are hard-deleted
   - Then run history remains queryable from run snapshots.

3. **Legacy Runtime Tables Removed**
   - Given the baseline schema and migration artifacts
   - When schema inspection runs
   - Then legacy workflow runtime tables are absent.

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the targeted test suite for this slice
   - Then all tests for this task pass.

## Metadata
- **Complexity**: High
- **Labels**: database, drizzle, migrations, journeys
- **Required Skills**: drizzle, postgres18-dev, testing
