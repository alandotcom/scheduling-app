# Progress Log

## 2026-02-16 - Task 01: Cutover Appointment Taxonomy Contracts

### RED
- Updated `packages/dto/src/schemas/webhook.test.ts` to require canonical appointment lifecycle names (`scheduled`, `rescheduled`, `canceled`) and reject legacy aliases.
- Added `apps/api/src/services/svix-event-catalog.test.ts` to assert Svix catalog sync creates canonical appointment event definitions and prunes legacy appointment aliases.
- Confirmed failures before implementation:
  - DTO schema test failed on missing `appointment.rescheduled` contract keys and old enum acceptance.
  - Svix catalog test failed because sync still created `appointment.created|updated|deleted`.

### GREEN
- Updated `packages/dto/src/schemas/webhook.ts` appointment taxonomy to canonical names in:
  - `webhookEventTypes`
  - `webhookEventDataSchemaByType`
  - `webhookEventEnvelopeSchemaByType`
  - `webhookEventEnvelopeSchema`
- Updated `apps/api/src/services/svix-event-catalog.ts` appointment group switch cases to canonical lifecycle names.
- Re-ran targeted tests and both passed.

### REFACTOR
- Kept contract and mapping updates localized to taxonomy surfaces (DTO webhook schema + Svix catalog grouping).
- Added focused taxonomy assertions in DTO tests to make future regressions explicit.
- Captured latest test/build command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-16 - Task 02: Implement Appointment Lifecycle Classifier

### RED
- Added `apps/api/src/services/appointment-lifecycle-classifier.test.ts` covering create (`scheduled`), reschedule (start/timezone changes), cancel transition (`canceled`), and non-lifecycle update no-op behavior.
- Extended `apps/api/src/services/jobs/emitter.test.ts` with canonical appointment lifecycle emitter expectations and explicit rejection of legacy appointment emitter aliases.
- Confirmed failures before implementation:
  - missing classifier module (`appointment-lifecycle-classifier.ts`)
  - missing canonical emitter methods (`appointmentScheduled|appointmentRescheduled|appointmentCanceled`)
  - legacy emitter aliases still present.

### GREEN
- Implemented `apps/api/src/services/appointment-lifecycle-classifier.ts` as a shared classifier that maps appointment mutations to `appointment.scheduled|appointment.rescheduled|appointment.canceled` or `null`.
- Updated `apps/api/src/services/jobs/emitter.ts` appointment emitters to canonical lifecycle names.
- Wired classification into `apps/api/src/services/appointments.ts` via a shared `emitAppointmentLifecycleEvent(...)` helper across create/update/cancel/reschedule/noShow paths.
  - create now emits `appointment.scheduled`
  - reschedule emits `appointment.rescheduled`
  - cancel emits `appointment.canceled`
  - unrelated updates/no-show transitions emit no lifecycle event.

### REFACTOR
- Replaced legacy appointment event literals in affected tests to keep taxonomy consistent across workspaces (`apps/api`, `apps/admin-ui`, `integrations/core`, `packages/dto`).
- Kept runtime logic changes isolated to appointment service + emitter/classifier surfaces for this slice.
- Ran and passed required gates:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Captured latest command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-17 - Validation: Full Quality Gate Recheck

### VALIDATION
- Re-ran full repository quality gates after implementation completion:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- All gates passed with no regressions.

### ARTIFACTS
- Refreshed validation logs:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`

## 2026-02-16 - Task 03: Build Journey DTO and Linear Validation

### RED
- Added DTO contract tests in `packages/dto/src/schemas/workflow.test.ts` for:
  - valid linear `Trigger -> Wait -> Send Message -> Logger` chain acceptance
  - branching graph rejection
  - unsupported step type rejection
- Added route contract tests in `apps/api/src/routes/workflows.test.ts` for:
  - non-linear create rejection with no persistence side effects
  - non-linear update rejection with no persistence side effects
- Initial quality-gate run exposed expected breakages while tightening validation:
  - lint error from unsafe optional chaining in new route assertion
  - runtime test breakage where legacy graph fixtures in service-level tests were rejected by stricter schema parsing.

### GREEN
- Implemented `packages/dto/src/schemas/journey.ts` with `linearJourneyGraphSchema` enforcing:
  - exactly one trigger step
  - linear single-chain topology (no branch/fan-in/cycles/disconnected nodes)
  - supported step set only (`Trigger`, `Wait`, `Send Message`, `Logger`)
- Wired `createWorkflowSchema` and `updateWorkflowSchema` in `packages/dto/src/schemas/workflow.ts` to validate `graph` payloads through `linearJourneyGraphSchema`.
- Exported journey schema surface via `packages/dto/src/schemas/index.ts`.
- Fixed route assertion lint issue (`no-unsafe-optional-chaining`).
- Preserved legacy internal service setup paths by validating `workflowService.create/update` against a service-local relaxed graph schema (`safeExtend` with `serializedWorkflowGraphSchema`) so API boundary validation remains strict while internal runtime tests can continue creating legacy fixtures.

### REFACTOR
- Kept strict linear validation at DTO/API contract boundaries and isolated transitional service-level compatibility logic to `apps/api/src/services/workflows.ts`.
- Aligned new tests with existing `bun:test` style and side-effect checks via direct DB assertions.
- Ran and passed required gates:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Captured latest command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-16 - Task 04: Replace Journey Persistence Model

### RED
- Added `packages/db/src/journeys.constraints.test.ts` with failing coverage for:
  - case-insensitive org-scoped journey name uniqueness
  - deterministic run identity uniqueness `(org_id, journey_version_id, appointment_id, mode)`
  - run-history retention after hard deleting journey definitions/versions
  - required journey index names for planner and worker access patterns
- Confirmed initial RED failure: journey table exports did not exist in `packages/db/src/schema/index.ts`.

### GREEN
- Implemented journey persistence entities in `packages/db/src/schema/index.ts`:
  - enums: `journey_state`, `journey_run_mode`, `journey_run_status`, `journey_delivery_status`
  - tables: `journeys`, `journey_versions`, `journey_runs`, `journey_deliveries`
  - deterministic uniqueness/index constraints:
    - `journey_runs_org_identity_uidx`
    - `journey_deliveries_org_deterministic_key_uidx`
  - run snapshot columns for delete-time history retention:
    - `journey_name_snapshot`
    - `journey_version_snapshot`
- Added journey relations in `packages/db/src/relations.ts` and org-level relation bindings.
- Updated test reset truncation list in `packages/db/src/test-utils.ts` to include journey tables.
- Updated baseline migration artifact `packages/db/src/migrations/20260208064434_init/migration.sql` with:
  - new journey enums
  - new journey table DDL + RLS enablement
  - new journey indexes, FKs, and RLS policies
- Re-ran targeted DB tests until green.

### REFACTOR
- Kept changes constrained to the DB package persistence layer (schema, relations, migration, tests) to preserve incremental cutover flow.
- Deferred hard removal of legacy workflow runtime tables to the dedicated cleanup slice (`task-12`) to avoid breaking still-active runtime surfaces during intermediate steps.
- Ran and passed required gates:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Captured latest command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-16 - Task 05: Implement Journey Lifecycle Services and APIs

### RED
- Added failing lifecycle coverage for the new journey slice:
  - `apps/api/src/services/journeys.test.ts` for create/update/publish/pause/resume/delete transitions, uniqueness, and delete-time run cancellation behavior.
  - `apps/api/src/routes/journeys.test.ts` for admin-only mutation guards and route-level lifecycle wiring.
- Confirmed initial RED failure by running targeted API tests before implementation; test runner failed because `apps/api/src/services/journeys.ts` and `apps/api/src/routes/journeys.ts` did not exist yet.

### GREEN
- Implemented `apps/api/src/services/journeys.ts` with lifecycle operations:
  - create/update with linear graph validation and org-scoped case-insensitive name conflict handling.
  - publish with immutable `journey_versions` snapshot creation and incrementing version numbers.
  - pause/resume transition guards.
  - delete with active-run cancellation (`planned|running` -> `canceled`) and hard delete of journey definitions (versions cascade).
- Implemented `apps/api/src/routes/journeys.ts` with admin-only mutation endpoints and read endpoints:
  - `POST /journeys`, `PATCH /journeys/{id}`, `POST /journeys/{id}/publish`, `POST /journeys/{id}/pause`, `POST /journeys/{id}/resume`, `DELETE /journeys/{id}`.
- Added journey lifecycle DTO contracts to `packages/dto/src/schemas/journey.ts` and used them in the route layer.
- Registered the new route group in `apps/api/src/routes/index.ts` under `uiRouter.journeys`.

### REFACTOR
- Kept legacy `workflows` routes/services intact while introducing the new journey lifecycle API surface to avoid cross-slice regressions.
- Normalized duplicate-name handling to a dedicated conflict mapper keyed to `journeys_org_name_ci_uidx`.
- Ran and passed required gates:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Captured latest command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-16 - Task 06: Add Filter AST and Constrained CEL Evaluator

### RED
- Added failing DTO tests in `packages/dto/src/schemas/workflow.test.ts` for trigger filter AST acceptance/rejection:
  - one-level grouped AST acceptance
  - max group cap (4) rejection
  - total condition cap (12) rejection
  - field/operator compatibility issue-path assertions.
- Added failing evaluator tests in `apps/api/src/services/journey-trigger-filters.test.ts` for deterministic AND/OR/NOT + null/date behavior and fail-closed unsupported operator handling.
- Confirmed initial failures before implementation:
  - `workflowDomainEventTriggerConfigSchema` rejected `filter` payloads as unknown keys.
  - API tests failed due missing evaluator module and missing exported filter AST type.

### GREEN
- Implemented canonical trigger filter AST contracts in `packages/dto/src/schemas/workflow-graph.ts`:
  - operator enum (`equals`, membership, string ops, date ops, null checks)
  - one-level AST shape (`logic -> groups -> conditions`) with no nested groups
  - caps enforcement: max 4 groups and max 12 conditions
  - semantic validation for field root (`appointment.*|client.*`) and operator/value compatibility.
- Wired `workflowDomainEventTriggerConfigSchema` to accept optional `filter` and export filter AST types for downstream usage.
- Added constrained CEL evaluator service in `apps/api/src/services/journey-trigger-filters.ts`:
  - backend-only AST-to-CEL translation
  - bounded CEL environment (`limits`, fixed `values` namespace)
  - deterministic evaluation result (`matched: boolean`)
  - fail-closed controlled error responses (`FILTER_VALIDATION_FAILED`, `UNSUPPORTED_OPERATION`, `CEL_EVALUATION_FAILED`).
- Added route-level rejection coverage in `apps/api/src/routes/journeys.test.ts` to verify invalid filter payloads fail input validation with no persistence side effects.

### REFACTOR
- Reworked evaluator value handling into typed extractor helpers to remove unsafe assertions and keep oxlint/typecheck clean.
- Kept filter persistence canonical at DTO/API boundaries by parsing trigger configs through Zod contracts before journey writes.
- Ran and passed required gates:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Captured latest command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-16 - Task 07: Build Planner Runtime Inngest

### RED
- Added failing planner runtime coverage:
  - `apps/api/src/services/journey-planner.test.ts` for matching-event planning, reschedule mismatch cancellation, duplicate-event idempotency, and past-due skip behavior.
  - `apps/api/src/inngest/functions/journey-domain-triggers.test.ts` for appointment payload validation and planner forwarding in Inngest function wiring.
- Confirmed initial failure before implementation: both test files failed due missing planner service and Inngest trigger modules.

### GREEN
- Implemented `apps/api/src/services/journey-planner.ts` with planner-first behavior:
  - resolves active published/test-only journeys to latest published version snapshots.
  - validates trigger config and routes appointment lifecycle events to plan/cancel paths.
  - creates version-pinned runs via deterministic run identity (`org + version + appointment + mode`).
  - computes desired deliveries from linear journey steps (wait/send/logger), persists deterministic delivery identities, and emits schedule/cancel control events.
  - marks due-in-the-past deliveries as `skipped` with `reasonCode=past_due`.
  - cancels pending unsent deliveries on stop-event or filter mismatch.
- Added appointment planner Inngest trigger wiring:
  - `apps/api/src/inngest/functions/journey-domain-triggers.ts`
  - `apps/api/src/inngest/functions/index.ts`
- Extended runtime event contracts for planner outputs:
  - `apps/api/src/inngest/client.ts`
  - `apps/api/src/inngest/runtime-events.ts`

### REFACTOR
- Reworked appointment payload parsing in `journey-domain-triggers.ts` to avoid unsafe assertions and satisfy strict type/lint gates while keeping deterministic validation errors.
- Kept planner logic isolated to new journey runtime surfaces; no legacy workflow runtime behavior was altered in this slice.
- Ran and passed required gates:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Captured latest command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-16 - Task 08: Build Delivery Worker and Adapters

### RED
- Added failing worker/runtime coverage for this slice:
  - `apps/api/src/services/journey-delivery-worker.test.ts` for due-time sleep/send success, cancellation race suppression, provider failure retry exhaustion, and idempotency-key forwarding.
  - `apps/api/src/inngest/functions/journey-delivery-scheduled.test.ts` for worker function `cancelOn` wiring and runtime payload forwarding.
- Confirmed initial RED failure before implementation: both test files failed because `journey-delivery-worker` service and `journey-delivery-scheduled` function modules did not exist.

### GREEN
- Implemented delivery adapter dispatch surface in `apps/api/src/services/journey-delivery-adapters.ts` with channel-based adapter routing and deterministic idempotency key propagation.
- Implemented worker runtime in `apps/api/src/services/journey-delivery-worker.ts`:
  - sleeps until due,
  - revalidates latest delivery/run eligibility before dispatch,
  - suppresses canceled/terminal races,
  - dispatches through adapters with fixed retry attempts,
  - persists terminal delivery statuses (`sent|failed|canceled`) and refreshes run status progression.
- Added Inngest worker function in `apps/api/src/inngest/functions/journey-delivery-scheduled.ts` with cancellation control-event wiring (`journey.delivery.canceled`) and runtime hooks.
- Registered the worker in `apps/api/src/inngest/functions/index.ts`.
- Re-ran targeted tests and passed:
  - `pnpm --filter @scheduling/api run test -- src/services/journey-delivery-worker.test.ts src/inngest/functions/journey-delivery-scheduled.test.ts`

### REFACTOR
- Removed loop-based retry flow in worker service and replaced it with recursive retry handling to satisfy lint constraints (`no-await-in-loop`) while preserving sequential retry semantics.
- Simplified function runtime `runStep` bridge to avoid unsafe type assertions and keep lint/typecheck clean.
- Ran and passed required gates:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Captured latest command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-16 - Task 09: Implement Test Mode Dual Path Semantics

### RED
- Added failing test coverage for test-mode semantics:
  - `apps/api/src/services/journey-planner.test.ts` now asserts `test_only` journeys create `mode=test` runs.
  - `apps/api/src/services/journeys.test.ts` now asserts manual test start creates `mode=test`, rejects missing Email override without creating runs/deliveries, and allows Slack-only runs without override.
  - `apps/api/src/routes/journeys.test.ts` now asserts admin-only test-start route access, successful manual test start, and override validation behavior.
- Confirmed RED failures before implementation:
  - `journeyService.startTestRun` was missing.
  - `journeyRoutes.startTestRun` was missing.

### GREEN
- Added journey test-start DTO contracts in `packages/dto/src/schemas/journey.ts`:
  - `startJourneyTestRunSchema`
  - `startJourneyTestRunResponseSchema`
- Implemented manual test-start service flow in `apps/api/src/services/journeys.ts`:
  - validates journey lifecycle readiness and latest version snapshot
  - enforces Email override for graphs containing Email send-message steps
  - resolves appointment payload and starts a real planner run in `mode=test`
  - returns deterministic started run identity (`runId`) and `mode=test`
- Extended planner in `apps/api/src/services/journey-planner.ts` with targeted processing controls for manual starts:
  - optional `journeyIds` scoping
  - optional `modeOverride` (`live|test`)
- Added API route `POST /journeys/{id}/test-start` in `apps/api/src/routes/journeys.ts` and wired it to `journeyService.startTestRun`.
- Re-ran targeted tests and passed:
  - `pnpm --filter @scheduling/api run test -- src/services/journey-planner.test.ts src/services/journeys.test.ts src/routes/journeys.test.ts`

### REFACTOR
- Restructured `journeyService.startTestRun` to avoid nested `withOrg(...)` calls by separating DB validation/load from planner invocation (prevents transaction contention in tests/runtime).
- Kept override enforcement scoped to manual test-start semantics while preserving `test_only` auto-trigger behavior and wait timing.
- Ran and passed required gates:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Captured latest command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-16 - Task 10: Cutover Admin Builder to Linear Journeys

### RED
- Updated UI tests to codify the new builder constraints and lifecycle controls:
  - `apps/admin-ui/src/features/workflows/workflow-editor-sidebar.test.tsx` now requires only v1 step types (`Wait`, `Send Message`, `Logger`) and rejects legacy options.
  - `apps/admin-ui/src/features/workflows/workflow-editor-store.test.ts` now requires single-edge linear behavior (one outgoing + one incoming) and no switch branch auto-generation.
  - `apps/admin-ui/src/features/workflows/workflow-trigger-config.test.tsx` now requires grouped filter editing plus cap validation (`max 4 groups`, `max 12 conditions`).
  - Added `apps/admin-ui/src/features/workflows/workflow-toolbar.test.tsx` for `draft|published|paused|test_only` lifecycle controls.
- Confirmed RED failures before implementation across trigger filter controls, toolbar lifecycle controls, and linear connection behavior.

### GREEN
- Cut over authorable step set to journey v1 in `apps/admin-ui/src/features/workflows/action-registry.ts`:
  - removed legacy `http-request`, `condition`, and `switch` actions
  - added `send-message` and retained `wait` + `logger`.
- Updated builder rendering for the new step set:
  - `apps/admin-ui/src/features/workflows/config/action-grid.tsx`
  - `apps/admin-ui/src/features/workflows/nodes/action-node.tsx`.
- Implemented grouped trigger filter builder with cap enforcement in `apps/admin-ui/src/features/workflows/workflow-trigger-config.tsx`:
  - one-level groups/conditions only
  - local draft editing with `onUpdate` AST emission
  - explicit UI validation messages when group/condition caps are exceeded.
- Enforced linear authoring semantics in `apps/admin-ui/src/features/workflows/workflow-editor-store.ts`:
  - connecting a source replaces existing outgoing edge
  - connecting to a target replaces existing incoming edge
  - removed switch branch auto-fanout behavior.
- Cut over admin UI API surfaces to journeys:
  - `apps/admin-ui/src/routes/_authenticated/workflows/index.tsx` now loads `orpc.journeys.list`
  - `apps/admin-ui/src/features/workflows/workflow-list-page.tsx` now creates/lists/deletes/publishes/pauses/resumes journeys
  - `apps/admin-ui/src/routes/_authenticated/workflows/$workflowId.tsx` now loads/saves `orpc.journeys.*` and drives lifecycle controls from journey state.
- Updated `apps/admin-ui/src/features/workflows/workflow-editor-connect.test.ts` to reflect linear one-edge-per-side constraints.

### REFACTOR
- Kept the existing `/workflows` route shell and component organization while replacing legacy workflow behaviors underneath, minimizing route churn.
- Removed unsafe filter-operator assertions in trigger config by introducing a typed operator guard.
- Ran and passed required gates:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Captured latest command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-16 - Task 11: Update Runs UI, Overlap Warnings, and History UX

### RED
- Added failing API coverage for this slice:
  - `apps/api/src/services/journeys.test.ts` now asserts publish overlap warnings for matching trigger dimensions and run-detail snapshot visibility after definition deletion.
  - `apps/api/src/routes/journeys.test.ts` now asserts new runs endpoints support mode filtering and preserve run snapshot metadata after version deletion.
- Added failing admin UI coverage:
  - `apps/admin-ui/src/features/workflows/workflow-runs-panel.test.tsx` for test/live filtering, mode badges, logger timeline entries, reason-code labels, and deleted-journey snapshot labels.
  - `apps/admin-ui/src/features/workflows/workflow-toolbar.test.tsx` for publish warning rendering.
- Confirmed expected RED failures before implementation due missing journey run APIs/UI surfaces and publish warnings still returning empty arrays.

### GREEN
- Implemented overlap-warning heuristic in `apps/api/src/services/journeys.ts`:
  - compares shared start/restart events against other published/test-only/paused journeys
  - emits non-blocking warnings for broad overlaps and matching high-signal filters (`appointment.calendarId`, `appointment.appointmentTypeId`, `appointment.clientId`).
- Added journey run APIs:
  - service methods `listRuns(...)` and `getRun(...)`
  - routes `GET /journeys/{id}/runs` and `GET /journeys/runs/{runId}` in `apps/api/src/routes/journeys.ts`.
- Expanded DTO contracts in `packages/dto/src/schemas/journey.ts` with journey run/query/detail schemas and typed run/delivery state surfaces.
- Replaced legacy workflow execution panel with journey run UX in `apps/admin-ui/src/features/workflows/workflow-runs-panel.tsx`:
  - mode badges and All/Live/Test filters
  - timeline rendering for logger/send entries
  - reason-code labels and snapshot-based deleted-journey labels.
- Wired publish warning rendering in editor toolbar:
  - `apps/admin-ui/src/features/workflows/workflow-toolbar.tsx`
  - `apps/admin-ui/src/routes/_authenticated/workflows/$workflowId.tsx` captures publish response warnings and displays them inline.

### REFACTOR
- Simplified node-status hydration in runs panel to deterministic per-step latest status mapping from run deliveries.
- Kept warning UX inline (non-blocking) and retained existing toast error-only behavior.
- Ran and passed required gates:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Captured latest command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-16 - Task 12: Remove Legacy Runtime and Run Quality Gates

### RED
- Added explicit regression checks to fail while legacy surfaces still existed:
  - `apps/api/src/routes/index.test.ts` requires `uiRouter.workflows` to be absent.
  - `packages/dto/src/schemas/journey-cutover.test.ts` requires workflow DTO exports (`createWorkflowSchema`, `workflowExecutionSchema`) to be absent.
  - `packages/db/src/journeys.constraints.test.ts` requires legacy workflow runtime tables to be absent from `pg_tables`.
- Confirmed all three checks failed before cleanup.

### GREEN
- Removed legacy workflow runtime API surfaces and wiring:
  - deleted workflow routes/services/repository/runtime files and related tests under `apps/api/src/routes`, `apps/api/src/services`, `apps/api/src/repositories`, and `apps/api/src/inngest/functions`.
  - removed workflow route mounting from `apps/api/src/routes/index.ts`.
  - removed workflow internal event schemas from `apps/api/src/inngest/client.ts` and workflow event senders from `apps/api/src/inngest/runtime-events.ts`.
  - removed workflow Inngest function registration in `apps/api/src/inngest/functions/index.ts`.
- Removed legacy workflow DTO contracts by deleting `packages/dto/src/schemas/workflow.ts` (+ tests) and removing export from `packages/dto/src/schemas/index.ts`.
- Switched remaining admin creation entry point to journeys API in `apps/admin-ui/src/features/workflows/create-workflow-dialog.tsx` (`orpc.journeys.create`, `createJourneySchema`).
- Removed legacy workflow persistence model from DB artifacts:
  - deleted workflow table definitions from `packages/db/src/schema/index.ts`.
  - removed workflow relations from `packages/db/src/relations.ts`.
  - removed workflow reset/truncation entries from `packages/db/src/test-utils.ts`.
  - removed workflow DDL/index/FK/policy statements from baseline migration `packages/db/src/migrations/20260208064434_init/migration.sql`.
  - deleted obsolete workflow DB constraints test file and updated `packages/db/src/rls.test.ts` to journey coverage.
- Re-ran targeted RED tests and they passed.

### REFACTOR
- Updated router composition expectations in `apps/api/src/routes/router-composition.test.ts` to assert journeys exposure and workflow-route absence.
- Kept shared wait-time helper (`workflow-wait-time.ts`) as a neutral utility used by journey planner runtime.
- Ran and passed required gates:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Captured latest command output in:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`

## 2026-02-16 - Task 01: Cut Over Appointment Taxonomy Contracts (Revalidation)

### RED
- Added domain-event taxonomy assertions in `packages/dto/src/schemas/webhook.test.ts` to lock canonical appointment lifecycle names and explicit rejection of legacy aliases at the `domainEventTypeSchema` surface.

### GREEN
- Confirmed taxonomy contracts stay canonical across DTO + Svix surfaces:
  - `pnpm --filter @scheduling/dto run test -- src/schemas/webhook.test.ts`
  - `pnpm --filter @scheduling/api run test -- src/services/svix-event-catalog.test.ts`
- Both targeted suites passed.

### REFACTOR
- Re-ran full quality gates and refreshed logs:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Updated artifacts:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`

## 2026-02-16 - Task 02: Implement Appointment Lifecycle Classifier (Revalidation)

### RED
- Re-ran focused classifier/emitter suites to confirm task-02 contract coverage still guards canonical mapping behavior:
  - `apps/api/src/services/appointment-lifecycle-classifier.test.ts`
  - `apps/api/src/services/jobs/emitter.test.ts`
- Verified this coverage still enforces:
  - create => `appointment.scheduled`
  - time/timezone change => `appointment.rescheduled`
  - cancel transition => `appointment.canceled`
  - non-lifecycle update => no event.

### GREEN
- Confirmed task-02 implementation is present and wired through the centralized helper path:
  - classifier module: `apps/api/src/services/appointment-lifecycle-classifier.ts`
  - canonical emitters: `apps/api/src/services/jobs/emitter.ts`
  - mutation callsite helper integration: `apps/api/src/services/appointments.ts`
- Ran targeted verification:
  - `pnpm --filter @scheduling/api run test -- src/services/appointment-lifecycle-classifier.test.ts src/services/jobs/emitter.test.ts`

### REFACTOR
- Re-ran full required quality gates to validate no regressions for this slice:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Refreshed task logs at:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`

## 2026-02-16 - Task 03: Build Journey DTO and Linear Validation (Revalidation)

### RED
- Added DTO contract coverage in `packages/dto/src/schemas/journey-cutover.test.ts` for:
  - valid linear `Trigger -> Wait -> Send Message -> Logger` acceptance
  - create/update branching payload rejection
  - legacy `actionType: "email"` alias rejection
- Added API route contract coverage in `apps/api/src/routes/journeys.test.ts` for:
  - create non-linear rejection with no persistence side effects
  - update non-linear rejection with no persisted draft mutation
  - legacy step-type alias rejection at route input boundary.
- Confirmed expected RED failure before implementation: DTO test accepted legacy `actionType: "email"` alias.

### GREEN
- Tightened `linearJourneyGraphSchema` in `packages/dto/src/schemas/journey.ts` to enforce strict step-type validation:
  - removed legacy send-message aliases (`send_email`, `email`, `slack`, etc.)
  - removed implicit fallback that treated legacy integration config as `send-message`
- Re-ran targeted suites and verified they pass:
  - `pnpm --filter @scheduling/dto run test -- src/schemas/journey-cutover.test.ts`
  - `pnpm --filter @scheduling/api run test -- src/routes/journeys.test.ts`

### REFACTOR
- Kept compatibility tightening isolated to DTO/API validation surfaces for this task so runtime slices remain unaffected.
- Re-ran full required quality gates and refreshed logs:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Updated artifacts:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`

## 2026-02-16 - Task 04: Replace Journey Persistence Model (Revalidation)

### RED
- Expanded `packages/db/src/journeys.constraints.test.ts` with new persistence checkpoints for:
  - immutable version uniqueness per journey (`journey_versions_org_journey_version_uidx` behavior)
  - deterministic delivery identity uniqueness (`journey_deliveries_org_deterministic_key_uidx` behavior)
- Initial test draft used an invalid delivery status literal (`scheduled`), which failed type checks against the DB enum contract.

### GREEN
- Updated new delivery-fixture statuses to the canonical enum value (`planned`) and re-ran targeted DB coverage:
  - `pnpm --filter @scheduling/db run test -- src/journeys.constraints.test.ts`
- Targeted suite passed, confirming both new uniqueness checkpoints and existing delete-time history retention assertions.

### REFACTOR
- Kept this slice scoped to DB contract tests only (no schema shape churn), preserving the task's persistence-model boundary.
- Re-ran required quality gates and refreshed logs:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Updated artifacts:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`

## 2026-02-17 - Task 05: Implement Journey Lifecycle Services and APIs (Revalidation)

### RED
- Added failing R31 scope coverage for explicit run cancellation paths:
  - `apps/api/src/services/journeys.test.ts` now asserts individual run cancel, journey-level bulk cancel, and terminal-run idempotent no-op behavior.
  - `apps/api/src/routes/journeys.test.ts` now asserts admin-only guards for cancellation endpoints and route-level cancellation scope behavior.
- Confirmed RED failures before implementation:
  - `journeyService.cancelRun(...)` and `journeyService.cancelRuns(...)` were missing.
  - `journeyRoutes.cancelRun` and `journeyRoutes.cancelRuns` were missing.

### GREEN
- Added cancellation DTO contracts in `packages/dto/src/schemas/journey.ts`:
  - `cancelJourneyRunResponseSchema`
  - `cancelJourneyRunsResponseSchema`
- Implemented journey service cancellation APIs in `apps/api/src/services/journeys.ts`:
  - `cancelRun(runId, context)` for individual active-run cancellation with terminal-run no-op semantics.
  - `cancelRuns(journeyId, context)` for journey-scoped bulk cancellation across active runs and versions.
  - shared cancellation helpers to keep delivery + run status transitions consistent (`planned|running` => `canceled`, planned deliveries => `canceled` with `reasonCode=manual_cancel`).
- Added route handlers in `apps/api/src/routes/journeys.ts`:
  - `POST /journeys/runs/{runId}/cancel`
  - `POST /journeys/{id}/runs/cancel`
- Re-ran targeted API tests and verified green:
  - `pnpm --filter @scheduling/api run test -- src/services/journeys.test.ts src/routes/journeys.test.ts`

### REFACTOR
- Kept cancellation semantics centralized through shared service helpers to avoid divergence between pause/delete and explicit cancel endpoints.
- Re-ran full required quality gates and refreshed logs:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
- Updated artifacts:
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/build.log`
  - `specs/workflow-engine-rebuild-appointment-journeys/logs/test.log`
