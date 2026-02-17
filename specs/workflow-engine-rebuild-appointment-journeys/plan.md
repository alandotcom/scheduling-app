# Implementation Plan

## Planning Anchors

- Big-bang replacement: legacy workflow graph runtime is removed, not bridged.
- DB migration policy: update baseline migration artifacts directly; do not create new incremental migrations for this rebuild.
- Test semantics from A68: `test_only` auto-trigger and manual test start are both supported; both create `mode=test` runs.
- v1 default for approved design ambiguity: test Email override input is a single required destination string.
- v1 default reason-code taxonomy starts small and typed: `past_due`, `wait_already_due`, `execution_terminal`, `manual_cancel`.
- R31 scope is explicit in v1: support both bulk cancel (all active runs for journey) and individual run cancel.
- R40 invariant is explicit: test-mode waits run on configured timing with no acceleration path.
- R44 boundary is explicit: dedupe is run-scoped; different journeys for the same appointment must execute independently.
- R45 behavior is explicit: Logger step writes timeline output and emits to real logger/console.

## Test Strategy (TDD-First)

Write tests first in each slice so they fail against current legacy behavior, then implement until green.

### Unit Tests

1. Appointment lifecycle classifier
   - Target: classifier helper used by appointment mutation paths.
   - Cases:
     - create -> `appointment.scheduled`
     - time/timezone change while not canceled -> `appointment.rescheduled`
     - transition to canceled -> `appointment.canceled`
     - unrelated update -> no lifecycle event

2. Journey definition validation (linear-only)
   - Target: DTO/schema + API payload validator.
   - Cases:
     - accepts `Trigger -> Wait -> Send Message -> Logger` chain
     - rejects branching edges/condition trees/switch constructs
     - rejects unsupported step types
     - rejects malformed sequencing (missing trigger, multiple triggers, dangling steps)

3. Trigger filter AST validator
   - Target: AST schema + semantic validator.
   - Cases:
     - one-level nesting accepted
     - depth > 1 rejected
     - >12 conditions rejected
     - >4 groups rejected
     - field/operator incompatibility rejected with structured errors

4. AST evaluation service (constrained `cel-js`)
   - Target: AST -> constrained CEL compilation and evaluation wrapper.
   - Cases:
     - AND/OR/NOT truth table correctness
     - null checks (`is set`, `is not set`)
     - date/time comparisons for appointment fields
     - unsupported operation fails closed

5. Planner identity and schedule computation
   - Target: deterministic key builders and wait scheduler.
   - Cases:
      - run identity stable for same `(org, journeyVersion, appointment, mode)`
      - distinct journey versions for same appointment keep distinct run/delivery identities (no cross-journey dedupe)
      - delivery identity stable for same `(run, step, schedule context)`
      - wait relative to start/end before/after computes expected UTC time
      - past due computes `skipped` with `reasonCode=past_due`

6. Overlap analyzer
   - Target: publish-time heuristic analyzer.
   - Cases:
     - warnings for clearly overlapping event + high-signal filter dimensions
     - no warnings for disjoint event taxonomies
     - warning payload includes confidence + human-readable reason

7. Test run safety guard
   - Target: test-run start validator.
   - Cases:
      - test run with email step and no override rejected
      - test run with slack-only step and no Slack override accepted
      - both manual and auto-trigger test paths enforce the same Email rule
      - test-mode wait scheduling equals live-mode scheduling for the same step config

8. Run cancellation scope
   - Target: run cancellation service methods and route contracts.
   - Cases:
      - individual run cancel marks only the selected active run terminal
      - bulk cancel for a journey cancels all active runs across versions
      - canceling an already terminal run is idempotent and no-op

9. Logger step sink behavior
   - Target: logger delivery execution path.
   - Cases:
      - logger step appends visible timeline entry on run details
      - logger step emits structured output to logger/console sink
      - logger execution is idempotent for duplicate worker attempts

### Integration Tests

1. Taxonomy cutover propagation
   - DTO domain events + webhook schemas + emitter payloads + Svix catalog sync all use only:
     - `appointment.scheduled`
     - `appointment.rescheduled`
     - `appointment.canceled`

2. Journey lifecycle API + DB behavior
    - create/update/publish/pause/resume/delete on journey definitions
    - unique name per org enforced
    - non-linear payload rejected with no persistence side effects
    - individual run cancel endpoint and bulk journey cancel both enforce R31 scope

3. Planner + worker runtime behavior
    - scheduled event creates run and deliveries
    - reschedule mismatch cancels pending unsent deliveries
    - pause cancels/suppresses pending unsent deliveries
    - resume immediately re-plans from current appointment state
    - cancellation race handled by worker `cancelOn` semantics
    - two journeys matching the same appointment produce independent delivery attempts (no cross-journey dedupe)
    - logger steps produce timeline rows and real logger/console output

4. Version pinning + history retention
   - republish creates new immutable version
   - existing runs remain pinned to original version
   - deleting journey hard-deletes definition and versions while run history remains queryable via snapshots

5. Test mode dual path
   - `test_only` auto-trigger path creates `mode=test` run
   - manual start path creates `mode=test` run
   - missing Email override blocks run start with clear error
   - test-mode wait scheduling remains identical to live-mode scheduling

6. Publish-time overlap warning behavior
   - publish returns warnings when overlap heuristic matches
   - publish still succeeds (warning-only, never blocking)

### Manual E2E Scenario (Validator-Executable)

Scenario: test-only and live behavior with overlap + cancel checks

1. Start stack (`docker compose up -d`, `pnpm bootstrap:dev`, `pnpm dev`) and sign in to admin UI as seeded admin.
2. Create Journey A in `test_only` state:
   - trigger: `appointment.scheduled`
   - filter: client email is set
   - steps: Wait (15 minutes before appointment start) -> Send Message (Email) -> Logger.
3. Attempt manual test run for a known appointment without Email override.
   - Expected: run start rejected with explicit Email override error; no delivery send attempt is created.
4. Start manual test run again with Email override destination.
    - Expected: run created with `mode=test`, delivery planned/executed, logger step appears in run timeline.
5. Create and publish Journey B and Journey C (`published`) with overlapping trigger/filter shape.
    - Expected: publish response surfaces overlap warning(s), publish still succeeds.
6. Trigger a lifecycle event that matches both Journey B and Journey C for the same appointment.
    - Expected: two independent live runs/deliveries are planned (no cross-journey dedupe).
7. Cancel one active run via individual run cancel action.
    - Expected: only selected run is canceled; other journey run remains active.
8. Apply journey-level bulk cancel to Journey C.
    - Expected: all Journey C active runs are canceled.
9. Reschedule the appointment to violate Journey A filter or make wait past due.
    - Expected: pending unsent deliveries are canceled or marked skipped (`past_due`) based on recomputation; test-mode wait timing remains configured and unaccelerated.

## Implementation Steps (TDD Order)

### Step 1: Taxonomy contracts cutover

- Files: `packages/dto/src/schemas/domain-event.ts`, `packages/dto/src/schemas/webhook.ts`, `apps/api/src/services/svix-event-catalog.ts`, related tests.
- Write failing tests first:
  - canonical appointment event names accepted
  - legacy aliases rejected
  - Svix catalog includes only canonical names
- Implement: rename taxonomy and webhook mappings together, then update catalog sync grouping/pruning.
- Depends on: none.
- Demo: catalog sync output shows only canonical appointment lifecycle names.
- Success criteria: taxonomy integration tests pass and no legacy appointment event names remain in DTO/webhook schema snapshots.

### Step 2: Appointment lifecycle classifier implementation

- Files: `apps/api/src/services/appointments.ts` (or extracted classifier helper), emitter tests.
- Write failing tests first:
  - create/reschedule/cancel classification
  - unrelated update emits nothing
- Implement: centralize classifier in appointment mutation paths and emit only canonical events.
- Depends on: Step 1.
- Demo: appointment mutation test fixture emits expected canonical event types.
- Success criteria: acceptance criteria 3-5 covered by automated tests.

### Step 3: Journey DTO contracts + linear validation

- Files: new journey schema files in `packages/dto/src/schemas/`, route contract consumers under `apps/api/src/routes/`.
- Write failing tests first:
  - valid linear payload accepted and defaults to `draft`
  - non-linear payload rejected with structured issues
  - step set restricted to Trigger/Wait/Send Message/Logger
- Implement: replace workflow graph DTO usage with journey DTOs and validation rules.
- Depends on: Step 2.
- Demo: API create call succeeds for valid linear definition and fails for branch payload.
- Success criteria: acceptance criteria 1-2 covered.

### Step 4: Journey persistence model replacement

- Files: `packages/db/src/schema/index.ts`, `packages/db/src/relations.ts`, `packages/db/src/migrations/20260208064434_init/migration.sql`, DB tests.
- Write failing tests first:
  - journey/version/run/delivery table constraints
  - deterministic uniqueness indexes
  - hard-delete definition with retained run snapshot history
- Implement: replace legacy workflow runtime schema with journey entities and relations.
- Depends on: Step 3.
- Demo: DB tests show version-pinned runs and history remains queryable after definition delete.
- Success criteria: schema tests green and legacy workflow runtime tables removed from schema artifacts.

### Step 5: Journey service + lifecycle APIs

- Files: journey services and routes in `apps/api/src/services/` and `apps/api/src/routes/`.
- Write failing tests first:
   - create/update/publish/pause/resume/delete transitions
   - admin-only mutation guard behavior
   - unique journey name enforcement
   - individual run cancel only affects target run
   - delete auto-cancels active runs
- Implement: lifecycle operations, version creation on publish, individual run cancel, and bulk-cancel active runs for selected journey.
- Depends on: Step 4.
- Demo: API walkthrough of publish -> pause -> resume -> delete with expected state transitions.
- Success criteria: acceptance criteria 8-12 partially covered at API layer (runtime replanning completed in later steps), and R31 individual+bulk cancel scope is fully covered.

### Step 6: Trigger filter AST + constrained `cel-js` evaluator

- Files: new filter validator/evaluator modules under `apps/api/src/services/`, DTO AST schema updates, package dependency update for `cel-js`.
- Write failing tests first:
  - AST shape/caps/depth checks
  - operator compatibility and error payloads
  - evaluation matrix for AND/OR/NOT and null/date comparisons
- Implement: canonical AST persistence, backend-only CEL translation and constrained evaluator execution.
- Depends on: Step 5.
- Demo: filter matrix command/test output showing deterministic match/non-match results.
- Success criteria: acceptance criteria around trigger filtering (R13-R20) covered by unit/integration tests.

### Step 7: Planner runtime (Inngest)

- Files: `apps/api/src/inngest/functions/` planner function(s), runtime events/types, planning service modules.
- Write failing tests first:
   - matching scheduled event plans run + deliveries
   - reschedule mismatch cancels pending deliveries
   - duplicate events are idempotent
   - same appointment matching two journeys creates two independent run/delivery sets
   - past due planning yields `skipped` + `past_due`
- Implement: planner as source of truth for desired deliveries, deterministic run/delivery identity, control-event handling hooks.
- Depends on: Step 6.
- Demo: planner test run shows delivery create/cancel/skipped outputs for schedule/reschedule inputs.
- Success criteria: acceptance criteria 6-7 satisfied.

### Step 8: Delivery worker runtime + channel adapters

- Files: `apps/api/src/inngest/functions/` worker function(s), delivery dispatch service, adapter integrations.
- Write failing tests first:
   - sleep-until due then send success
   - cancel race suppresses send and marks `canceled`
   - provider failure marks `failed` with retry behavior
   - resend idempotency key forwarded
   - logger step execution persists timeline entry and emits logger/console sink output
- Implement: worker execution, `cancelOn` cancellation handling, state revalidation before send, status persistence, and logger sink path.
- Depends on: Step 7.
- Demo: end-to-end runtime test from planned delivery event to persisted terminal status.
- Success criteria: worker runtime tests pass for `sent|failed|canceled|skipped` states and logger sink assertions.

### Step 9: Test mode dual-path semantics

- Files: journey service/planner start paths, API endpoints for manual test start, related DTO/API contracts, runs query filters.
- Write failing tests first:
   - `test_only` auto-trigger creates `mode=test`
   - manual test start creates `mode=test`
   - missing Email override rejects start with no send
   - Slack override optional in v1
   - test-mode waits schedule exactly the same as live mode for equivalent wait config
- Implement: remove `dryRun` semantics, enforce Email override gate, keep wait timing unchanged in test mode.
- Depends on: Step 8.
- Demo: one auto-triggered test run and one manual test run both visible as `mode=test`.
- Success criteria: acceptance criteria 13-14 and A68 semantics covered.

### Step 10: Admin builder cutover to linear journey authoring

- Files: `apps/admin-ui/src/features/workflows/` (renamed/refactored to journey surfaces), route screens under `apps/admin-ui/src/routes/_authenticated/`.
- Write failing tests first:
  - non-v1 step types unavailable
  - linear sequence editing/validation works
  - grouped filter builder enforces depth/caps
  - journey state controls expose draft/publish/pause/test-only
- Implement: remove branch/switch UI, implement linear step UX and filter AST builder mapped to new DTO.
- Depends on: Step 9.
- Demo: create and publish linear journey from UI, with invalid structure blocked client-side and server-side.
- Success criteria: UI payloads match journey contracts without legacy graph fields.

### Step 11: Runs UI + overlap warning UX + history UX

- Files: runs panel/details components under `apps/admin-ui/src/features/workflows/`, publish API integration, overlap warning presentation.
- Write failing tests first:
  - mode filters (`test|live`) and badges
  - run timeline shows logger entries + reason codes
  - run actions expose both individual cancel and journey-level bulk cancel with correct scope cues
  - publish overlap warnings rendered while publish succeeds
  - deleted journey run history remains visible
- Implement: update run/detail queries and rendering for journey runs/deliveries, warning display components, snapshot-based history labels.
- Depends on: Step 10.
- Demo: side-by-side test/live runs and a publish response containing overlap warnings.
- Success criteria: acceptance criteria 12 and 15 fully represented in UI tests.

### Step 12: Legacy cleanup + full quality gates

- Files: remove obsolete workflow graph runtime files/routes/UI pieces across API, DTO, DB, and admin UI.
- Write failing tests first:
  - regression checks proving no legacy workflow runtime entry points are referenced
- Implement: delete dead code, update imports/route registrations, ensure no compatibility shims remain.
- Depends on: Step 11.
- Demo: repository grep/tests show only journey runtime surfaces are active.
- Success criteria:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - all pass with no suppressions.

## Completion Criteria for Task Writer Handoff

- Convert each implementation step above into one or more atomic code tasks with Given-When-Then acceptance criteria.
- Preserve TDD order and explicit dependency chain (Step N depends on Step N-1 unless otherwise noted).
- Ensure every code task includes a demo/checkpoint expectation, not only internal refactors.
