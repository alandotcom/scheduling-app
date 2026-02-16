# Workflow Engine Rebuild Plan (Appointment Journeys)

## 1) Goal

Rebuild and simplify the current workflow engine into an **appointment-only journey system** with:

- First-class lifecycle events:
  - `appointment.scheduled`
  - `appointment.rescheduled`
  - `appointment.canceled`
- Inngest-first runtime semantics (planner + delivery worker)
- Linear journey model (no generic graph orchestration)
- Global workspace message limits (enforced at send time)
- User-visible webhook feature preserved

This is a **big-bang replacement**. We are not preserving legacy workflow engine behavior.

---

## 2) Final Product Decisions (Locked)

## 2.1 Scope

- Workflow product becomes **appointment-only**.
- Existing generic/multi-domain workflow authoring and execution is removed.
- Existing workflow records are treated as disposable dev data.

## 2.2 Event model

- Appointment lifecycle uses **new canonical event names only**:
  - `appointment.scheduled`
  - `appointment.rescheduled`
  - `appointment.canceled`
- Legacy appointment event names are removed from canonical domain/webhook event catalogs:
  - `appointment.created`
  - `appointment.updated`
  - `appointment.deleted`
- Non-appointment events stay as-is for webhook/integration triggering.

## 2.3 Journey trigger semantics (v1)

- Start condition: **scheduled only**.
- Reschedule acts as sync signal for future waits/deliveries.
- Cancel acts as exit signal (cancel pending deliveries).

## 2.4 Builder/runtime shape (v1)

- New definition model (no serialized generic graph).
- Supported nodes:
  - Trigger
  - Wait
  - Send Message
  - Logger
- Journey structure is linear in v1.

## 2.5 Delivery channels (v1)

- Real channels: **Email (Resend)** + **Slack**.
- SMS deferred.

## 2.6 Message limits (v1)

- Per-workspace, per-channel fixed-window limits.
- Enforced at send time.
- On limit hit: **suppress-only** in v1 (no delayed retry queue).
- Full settings UI included.

## 2.7 Webhooks

- Keep webhook feature behavior for users.
- Appointment webhook event options become the new lifecycle names only.
- Non-appointment webhook events remain.

---

## 3) Current Code Baseline (What exists today)

The current system is a generic domain-event graph runtime with wait-state orchestration.

## 3.1 Runtime execution path

- Trigger ingestion and orchestration:
  - `apps/api/src/services/workflow-domain-triggers.ts`
  - `apps/api/src/services/workflow-trigger-registry.ts`
  - `apps/api/src/services/workflow-trigger-orchestrator.ts`
- Run execution:
  - `apps/api/src/services/workflow-run-requested.ts`
  - `apps/api/src/services/workflow-runtime/*`
- Inngest functions:
  - `apps/api/src/inngest/functions/workflow-domain-triggers.ts`
  - `apps/api/src/inngest/functions/workflow-run-requested.ts`

## 3.2 Persistence model

- `workflows`
- `workflow_executions`
- `workflow_execution_logs`
- `workflow_execution_events`
- `workflow_wait_states`

Defined in:

- `packages/db/src/schema/index.ts`
- `apps/api/src/repositories/workflows.ts`

## 3.3 Event taxonomy coupling today

- `domain-event` schema aliases `webhook` schema.
- Current appointment events are `created/updated/deleted`.

Defined in:

- `packages/dto/src/schemas/domain-event.ts`
- `packages/dto/src/schemas/webhook.ts`

## 3.4 Appointment service emit points

- Appointment lifecycle currently emits `appointment.created`/`appointment.updated`.

Source:

- `apps/api/src/services/appointments.ts`
- `apps/api/src/services/jobs/emitter.ts`

## 3.5 Webhook catalog sync

- Svix event catalog is generated from webhook DTO event types.

Source:

- `apps/api/src/services/svix-event-catalog.ts`

## 3.6 Integration fanout

- Inngest fanout exists for canonical domain events.
- App-managed integration definitions exist for `logger`, `resend`, `slack`.

Source:

- `apps/api/src/inngest/functions/integration-fanout.ts`
- `apps/api/src/services/integrations/app-managed.ts`
- `apps/api/src/services/integrations/runtime.ts`

---

## 4) Target Architecture

## 4.1 High-level model

Use two Inngest functions:

1. `appointment-journey-planner`
- Triggered by appointment lifecycle events.
- Computes intended deliveries for each active journey.
- Upserts delivery artifacts.
- Emits schedule/cancel internal events.

2. `appointment-delivery-worker`
- Triggered per delivery schedule event.
- Sleeps until `scheduledFor`.
- Cancels on matching cancel events.
- Rechecks appointment state and workspace limits.
- Sends via channel dispatcher (Resend/Slack).
- Persists outcome.

## 4.2 Internal runtime events

- `journey.delivery.scheduled`
- `journey.delivery.canceled`

These replace generic `workflow/run.requested` orchestration for journey execution.

## 4.3 Identity

- `journeyKey = journeyId + ":" + appointmentId`

## 4.4 Lifecycle classification rules

- `appointment.scheduled`:
  - on create
- `appointment.canceled`:
  - status transition `!= cancelled` -> `cancelled`
- `appointment.rescheduled`:
  - start/end/timezone changed and resulting status is not cancelled
- ignore other appointment mutations for journey triggering

---

## 5) Data Model Direction

We will replace generic workflow runtime artifacts with journey artifacts.

## 5.1 Definition storage

- Replace generic graph payload with explicit journey definition schema.
- Persist only appointment-journey-compatible structures.

## 5.2 Runtime storage

Introduce journey-focused tables (final names may vary, semantics fixed):

- `journey_runs`
- `journey_deliveries`
- `workspace_message_limits`
- `message_limit_counters`
- delivery status history (folded into deliveries or separate table)

## 5.3 Constraints

- Idempotent uniqueness for planned deliveries.
- Deterministic identity for cancellation/reschedule replacement.
- Atomic counter update for message limits.

## 5.4 Migration policy for this repo

- **Do not create incremental migrations**.
- Update initial SQL migration artifacts and reset dev DB per repo policy.

---

## 6) Phased Execution Plan

## Phase 1: Canonical Event Taxonomy Cutover

### Objective
Switch appointment events to lifecycle names and decouple domain-event typing from webhook typing.

### Tasks

1. DTO event taxonomy
- Update appointment event names in:
  - `packages/dto/src/schemas/domain-event.ts`
  - `packages/dto/src/schemas/webhook.ts`
- Keep non-appointment event sets unchanged.

2. Emitter and appointment service
- Update emit calls in:
  - `apps/api/src/services/appointments.ts`
  - `apps/api/src/services/jobs/emitter.ts`
- Implement strict classification rules above.

3. Inngest schema wiring
- Update event schema typing in:
  - `apps/api/src/inngest/client.ts`
  - `apps/api/src/inngest/functions/integration-fanout.ts`

4. Svix catalog sync
- Regenerate catalog behavior from updated webhook event list in:
  - `apps/api/src/services/svix-event-catalog.ts`

### Acceptance criteria

- Appointment lifecycle emits only scheduled/rescheduled/canceled.
- Webhook catalog presents new appointment event names.
- Non-appointment events continue functioning.

---

## Phase 2: Journey Definition Model + DB Foundation

### Objective
Replace graph-based workflow definition/persistence with journey-focused schema and storage.

### Tasks

1. DTO schema replacement
- Replace graph-oriented schema usage in:
  - `packages/dto/src/schemas/workflow.ts`
  - `packages/dto/src/schemas/workflow-graph.ts` (remove or retire)
- Introduce journey definition types (trigger + linear steps).

2. DB schema replacement
- Replace workflow runtime tables in:
  - `packages/db/src/schema/index.ts`
- Update initial migration SQL/snapshot files accordingly.

3. Repository/service contracts
- Replace repository APIs in:
  - `apps/api/src/repositories/workflows.ts`
- Update service contracts in:
  - `apps/api/src/services/workflows.ts`

### Acceptance criteria

- API can create/read/update appointment journey definitions.
- Journey runtime artifacts persist in new tables only.

---

## Phase 3: Inngest Runtime Rebuild (Planner + Delivery)

### Objective
Replace generic workflow runtime with planner/delivery architecture.

### Tasks

1. Add planner function
- New function under `apps/api/src/inngest/functions/`.
- Trigger on appointment lifecycle events.
- Compute/upsert deliveries and emit schedule/cancel runtime events.

2. Add delivery worker function
- Trigger on `journey.delivery.scheduled`.
- Use `step.sleepUntil`.
- Cancel with `cancelOn` using `journey.delivery.canceled`.
- Recheck appointment state before send.

3. Delivery send path
- Implement sender dispatcher in API service layer.
- Reuse existing integration config/secrets/runtime for Resend + Slack.

4. Remove legacy runtime
- Delete/retire:
  - `apps/api/src/services/workflow-run-requested.ts`
  - `apps/api/src/services/workflow-runtime/*`
  - `apps/api/src/services/workflow-domain-triggers.ts`
  - `apps/api/src/services/workflow-trigger-registry.ts`
  - `apps/api/src/services/workflow-trigger-orchestrator.ts`
  - `apps/api/src/inngest/functions/workflow-run-requested.ts`
  - `apps/api/src/inngest/functions/workflow-domain-triggers.ts`

### Acceptance criteria

- Journey runs are planned and delivered through planner/worker only.
- Reschedules update future deliveries correctly.
- Cancellations cancel pending deliveries.

---

## Phase 4: Message Limits (Backend + UI)

### Objective
Ship workspace-level channel limits with suppress-only behavior.

### Tasks

1. Backend policy + storage
- Add limit tables/queries in db/repository/service layers.
- Enforce check+increment atomically at send time.

2. Admin settings UI
- Add per-channel limit management in settings.
- Keep semantics simple: enable + cap + window + suppress mode.

3. Node-level control
- Add `countTowardLimits` toggle on Send Message step config.

### Acceptance criteria

- Limits are enforced per org/channel window.
- Suppressed sends are recorded and visible.

---

## Phase 5: Admin UI Big-Bang Builder Replacement

### Objective
Replace generic workflow editor with appointment journey builder and maintain runs observability.

### Tasks

1. Trigger config replacement
- Replace generic trigger UI in:
  - `apps/admin-ui/src/features/workflows/workflow-trigger-config.tsx`
- New trigger UX: scheduled start, keep-in-sync behavior, cancel exit.

2. Node/action model simplification
- Update action registry:
  - `apps/admin-ui/src/features/workflows/action-registry.ts`
- Remove switch/condition/http-request from builder.
- Keep Trigger/Wait/Send Message/Logger.

3. Configuration UIs
- Update renderer and node configs:
  - `apps/admin-ui/src/features/workflows/config/action-config-renderer.tsx`
  - related node components under `apps/admin-ui/src/features/workflows/nodes/`

4. Runs panel compatibility
- Preserve runs panel UX semantics with new backend data model.

5. Preview and publish checks
- Add timeline preview and warnings for reschedule-sensitive waits.

### Acceptance criteria

- Users can build and publish linear appointment journeys only.
- Runs panel remains usable with new runtime model.

---

## Phase 6: Cleanup, Docs, and Verification

### Objective
Remove dead code, align docs, and ensure all quality gates pass.

### Tasks

1. Dead code removal
- Remove legacy engine tests/services/routes no longer used.

2. Documentation updates
- Update:
  - `PLAN.md` (this file)
  - `docs/guides/workflow-engine-domain-events.md`
  - `docs/guides/workflow-execution-lifecycle.md`

3. Validation suite
- Run and fix until green:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`

### Acceptance criteria

- No legacy runtime codepath remains active.
- Full monorepo checks pass.

---

## 7) Test Matrix (Must Pass)

1. Event classification correctness
- create -> scheduled
- time change -> rescheduled
- status transition -> canceled
- unrelated update/no_show/delete -> ignored for journey triggers

2. Planner idempotency
- duplicate lifecycle events do not create duplicate active deliveries

3. Reschedule behavior
- delivery times recompute and old pending deliveries cancel

4. Cancel behavior
- pending deliveries cancel and do not send

5. Message limits
- allow below limit, suppress at limit, proper counter window roll behavior

6. Delivery channels
- Resend success/failure recorded
- Slack success/failure recorded

7. Webhook catalog/event typing
- new appointment event names present
- non-appointment events unchanged

8. UI behavior
- builder supports only v1 node set
- runs panel displays correct statuses/timeline

---

## 8) Risks / Watchouts

- Domain-event and webhook schema are currently tightly coupled; taxonomy update must be coordinated.
- Big-bang replacement can leave stale UI/api references; route-level cleanup must be explicit.
- Message-limit counters need strict transaction semantics to avoid race-condition over-send.
- Planner/delivery idempotency needs deterministic keys and DB uniqueness.

---

## 9) Definition of Done

This project is done when:

1. Appointment journeys are the only workflow product surface.
2. Runtime is planner + delivery worker using Inngest best practices.
3. Appointment events are first-class lifecycle events only.
4. Webhooks continue to work, with updated appointment event taxonomy.
5. Message limits are enforced with UI + persisted suppression outcomes.
6. Legacy engine code is deleted.
7. `pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass.

---

## 10) Execution Checklist (Tickets, Owners, Estimates)

Use this as the implementation queue. Estimates are engineering days assuming one focused engineer.

## 10.1 Suggested owner lanes

- `API/Runtime`: Inngest functions, orchestration, service-layer logic
- `Data/DTO`: Drizzle schema, repository contracts, DTO schemas
- `Admin UI`: Builder UX, settings UX, runs UX
- `QA`: Cross-phase regression + end-to-end validation

## 10.2 Phase 1 tickets (Event taxonomy cutover)

1. `P1-01` Appointment lifecycle event taxonomy update
- Owner: `Data/DTO`
- Estimate: `1 day`
- Scope: update appointment event names in domain/webhook DTO schemas, preserve non-appointment events.
- Files: `packages/dto/src/schemas/domain-event.ts`, `packages/dto/src/schemas/webhook.ts`
- Depends on: none
- Done when: type definitions/tests compile and only `scheduled/rescheduled/canceled` are valid appointment lifecycle names.

2. `P1-02` Appointment emit classification implementation
- Owner: `API/Runtime`
- Estimate: `1.5 days`
- Scope: emit lifecycle events with strict classification in appointment service operations.
- Files: `apps/api/src/services/appointments.ts`, `apps/api/src/services/jobs/emitter.ts`
- Depends on: `P1-01`
- Done when: create/reschedule/cancel emit expected events; unrelated updates do not emit lifecycle journey triggers.

3. `P1-03` Inngest schema/fanout alignment
- Owner: `API/Runtime`
- Estimate: `1 day`
- Scope: align Inngest event typing + integration fanout to new appointment event names.
- Files: `apps/api/src/inngest/client.ts`, `apps/api/src/inngest/functions/integration-fanout.ts`
- Depends on: `P1-01`
- Done when: fanout functions register and run for new appointment event names.

4. `P1-04` Svix event catalog update
- Owner: `API/Runtime`
- Estimate: `0.5 day`
- Scope: ensure catalog sync publishes new appointment names and removes legacy appointment names.
- Files: `apps/api/src/services/svix-event-catalog.ts`
- Depends on: `P1-01`
- Done when: sync operation yields expected appointment event types in Svix.

5. `P1-05` Taxonomy regression tests
- Owner: `QA`
- Estimate: `1 day`
- Scope: update/extend tests around DTO schemas, emitter behavior, fanout, and Svix catalog sync.
- Depends on: `P1-02`, `P1-03`, `P1-04`
- Done when: targeted tests pass and event naming regressions are covered.

## 10.3 Phase 2 tickets (Journey schema + persistence foundation)

1. `P2-01` Journey definition DTO + API contract
- Owner: `Data/DTO`
- Estimate: `2 days`
- Scope: replace graph-driven workflow DTO with explicit appointment-journey schema.
- Files: `packages/dto/src/schemas/workflow.ts`, `packages/dto/src/schemas/workflow-graph.ts` (retire or replace)
- Depends on: `P1-05`
- Done when: workflow create/update/get/list contracts validate journey model only.

2. `P2-02` DB schema replacement for runtime artifacts
- Owner: `Data/DTO`
- Estimate: `2.5 days`
- Scope: replace generic workflow execution tables with journey-focused tables + message-limit tables.
- Files: `packages/db/src/schema/index.ts`, initial migration SQL/snapshot files
- Depends on: `P2-01`
- Done when: schema compiles and supports run/delivery/limit semantics.

3. `P2-03` Repository/service contract rewrite
- Owner: `API/Runtime`
- Estimate: `2 days`
- Scope: replace `workflowRepository` + service methods to use journey artifacts and definition schema.
- Files: `apps/api/src/repositories/workflows.ts`, `apps/api/src/services/workflows.ts`
- Depends on: `P2-02`
- Done when: API routes work against new storage model without generic graph assumptions.

4. `P2-04` Route/API regression pass
- Owner: `QA`
- Estimate: `1 day`
- Scope: update route tests and serialization expectations.
- Files: `apps/api/src/routes/workflows.ts`, related tests
- Depends on: `P2-03`
- Done when: workflow route suite passes with journey schema.

## 10.4 Phase 3 tickets (Inngest runtime rebuild)

1. `P3-01` Planner function implementation
- Owner: `API/Runtime`
- Estimate: `2.5 days`
- Scope: implement appointment-journey planner (compute/upsert deliveries, emit schedule/cancel events).
- Files: `apps/api/src/inngest/functions/` (new planner), supporting services/repositories
- Depends on: `P2-04`
- Done when: planner creates deterministic delivery plans for lifecycle events.

2. `P3-02` Delivery worker implementation
- Owner: `API/Runtime`
- Estimate: `2.5 days`
- Scope: implement delivery worker with `sleepUntil`, `cancelOn`, pre-send revalidation.
- Files: `apps/api/src/inngest/functions/` (new worker), supporting services
- Depends on: `P3-01`
- Done when: scheduled deliveries send or skip correctly under cancel/reschedule/terminal conditions.

3. `P3-03` Send dispatcher via integration runtime
- Owner: `API/Runtime`
- Estimate: `2 days`
- Scope: implement channel send execution path (Resend + Slack) using existing integration config/secrets/runtime patterns.
- Files: `apps/api/src/services/integrations/*`, new journey delivery services
- Depends on: `P3-02`
- Done when: delivery worker can send real email/slack and persist outcomes.

4. `P3-04` Legacy runtime deletion
- Owner: `API/Runtime`
- Estimate: `1.5 days`
- Scope: remove old trigger registry/orchestrator/run-requested runtime code and Inngest function wiring.
- Files: legacy runtime files listed in Phase 3 above
- Depends on: `P3-01`, `P3-02`, `P3-03`
- Done when: no active path references legacy runtime modules.

5. `P3-05` Runtime reliability tests
- Owner: `QA`
- Estimate: `1.5 days`
- Scope: test idempotency, cancellation, reschedule replacement, and duplicate suppression.
- Depends on: `P3-04`
- Done when: runtime integration tests pass and cover planner/worker edge cases.

## 10.5 Phase 4 tickets (Message limits)

1. `P4-01` Limits policy engine + atomic counters
- Owner: `API/Runtime`
- Estimate: `2 days`
- Scope: enforce fixed-window per-channel limits at send time with atomic check/increment.
- Depends on: `P3-05`
- Done when: concurrent sends respect caps and suppression outcomes are persisted.

2. `P4-02` Limits settings API
- Owner: `API/Runtime`
- Estimate: `1 day`
- Scope: expose CRUD/read endpoints for per-workspace channel limits.
- Depends on: `P4-01`
- Done when: admin UI can fetch/update limits.

3. `P4-03` Limits settings UI + node toggle
- Owner: `Admin UI`
- Estimate: `2 days`
- Scope: add settings controls and Send Message `countTowardLimits` toggle.
- Depends on: `P4-02`
- Done when: admins can configure limits and per-step counting behavior.

4. `P4-04` Limits regression tests
- Owner: `QA`
- Estimate: `1 day`
- Scope: API/UI tests for allow vs suppress behavior and persisted suppression display.
- Depends on: `P4-03`
- Done when: limits tests pass end-to-end.

## 10.6 Phase 5 tickets (Admin UI builder replacement)

1. `P5-01` Trigger panel replacement
- Owner: `Admin UI`
- Estimate: `1.5 days`
- Scope: replace generic trigger config with appointment journey trigger UX.
- Files: `apps/admin-ui/src/features/workflows/workflow-trigger-config.tsx`
- Depends on: `P2-04`
- Done when: only v1 trigger semantics are editable.

2. `P5-02` Action palette simplification + Send Message node
- Owner: `Admin UI`
- Estimate: `2 days`
- Scope: remove switch/condition/http-request from builder and add/solidify Send Message config.
- Files: `apps/admin-ui/src/features/workflows/action-registry.ts`, config components
- Depends on: `P5-01`
- Done when: available node set is exactly Trigger/Wait/Send Message/Logger.

3. `P5-03` Runs panel contract adaptation
- Owner: `Admin UI`
- Estimate: `1.5 days`
- Scope: preserve existing UX while reading new journey run/delivery contract.
- Depends on: `P3-05`
- Done when: runs timeline/status works on new runtime artifacts.

4. `P5-04` Timeline preview + publish warnings
- Owner: `Admin UI`
- Estimate: `1.5 days`
- Scope: implement preview and warning checks for reschedule-sensitive schedules.
- Depends on: `P5-02`
- Done when: users can preview computed schedule and receive warnings pre-publish.

5. `P5-05` Builder regression tests
- Owner: `QA`
- Estimate: `1 day`
- Scope: validate node set constraints, trigger behavior, preview, and runs rendering.
- Depends on: `P5-03`, `P5-04`
- Done when: admin-ui workflow test suite passes with new builder model.

## 10.7 Phase 6 tickets (Cleanup + final verification)

1. `P6-01` Dead code/doc cleanup
- Owner: `API/Runtime`
- Estimate: `1 day`
- Scope: remove legacy files/tests/docs references and update workflow guides.
- Depends on: `P5-05`
- Done when: no stale runtime/docs references remain.

2. `P6-02` Full quality gate run + fixes
- Owner: `QA`
- Estimate: `1.5 days`
- Scope: run `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`; fix all failures.
- Depends on: `P6-01`
- Done when: all root quality gates are green.

## 10.8 Delivery timeline (single-team default)

- Week 1: Phase 1 + start Phase 2
- Week 2: finish Phase 2 + Phase 3
- Week 3: Phase 4 + Phase 5
- Week 4: Phase 6 stabilization and release hardening

If split across three lanes (`API/Runtime`, `Data/DTO`, `Admin UI`) with overlap, timeline can compress to ~2.5-3 weeks.
