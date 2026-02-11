# Event Bus + Generalized Workflow Runtime RFC (Unified)

Status: Pending Product Decisions (Unified)
Last Updated: 2026-02-11
Owners: Product, `@scheduling/api`, `@scheduling/db`, `@scheduling/admin-ui`
Related: `docs/ARCHITECTURE.md`, `docs/references/event-bus/synthesis.md`, `docs/references/event-bus/workflow-devkit-research.md`, `docs/references/event-bus/testing.md`

## 1. Summary

We will keep the existing BullMQ/Valkey event bus and add a generalized workflow system backed by Workflow DevKit.

This phase includes both:
1. Runtime execution for durable, cancellable workflows.
2. A frontend workflow utility in admin UI (React Flow style) for creating and publishing workflow definitions.

## 2. Current State

1. Domain writes create events in `event_outbox`.
2. BullMQ workers claim and fan out events to integrations.
3. Dedicated workflow runtime process exists: `apps/api/src/workflow-worker.ts`.
4. No persisted workflow definitions, no builder UI, and no generalized trigger/cancel/replace run model yet.

## 3. Decisions

1. Keep BullMQ/Valkey as the event bus runtime for this phase.
2. Use Workflow DevKit directly for durable workflow execution (run/wait/cancel/retry).
3. Build generalized workflows, not a single hardcoded reminder flow.
4. Expose workflow authoring as an admin UI utility (React Flow style graph editor).
5. Use immutable workflow versioning and publish-time compilation.
6. Enforce strict cancellation semantics.
7. On appointment mutation events, cancel active run and replace with a new run revision.
8. Replacement runs recompute future schedule from current appointment state.
9. Keep process responsibilities explicit:
   - API server: business and workflow CRUD routes.
   - Worker: event bus processing.
   - Workflow worker: Workflow protocol handlers + world polling.

## 4. Goals

1. Preserve existing fanout reliability.
2. Enable generalized lifecycle automation flows (multi-step, delayed, cancellable).
3. Provide a first-class authoring utility for non-code workflow configuration.
4. Guarantee effectively-once external effects via deterministic idempotency + delivery ledger.
5. Keep implementation incremental and testable.

## 5. Non-Goals

1. Replacing BullMQ in this phase.
2. Arbitrary user-authored JavaScript execution in workflow expressions.
3. A fully generic visual programming platform in v1.
4. Mathematical exactly-once across third-party providers.

## 6. Architecture

### 6.1 Event Plane (unchanged)

1. Domain writes persist events to `event_outbox`.
2. Dispatch worker claims pending rows and enqueues fanout jobs.
3. Integration workers process their queues.

### 6.2 Workflow Definition Plane (new)

1. Persist org-scoped workflow definitions and immutable versions.
2. Publish compiles graph definition to a normalized execution plan artifact.
3. Event bindings map domain event type -> active workflow version.

### 6.3 Workflow Execution Plane (new)

1. Workflow trigger consumer resolves active bindings and starts runs with deterministic run keys.
2. Cancellation consumer resolves active runs and enforces strict cancel + replace.
3. Workflow steps perform side effects with deterministic delivery keys and send-time guards.

### 6.4 Runtime Topology

1. `apps/api/src/index.ts`: API/oRPC server.
2. `apps/api/src/worker.ts`: BullMQ event bus workers.
3. `apps/api/src/workflow-worker.ts`: Workflow protocol handlers:
   - `/.well-known/workflow/v1/flow`
   - `/.well-known/workflow/v1/step`
   - `/.well-known/workflow/v1/webhook/:token`
4. `apps/api/src/workflow-worker.ts` also runs Postgres world polling (`getWorld().start?.()`).

### 6.5 UI Plane (new)

1. Add workflows routes in admin UI:
   - `/_authenticated/workflows`
   - `/_authenticated/workflows/$workflowId`
2. Use `@xyflow/react` for controlled graph canvas.
3. Use existing TanStack Router/Query + oRPC patterns for data and mutations.

## 7. Workflow Semantics

### 7.1 Run Identity

Active run key baseline:
`(org_id, workflow_type, appointment_id)`

### 7.2 Cancellation and Replacement

1. Cancel scope: any appointment mutation event (`updated`, `rescheduled`, `cancelled`, `no_show`).
2. Guarantee level: strict.
3. Behavior: cancel active run revision, then immediately start replacement revision.
4. Replacement timing: recompute all delayed actions from latest appointment state.

### 7.3 Idempotency and Delivery

1. Delivery dedupe is context-based, with baseline specificity:
`org + workflow + appointment + run_revision + step + channel`.
2. `workflow_delivery_log.delivery_key` is unique.
3. Send step must re-check cancellation/version state immediately before side effects.

## 8. Data Changes

### 8.1 Keep

1. Keep `event_outbox` as canonical domain event log for this phase.

### 8.2 Add

1. `workflow_definitions`
2. `workflow_definition_versions`
3. `workflow_bindings`
4. `workflow_run_entity_links`
5. `workflow_delivery_log`

All workflow tables are org-scoped and RLS protected.

## 9. API Surface (v1)

Add workflow namespace on UI router:
1. `workflow.listDefinitions`
2. `workflow.getDefinition`
3. `workflow.createDefinition`
4. `workflow.updateDraftGraph`
5. `workflow.validateDraft`
6. `workflow.publishDraft`
7. `workflow.listRuns`
8. `workflow.getRun`
9. `workflow.cancelRun`

## 10. Builder v1 Scope

1. Node catalog:
   - `event.trigger`
   - `wait.duration`
   - `if.condition`
   - `send.email`
   - `send.sms`
2. DAG-only validation (no cycles).
3. Single trigger node requirement in v1.
4. Publish blocked on validation errors.

## 11. Implementation Plan

### Phase A: Foundations (in progress)

- [x] Dedicated workflow worker process (`apps/api/src/workflow-worker.ts`).
- [x] Workflow worker scripts (`dev/build/start`).
- [x] Local bootstrap command (`pnpm bootstrap:dev`) including workflow postgres setup.
- [ ] Add workflow tables + DTO + oRPC contracts.
- [ ] Add workflow definition/versioning APIs.
- [ ] Add builder routes + basic React Flow editor scaffold.

Exit criteria:
1. Workflow definitions can be created, edited, validated, and published.
2. Basic workflow editor route works in admin UI.

### Phase B: Runtime Mapping

- [ ] Add trigger consumer for published workflow bindings.
- [ ] Add strict cancel + replace mapping from appointment mutation events.
- [ ] Add deterministic run key and run revision behavior.
- [ ] Add one end-to-end lifecycle test covering trigger/wait/send/cancel/replace.

Exit criteria:
1. Generalized workflow runs execute from real domain events.
2. Cancellation and replacement behavior is deterministic and strict.

### Phase C: Hardening

- [ ] Send-time state/consent checks.
- [ ] Retry/failure categorization and recovery paths.
- [ ] Operational run views and failure diagnostics.
- [ ] Replay/retry/late-cancel race tests.

Exit criteria:
1. Effectively-once behavior demonstrated under replay/retry.
2. Operators can identify and recover failed/stuck runs.

## 12. Observability

Use OpenTelemetry for traces/metrics/log correlation.

Required signals:
1. Event dispatch latency and retries.
2. Workflow start latency and wake latency.
3. Cancel + replace counts and failures.
4. Delivery dedupe prevented count.
5. External send success/failure by channel/provider.
6. Workflow runtime health (handlers + world heartbeat).

## 13. Guardrails

1. Do not introduce speculative abstraction layers around Workflow DevKit unless duplicated usage is proven.
2. Keep workflow expression engine constrained and safe (no arbitrary JS eval).
3. Keep process boundaries explicit (API vs worker vs workflow worker).
4. Prefer small, composable changes with end-to-end tests for behavior-critical paths.

## 14. Risks and Mitigations

1. Duplicate sends under retries/replays.
   - Mitigation: deterministic delivery keys + unique ledger + send-time guards.
2. Cancel/send race conditions.
   - Mitigation: strict cancellation contract + pre-send run revision validation.
3. Builder/runtime drift.
   - Mitigation: publish-time compile artifacts and immutable version references.
4. Operational complexity across planes.
   - Mitigation: unified dashboards and explicit runbook ownership.

## 15. Open Questions (Pending Product Decisions)

1. Initial channel/provider rollout order for send actions.
2. Default template library and required variables for v1.
3. Consent policy details required before enabling SMS sends per org.

## 16. References

1. `docs/references/event-bus/synthesis.md`
2. `docs/references/event-bus/workflow-devkit-research.md`
3. `docs/references/event-bus/testing.md`
4. Workflow DevKit idempotency: https://useworkflow.dev/docs/foundations/idempotency
5. Workflow DevKit worlds: https://useworkflow.dev/docs/worlds
6. Workflow DevKit Postgres world: https://useworkflow.dev/worlds/postgres
