# Inngest Eventing + Workflow Runtime RFC (Unified)

Status: In Progress (Phases 0-8 complete/in progress; Phase 9 custom workflow platform in progress)
Last Updated: 2026-02-11
Owners: Product, `@scheduling/api`, `@scheduling/db`, `@scheduling/admin-ui`
Related: `docs/ARCHITECTURE.md`, `docs/references/event-bus/synthesis.md`, `docs/references/event-bus/workflow-devkit-research.md`, `docs/references/event-bus/testing.md`

## 1. Summary

We replaced the previous `event_outbox + BullMQ + Workflow DevKit` direction with an Inngest-first architecture.

Phases 0-8 established:

1. Self-hosted Inngest as the durable eventing and execution plane.
2. Inngest-based integration fanout and workflow dispatch/execution foundations.
3. Workflow management CRUD, bindings, runs, and publish flow.
4. Baseline visual workflow editing capability.

Phase 9 extends this foundation from a Workflow Kit-oriented implementation to a product-specific workflow platform:

1. Build an internal workflow builder UI package (`packages/workflow-ui`) using React Flow.
2. Use a code-defined trigger/action catalog optimized for our domain and integrations.
3. Preserve strict domain-correct behavior for mutable entities (update/delete/reschedule while waiting).
4. Keep Inngest as execution backbone while moving workflow authoring/runtime semantics to first-party models.

## 2. Current State

1. Domain writes emit events through `apps/api/src/services/jobs/emitter.ts`.
2. Events are sent directly to Inngest (`inngest.send`) after successful mutations.
3. Integration fanout runs through Inngest functions (`apps/api/src/inngest/functions/integration-fanout.ts`).
4. Legacy worker processes (`src/worker.ts`, `src/workflow-worker.ts`, `src/bull-board.ts`) and related scripts/deps are removed.
5. Workflow definition CRUD/binding/run APIs are implemented.
6. Runtime cancel/wait semantics and send-time guards are implemented.
7. Remaining work prior to product expansion:
   - reliability/simplicity hardening (Phase 8)
   - custom workflow platform implementation (Phase 9)

## 3. Final Decisions

1. Runtime target remains self-hosted Inngest.
2. Migration style remains big-bang within active-dev constraints (no compatibility layer).
3. `event_outbox` remains removed.
4. The product workflow platform will be first-party:
   - first-party visual builder (`packages/workflow-ui`)
   - first-party typed workflow graph schema
   - first-party compile/execute model on top of Inngest
5. Triggers and actions are developer-defined in code (typed schemas), not end-user schema authoring.
6. Product scope is notifications-first and integrations-next, not a generic low-code platform.
7. Trigger catalog for workflow authoring includes all domain webhook events.
8. Correlation identity is the domain model identity for the trigger event (e.g., `appointment.updated -> appointmentId`).
9. Each workflow step evaluates and executes against the latest correlated model loaded from DB at step time, not only event payload snapshots.
10. Replacement/cancellation behavior is configurable per trigger.
11. Default terminal behavior is to stop future side effects on terminal events/states (`cancelled`, `deleted`, `no_show`) unless explicitly configured otherwise.
12. Delay semantics are relative-only in v1; persisted/transmitted times must be ISO 8601 with explicit UTC offset.
13. Retry policy is configurable at trigger level (attempts + backoff preset).
14. Bindings continue to target active workflow versions only.
15. Authorization model: admin/owner mutate; any org member can view definitions and runs.
16. Guard authoring model in v1 is a structured predicate builder (no free-form code/DSL).

## 4. Product Rationale and Goals

### 4.1 Why We Are Doing This

1. The initial workflow product surface is notifications, but the platform must support all integrations.
2. Scheduling entities are mutable by design:
   - appointments can be updated/rescheduled/cancelled/deleted
   - domain state can change while workflows are in wait/delay states
3. Without domain-aware replacement/cancellation semantics, automation can send stale or incorrect side effects.
4. The product value is trusted automation under changing state, not maximum editor flexibility.
5. We need a repeatable developer workflow to add integrations/actions quickly:
   - e.g., Resend `sendEmail`, Twilio `sendSMS`, Slack `sendMessage`
   - same integration registration pattern as current listeners/process functions, but standardized for workflow actions

### 4.2 Goals

1. Use one durable execution and eventing platform for domain automation.
2. Keep strict cancellation + replacement behavior for appointment lifecycle workflows.
3. Preserve deterministic side-effect safety (idempotency + revision guards + dedupe ledger).
4. Build a first-party workflow builder UI that matches product UX goals and is testable/isolated in its own package.
5. Define triggers/actions in code with typed input/output contracts and a repeatable extension path.
6. Enable notifications-first delivery now while making integration actions a direct follow-on.
7. Prefer Inngest-native primitives over custom orchestration when behavior is equivalent.

## 5. Non-Goals

1. Supporting old BullMQ/Workflow DevKit behavior during migration.
2. Maintaining backward-compatible schema shims.
3. Exposing end-user-defined trigger/action schemas.
4. Supporting arbitrary end-user code execution steps.
5. Building a generic low-code platform with unconstrained graph semantics.
6. Supporting Inngest Cloud in this phase.

## 6. Target Architecture

### 6.1 Runtime Topology

1. API server (`apps/api/src/index.ts`) serves business routes and `/api/inngest` endpoint.
2. Self-hosted Inngest service runs as separate infra service.
3. Inngest persists state in Postgres and uses Valkey/Redis for queueing internals.
4. Dedicated app processes for BullMQ worker, Bull Board, and Workflow DevKit worker remain removed.

### 6.2 Event Plane

1. Domain mutations commit DB changes.
2. API sends typed Inngest events (`inngest.send`) after successful mutation boundaries.
3. Inngest triggers matching functions (integration fanout, workflow dispatch, workflow execution, operational handlers).

### 6.3 Integration Plane

1. Integration consumers execute as Inngest functions.
2. Existing org integration settings/secrets (`integrations` table) remain authoritative.
3. Function-level flow control (`concurrency`, `throttle`, retries) replaces queue-level tuning.
4. Workflow actions for integrations execute through a typed action executor registry.

### 6.4 Workflow Definition Plane

1. Keep org-scoped definitions and immutable versions.
2. Persist canonical first-party workflow graph payloads (not Workflow Kit payloads).
3. Keep event bindings (`event_type -> active workflow version`) for explicit trigger control.
4. Publish compiles graph to deterministic `compiled_plan` artifact used by runtime.

### 6.5 Workflow Execution Plane

1. Inngest functions execute compiled workflow plans.
2. Replacement/cancellation behavior remains entity-aware and deterministic.
3. Wait/delay semantics are explicit compiled operations with timeout handling.
4. Side effects run behind revision and dedupe guards.

### 6.6 Catalog and Extensibility Model

1. Trigger definitions are code-defined and typed.
2. Action definitions are code-defined and typed.
3. New integrations/actions are added via a repeatable registration path:
   - integration manifest
   - trigger/action schema definitions
   - executor implementation
   - catalog registration for UI + compiler + runtime
4. No end-user schema authoring surface is exposed.
5. Trigger catalog is sourced from domain webhook events and must stay in sync with canonical DTO event definitions.

## 7. Workflow Semantics

### 7.1 Trigger Identity and Dedupe

1. Trigger event catalog includes all domain webhook events.
2. Domain event IDs are UUIDv7 and used as deterministic identifiers where applicable.
3. Trigger and side-effect handlers treat retries as at-least-once and remain idempotent.
4. Debounce/latest-wins controls are configured at trigger level, not per action.
5. Primary correctness strategy is idempotent workflow execution plus replacement/debounce policies, not relying solely on event-level deduplication.

### 7.2 Cancellation and Replacement

1. Appointment mutation events (`updated`, `rescheduled`, `cancelled`, `no_show`) can cancel active runs.
2. Replacement runs start with current entity state where policy requires replacement.
3. Replacement runs increment logical revision markers consumed by send-time guards.
4. Replacement/cancellation policy is configured per trigger and defaults to safe terminal cancellation behavior.

### 7.3 Wait and Delay Semantics

1. Wait/delay operations are modeled explicitly in compiled plans.
2. Timeout/null branches must be explicit and tested.
3. Flows avoid race-prone ordering assumptions.
4. Delay is relative-only in v1 and may derive from trigger/model fields (for example, “3 days before appointment start”).
5. Any persisted/transmitted time values use ISO 8601 with explicit UTC offset.

### 7.4 Latest-Model Execution Semantics

1. Every actionable step rehydrates the correlated domain model from DB at execution time.
2. Guard conditions evaluate against current DB state, not stale trigger snapshots.
3. If correlated model is missing at step time, workflow ends gracefully with terminal reason and does not retry that missing-model condition.
4. Guard conditions are available on every action step; notification throttling/suppression logic should be expressed through these guards in v1.

### 7.5 Side-Effect Safety

1. External sends use deterministic delivery keys.
2. Delivery ledger uniqueness protects against duplicate sends.
3. Steps re-check cancellation/version validity before side effects.

### 7.6 Mutable Domain Entity Policy Matrix

Default policy for domain-correlation key `(orgId, definitionId, entityType, entityId)`:

1. `*.created`:
   - start run
2. `*.updated` / `*.rescheduled`:
   - cancel active run(s)
   - start replacement run from latest state
3. `*.cancelled` / `*.deleted`:
   - cancel active run(s)
   - do not start replacement unless explicitly configured
4. terminal domain states (`no_show`, etc.):
   - cancel pending future side effects unless explicitly configured otherwise

Execution rules:

1. Wait/delay state is not patched in place.
2. Replacement run recomputes schedule from latest state.
3. Stale run side effects are blocked by revision guard even under race conditions.

## 8. Data Model Changes

### 8.1 Remove

1. `event_outbox` table.
2. Legacy outbox statuses/processing fields and worker-only concepts.

### 8.2 Keep and Reshape

1. `workflow_definitions`
2. `workflow_definition_versions`
3. `workflow_bindings`

Required shape updates:

1. Replace Workflow Kit-specific naming/contracts with first-party workflow graph naming/contracts.
2. Persist typed workflow graph draft and immutable published versions.
3. Persist compiled plan at publish-time.
4. Keep org-scoped RLS on all workflow tables.

### 8.3 Optional Runtime Tracking Tables

`workflow_run_entity_links` and `workflow_delivery_log` remain for product-facing run/delivery views and dedupe ledger.

## 9. API Surface

### 9.1 Runtime Endpoint

1. Inngest serve endpoint in API app:
   - `GET|POST|PUT /api/inngest`

### 9.2 Workflow Routes

Workflow namespace remains, with payload evolution toward first-party graph contracts:

1. `workflow.listDefinitions`
2. `workflow.getDefinition`
3. `workflow.createDefinition`
4. `workflow.updateDraft`
5. `workflow.validateDraft`
6. `workflow.publishDraft`
7. `workflow.listBindings`
8. `workflow.upsertBinding`
9. `workflow.removeBinding`
10. `workflow.listRuns`
11. `workflow.getRun`
12. `workflow.cancelRun`

Read/write access model:

1. `listDefinitions`, `getDefinition`, `listRuns`, `getRun`: any org member.
2. `createDefinition`, `updateDraft`, `validateDraft`, `publishDraft`, bindings mutations, `cancelRun`: admin/owner only.

### 9.3 Trigger/Action Registry Interfaces (Planned)

Planned first-party interfaces (naming may vary in implementation):

1. `TriggerDefinition`
   - `eventType`
   - `entityResolver`
   - `replacementPolicy`
2. `IntegrationActionDefinition`
   - `id`
   - `integrationKey`
   - `label`
   - `inputSchema`
   - `outputSchema` (optional)
   - `executor`
3. `WorkflowGraphDocument`
   - `schemaVersion`
   - `trigger`
   - `nodes`
   - `edges`
4. `CompiledWorkflowPlan`
   - deterministic step operations
   - guard metadata

## 10. Admin UI Scope

1. Keep workflow routes:
   - `/_authenticated/workflows`
   - `/_authenticated/workflows/$workflowId`
2. Replace Workflow Kit UI with first-party workflow builder package:
   - `packages/workflow-ui`
3. Keep explicit save/validate/publish interaction model.
4. Keep bindings and run visibility on workflow detail surface.
5. Use adapter pattern:
   - generic builder primitives in package
   - scheduling/integration catalogs wired in admin app
6. Any authenticated org member can view workflow definitions/runs; admin/owner-only controls are hidden/disabled for members.

## 11. Implementation Plan and Tasks

### Phase 0: Infra + Commands

- [ ] Add self-hosted Inngest service configuration to local/deployment environments.
- [x] Add required env vars (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, Inngest base URLs).
- [x] Add `dev:inngest` command using Inngest Dev Server.
- [x] Remove Workflow DevKit bootstrap requirement (`workflow-postgres-setup`) from `pnpm bootstrap:dev`.

Exit criteria:

1. Local API can register with running Inngest dev/self-host runtime.
2. Team can run API + admin + Inngest locally with documented commands.

### Phase 1: Inngest SDK Foundation

- [x] Add typed Inngest client module in API app.
- [x] Add Inngest serve handler on `/api/inngest`.
- [x] Add typed event envelope helpers reusing `packages/dto/src/schemas/webhook.ts`.
- [x] Add baseline Inngest function registration structure.

Exit criteria:

1. `/api/inngest` responds to Inngest sync/invoke calls.
2. At least one test function is discoverable and invokable.

### Phase 2: Event Emission Cutover

- [x] Replace `services/jobs/emitter.ts` with Inngest sender implementation.
- [x] Remove `JobQueue` abstraction and BullMQ enqueue calls.
- [x] Update domain services that currently emit inside transactions to post-commit send pattern.
- [x] Add failure logging/handling policy for post-commit send failures.

Exit criteria:

1. Domain mutations emit Inngest events only.
2. No code path writes to `event_outbox`.

### Phase 3: Integration Fanout on Inngest

- [x] Implement Inngest functions for integration dispatch.
- [x] Reuse existing integration registry/settings/secrets resolution.
- [x] Move Svix publish path to Inngest-triggered handler.
- [x] Add function flow-control config for integration workloads.

Exit criteria:

1. Svix and logger integrations receive events through Inngest.
2. Integration retries and failures are visible in Inngest run history.

### Phase 4: Workflow Runtime Migration

- [x] Remove Workflow DevKit worker and build pipeline.
- [x] Add workflow dispatch/execution scaffold functions and run tracking persistence.
- [x] Implement workflow execution functions with `cancelOn` and waits.
- [x] Encode strict cancel+replace run policy for appointment lifecycle.
- [x] Keep deterministic side-effect dedupe and send-time guards.

Exit criteria:

1. Appointment-triggered workflows run, wait, cancel, and replace deterministically.
2. No Workflow DevKit runtime process remains in app scripts.

### Phase 5: Baseline Workflow Authoring Adoption

- [x] Replace custom graph assumptions with current visual workflow contracts in DTO/API.
- [x] Implement workflow CRUD, bindings, run management, and publish routes.
- [x] Build admin workflow management routes (definitions, draft editing, bindings, runs) in `admin-ui`.
- [x] Persist draft and published workflow payloads.

Exit criteria:

1. Users can create/edit/publish workflows via visual editor.
2. Published definitions are executable by Inngest runtime functions.

### Phase 6: Schema Cleanup (No Backward Compatibility)

- [x] Update initial DB migration and schema to remove `event_outbox`.
- [x] Update schema/types for workflow payload persistence.
- [x] Remove obsolete enums/indexes tied to outbox processing.
- [x] Update seed scripts and RLS tests for new schema shape.

Exit criteria:

1. `pnpm --filter @scheduling/db run push` creates schema without outbox.
2. Seed and test setup run cleanly on rewritten schema.

### Phase 7: Legacy Code and Docs Removal

- [x] Delete BullMQ worker code (`services/jobs/*`, `src/worker.ts`).
- [x] Delete Bull Board app (`src/bull-board.ts`) and scripts/deps.
- [x] Delete Workflow DevKit files/scripts/deps (`src/workflow-worker.ts`, plugin/build setup).
- [x] Update architecture and operations docs to Inngest-first topology.

Exit criteria:

1. No BullMQ/Workflow DevKit runtime dependencies remain.
2. Docs and scripts reflect new runtime only.

### Phase 8: Inngest-Native Reliability Hardening

- [ ] Migrate all intra-function fanout from `inngest.send()` to `step.sendEvent()`.
- [ ] Add explicit function-level `idempotency` keys where duplicate upstream delivery is possible.
- [ ] Standardize deterministic producer event IDs for all domain emits that can trigger side effects.
- [ ] Add function `timeouts.start` / `timeouts.finish` on long-running workflow functions.
- [ ] Add centralized failure/cancellation handling via `onFailure` and/or system events (`inngest/function.failed`, `inngest/function.cancelled`).
- [ ] Expand integration and workflow tests to cover replay, duplicate delivery, cancellation-between-steps, and timeout/failure paths.

Exit criteria:

1. All intra-function event fanout paths use `step.sendEvent()` (or have a documented exception).
2. Idempotency strategy is explicit per function: function-level `idempotency`, deterministic event IDs, or both.
3. Long-running functions define timeout policy and have failure/cancellation handling coverage.
4. Replay/cancellation race tests pass without duplicate downstream side effects.

### Phase 8.1: Simplicity-First Adoption (Prioritized)

- [ ] Add Inngest validation middleware on the API client and remove duplicated per-function payload validation where schema coverage exists.
- [ ] Evaluate `singleton` with `mode: "cancel"` for latest-wins lifecycle paths and adopt where it reduces custom run-replacement code.
- [ ] Evaluate `debounce` for noisy update streams where delayed latest-state processing is acceptable.
- [ ] Keep `batchEvents` and hard `rateLimit` out of core workflow-runtime paths unless a measured bottleneck requires them.
- [ ] Document chosen boundaries per function family (dispatch, execution, fanout): which primitives are used and why.

Exit criteria:

1. Function code has minimal duplicated validation and delegates schema enforcement to shared middleware where possible.
2. Latest-wins behavior is implemented with the simplest reliable primitive per path (`singleton` or explicit policy with rationale).
3. Flow-control choices are intentional and documented; excluded features (`batchEvents` / hard `rateLimit`) are explicitly justified.

### Phase 9: Custom Workflow Platform (Notifications-First, Integrations-Next)

#### 9.1 Product and Decision Context

- [x] Formalize first-party platform constraints:
  - code-defined triggers/actions
  - no end-user schema authoring
  - mutable-entity correctness over open-ended flexibility
- [x] Finalize replacement/cancellation policies per domain event family.
- [x] Finalize trigger-level policy surface:
  - replacement policy
  - debounce/latest-wins window
  - retry policy (attempts + backoff preset)

#### 9.2 Data and API Model Migration

- [ ] Move workflow payload contracts from Workflow Kit-oriented naming to first-party graph naming.
- [x] Introduce typed workflow graph schema and validation contract.
- [x] Compile graph to deterministic `compiled_plan` at publish-time.
- [ ] Update route payloads/responses to first-party naming and shapes.
- [x] Update workflow route authorization to support member read and admin/owner mutation split.
- [x] Keep binding targets constrained to active versions only.

#### 9.3 UI Platform Migration

- [x] Create `packages/workflow-ui` package for reusable builder primitives.
- [x] Implement React Flow-based canvas + inspector + toolbar primitives.
- [x] Migrate admin workflow routes to use `packages/workflow-ui`.
  - [x] Move draft/catalog helper logic into `packages/workflow-ui` and consume it from admin workflow routes.
  - [x] Replace Workflow Kit editor surface with first-party React Flow primitives from `packages/workflow-ui`.
- [ ] Redesign workflows index/detail UX around builder-first interaction.
- [x] Implement structured guard builder for each action node.
- [ ] Implement relative delay configuration UX with ISO 8601 offset-safe time handling.
- [ ] Implement member view mode (read-only workflow pages).

#### 9.4 Runtime Execution Model Migration

- [x] Execute first-party compiled plans in Inngest workflow execution functions (with temporary legacy fallback for pre-compiled versions).
- [ ] Preserve and verify run-revision guard + delivery dedupe semantics.
- [ ] Enforce mutable-entity replacement/cancellation matrix under wait/delay operations.
- [x] Enforce per-step latest-model rehydration from DB by correlation identity.
- [x] End gracefully (non-retryable) when correlated model is missing at step execution time.

#### 9.5 Integration Extensibility Path

- [ ] Introduce trigger/action registry contracts consumed by UI/compiler/runtime.
  - [x] Land API-side trigger/action registry consumed by compiler + runtime execution.
  - [x] Expose workflow catalog route and consume registry-backed trigger/action metadata in admin workflow routes.
  - [x] Wire registry metadata into `packages/workflow-ui` inspector/node forms for first-party node editors.
- [ ] Document and test action onboarding path for integrations:
  - Resend `sendEmail`
  - Twilio `sendSMS`
  - Slack `sendMessage`
  - [x] Add initial typed action definitions for Resend/Twilio/Slack in workflow registry.
  - [ ] Add product docs/runbooks for adding new integration actions end-to-end.
- [ ] Ensure new action onboarding requires no core runtime rewrites.

Exit criteria:

1. Workflow builder and runtime are first-party and no longer depend on Workflow Kit semantics.
2. Notifications workflows remain correct under reschedule/cancel/delete race scenarios.
3. Integration actions can be added via registry + executor pattern with typed schemas.
4. Product UX supports explicit save/validate/publish and run observability.

## 12. Testing Strategy and Acceptance Criteria

Required automated coverage:

1. Event emission
   - one event emitted per domain mutation
   - payload shape matches DTO schema
2. Workflow semantics
   - trigger -> wait/delay -> send happy path
   - cancellation path
   - cancel + replacement run behavior
   - wait timeout returns null path
   - per-step execution uses latest correlated model from DB
   - missing-model step path ends gracefully without retries
3. Integration delivery
   - provider success/failure + retry behavior
   - org-level integration enablement respected
4. Idempotency and guarding
   - duplicate event IDs do not create duplicate logical side effects
   - delivery key uniqueness blocks duplicate sends
   - stale run revision cannot deliver side effects
5. Runtime safety
   - timeout handling (`timeouts.start` / `timeouts.finish`) behaves as configured
   - failure/cancellation handlers emit expected operational signals
6. Phase 9 platform migration
   - typed graph validation catches structural and semantic issues
   - compiler output is deterministic for equivalent graphs
   - action onboarding test proves registry-based extensibility
   - trigger-level debounce/latest-wins behavior is validated
   - trigger-level retry policy (attempts + backoff preset) is validated

Current automated coverage snapshot:

1. [x] Dispatch pipeline integration test covers `event -> binding resolution -> workflow execution -> workflow_run_entity_links` persistence.
2. [x] Workflow cancel route test covers status transition visibility via `listRuns` and `getRun`.
3. [ ] Function-level replay and duplicate-trigger tests validate idempotent behavior using Inngest-native `idempotency` and/or deterministic IDs.
4. [ ] Intra-function fanout tests verify `step.sendEvent()` behavior under retries/replays.
5. [ ] Latest-wins concurrency tests validate selected policy (`singleton` cancel mode or explicit replacement orchestration).
6. [ ] Validation middleware tests verify malformed incoming/outgoing events fail fast without per-function schema duplication.
7. [ ] Timeout/failure/cancellation tests verify global and function-level handlers execute correctly.
8. [ ] First-party builder tests cover graph editing, typed node config forms, and save/validate/publish flows.
9. [ ] Mutable-entity race tests cover reschedule/cancel/delete while run is paused in wait/delay.
10. [ ] Integration action catalog tests validate executor + schema wiring for at least Resend/Twilio/Slack.
11. [x] Member read-access coverage for workflow definitions/runs with mutation guard enforcement.

Release acceptance:

1. Local dev flow works with Inngest dev server.
2. No outbox/BullMQ code paths are called.
3. Users can publish executable workflows from first-party builder UI.
4. Appointment lifecycle workflows execute correctly in end-to-end test, including replacement/cancellation under pause states.

Current manual smoke snapshot (2026-02-10):

1. [x] `client.created` event emitted from UI (client creation) produces an Inngest workflow run visible in `/workflows`.
2. [x] Workflow admin UI supports publish + binding management + run visibility in live dev stack.
3. [ ] Runtime function currently completes immediately, so reliable UI cancel smoke for live runs is still pending richer execution semantics (`cancelOn`/wait steps).

## 13. Observability

Required signals:

1. Event send failures by event type.
2. Function start/latency/error by function ID.
3. Cancellation and replacement counts.
4. Wait timeout rates.
5. Side-effect send success/failure by provider/channel.
6. Correlation IDs across API logs and Inngest run IDs.
7. Duplicate suppression counters (idempotency drops, delivery-ledger duplicate hits).
8. Timeout and terminal-failure counts by function (`start_timeout`, `finish_timeout`, `failed`, `cancelled`).
9. Phase 9 platform signals:
   - compiled plan generation failures
   - validation issue distribution by code
   - action executor success/failure by integration action ID

## 14. Risks and Mitigations

1. Post-commit send gaps without outbox.
   - Mitigation: explicit failure handling, retries where safe, operational alerting.
2. Duplicate side effects due to at-least-once retries.
   - Mitigation: deterministic delivery keys + unique ledger + pre-send guards.
3. Wait-for-event race conditions.
   - Mitigation: flow design constraints and explicit timeout/fallback branches.
4. Migration breakage due to big-bang changes.
   - Mitigation: enforce end-to-end acceptance gates before merge.
5. Hidden duplicate fanout when using non-step event sends in retried functions.
   - Mitigation: migrate to `step.sendEvent()` for function-internal fanout and add replay coverage.
6. Re-trigger storms causing concurrent duplicate executions.
   - Mitigation: function `idempotency` and selective `singleton` cancel mode for latest-wins flows.
7. Excess custom logic drifting from platform primitives.
   - Mitigation: prefer native Inngest features first and document any justified custom guards.
8. Over-aggressive flow control dropping required work.
   - Mitigation: avoid hard `rateLimit` in core runtime paths; use `throttle`/`concurrency` unless dropping events is explicitly desired.
9. Over-generalizing the builder too early.
   - Mitigation: keep constrained node/action model and expand only on proven product demand.

## 15. Code Review Findings (2026-02-11)

### 15.1 Context and Accepted Deferrals

1. Inngest ingress is currently private-network only. Requiring signed ingress for public exposure is deferred and must be completed before opening this surface outside private networking.
2. The team is intentionally using `db push` during active development. Production migration/snapshot discipline is deferred and must be established before production readiness.

### 15.2 Findings (Prioritized)

High priority:

1. [ ] Event delivery is currently fail-open in `emitEvent` (send failures are logged and then success is still returned), which allows committed domain writes to lose downstream automation/integration side effects.
2. [ ] Workflow run state transitions are race-prone and failure-incomplete:
   - cancellation revision bumps can be overwritten by late terminal writes
   - execution exceptions can leave rows in `running` without terminal `failed` state persistence
3. [ ] Workflow definition/version integrity is not fully DB-enforced (`activeVersionId` and binding `definitionId`/`versionId` consistency constraints are application-level only).

Medium priority:

1. [ ] Workflow definition list and run list queries need scale hardening:
   - unbounded definition listing with client-side filtering
   - run-list sort/filter patterns that do not align with current indexes
2. [ ] Integration fanout couples providers into a single retry unit and processes serially inside the fanout step, increasing latency and duplicate-side-effect risk under retries.
3. [ ] Workflow authoring/runtime contract is still shallow in parts (minimal draft validation and placeholder compiled artifacts), increasing drift risk between editor output and execution semantics.
4. [ ] Observability/operability gaps remain for runtime error classification, structured execution logs, and timeout policy consistency.

Coverage gaps to close:

1. [ ] Integrations route behavior coverage beyond auth guards.
2. [ ] Workflow dispatch/execution error-path and replacement semantics coverage.
3. [ ] Workflow runtime DB lifecycle coverage (run start/status transitions/cancellation replacement behavior).
4. [ ] Admin workflow UI route coverage for draft/save/validate/publish/cancel flows.

### 15.3 Required Follow-Through Before Production

1. [ ] Enforce signed Inngest ingress and fail startup when insecure configuration is used outside local/private environments.
2. [ ] Establish migration-first production DB workflow (including regenerated snapshots and drift checks), replacing `db push` as the release path.

## 16. References

1. Inngest self-hosting: https://www.inngest.com/docs/self-hosting
2. Inngest dev server: https://www.inngest.com/docs/dev-server
3. Inngest `cancelOn`: https://www.inngest.com/docs/reference/typescript/functions/cancel-on
4. Inngest `waitForEvent`: https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event
5. Inngest `step.sendEvent`: https://www.inngest.com/docs/reference/functions/step-send-event
6. Inngest send events from functions: https://www.inngest.com/docs/guides/sending-events-from-functions
7. Inngest idempotency guide: https://www.inngest.com/docs/guides/handling-idempotency
8. Inngest function options (`idempotency`, `singleton`): https://www.inngest.com/docs/reference/functions/create
9. Inngest singleton guide: https://www.inngest.com/docs/guides/singleton
10. Inngest debounce guide: https://www.inngest.com/docs/guides/debounce
11. Inngest failure handlers: https://www.inngest.com/docs/features/inngest-functions/error-retries/failure-handlers
12. Inngest `inngest/function.failed` system event: https://www.inngest.com/docs/reference/system-events/inngest-function-failed
13. Inngest cancellation model: https://www.inngest.com/docs/features/inngest-functions/cancellation
14. Inngest cleanup after cancellation example: https://www.inngest.com/docs/examples/cleanup-after-function-cancellation
15. Inngest middleware overview: https://www.inngest.com/docs/reference/middleware/overview
16. React Flow docs: https://reactflow.dev/
