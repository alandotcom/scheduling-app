# Inngest Eventing + Workflow Runtime RFC (Unified)

Status: In Progress (Phases 0-4 and 7 largely complete; phases 5-6 pending)
Last Updated: 2026-02-11
Owners: Product, `@scheduling/api`, `@scheduling/db`, `@scheduling/admin-ui`
Related: `docs/ARCHITECTURE.md`, `docs/references/event-bus/synthesis.md`, `docs/references/event-bus/workflow-devkit-research.md`, `docs/references/event-bus/testing.md`

## 1. Summary

We are replacing the current `event_outbox + BullMQ + Workflow DevKit` direction with a single Inngest-first architecture.

This is a big-bang rewrite with no compatibility layer:

1. Self-host Inngest using Postgres + Valkey/Redis.
2. Replace outbox and BullMQ fanout with Inngest events/functions.
3. Replace Workflow DevKit runtime with Inngest functions (`cancelOn`, `step.waitForEvent`, step retries).
4. Use Inngest Workflow Kit for user-defined workflow authoring.
5. Persist Workflow Kit JSON as the canonical workflow definition format.

## 2. Current State

1. Domain writes emit events through `apps/api/src/services/jobs/emitter.ts`.
2. Events are sent directly to Inngest (`inngest.send`) after successful mutations.
3. Integration fanout runs through Inngest functions (`apps/api/src/inngest/functions/integration-fanout.ts`).
4. Legacy worker processes (`src/worker.ts`, `src/workflow-worker.ts`, `src/bull-board.ts`) and related scripts/deps are removed.
5. Workflow definition tables exist, but Workflow Kit authoring and execution routes remain incomplete.

## 3. Final Decisions

1. Runtime target: self-hosted Inngest.
2. Migration style: big-bang cutover (no dual run).
3. Workflow authoring model: Inngest Workflow Kit.
4. Workflow persistence shape: Workflow Kit JSON (draft + published versions).
5. `event_outbox` fate: delete entirely.

## 4. Goals

1. Use one durable execution and eventing platform for domain automation.
2. Keep strict cancellation + replacement behavior for appointment lifecycle workflows.
3. Reduce queue/worker operational complexity by removing BullMQ and Workflow DevKit runtime.
4. Ship a usable workflow editor backed by Workflow Kit, not a custom graph compiler.
5. Keep typed event contracts across API/UI/runtime using existing DTO schemas.

## 5. Non-Goals

1. Supporting old BullMQ/Workflow DevKit behavior during migration.
2. Maintaining backward-compatible schema shims.
3. Building a generic low-code platform beyond Workflow Kit v1 capabilities.
4. Supporting Inngest Cloud in this phase.

## 6. Target Architecture

### 6.1 Runtime Topology

1. API server (`apps/api/src/index.ts`) serves business routes and `/api/inngest` endpoint.
2. Self-hosted Inngest service runs as separate infra service.
3. Inngest persists state in Postgres and uses Valkey/Redis for queueing internals.
4. Dedicated app processes for BullMQ worker, Bull Board, and Workflow DevKit worker are removed.

### 6.2 Event Plane

1. Domain mutations commit DB changes.
2. API sends typed Inngest events (`inngest.send`) after successful mutation boundaries.
3. Inngest triggers all matching functions (integration fanout, workflow runs, etc.).

### 6.3 Integration Plane

1. Integration consumers are executed as Inngest functions.
2. Existing org integration settings/secrets (`integrations` table) remain authoritative.
3. Function-level flow control (`concurrency`, `throttle`, retries) replaces queue-level tuning.

### 6.4 Workflow Definition Plane

1. Keep org-scoped definitions and immutable versions.
2. Store Workflow Kit JSON as canonical draft/published payload.
3. Keep event bindings (`event_type -> active workflow version`) for explicit trigger control.

### 6.5 Workflow Execution Plane

1. Inngest functions implement workflow execution.
2. `cancelOn` handles cancellation triggers.
3. `step.waitForEvent` handles event-based waiting with explicit timeout behavior.
4. Deterministic idempotency keys are still enforced for side effects.

## 7. Workflow Semantics

### 7.1 Trigger Identity and Dedupe

1. Domain event IDs are UUIDv7 and used as deterministic event identifiers when sending to Inngest.
2. Trigger and side-effect handlers must treat retries as at-least-once and remain idempotent.

### 7.2 Cancellation and Replacement

1. Appointment mutation events (`updated`, `rescheduled`, `cancelled`, `no_show`) cancel active runs.
2. Cancellation guarantee target remains strict at workflow step boundaries.
3. Replacement runs start immediately with current appointment state.
4. Replacement runs increment a logical revision marker used by send-time guards.

### 7.3 Wait Semantics

1. `step.waitForEvent` is used for event-driven pauses.
2. Timeout returns `null` and must be handled explicitly.
3. Flows must avoid race-prone ordering assumptions (event must occur after wait starts).

### 7.4 Side-Effect Safety

1. External sends use deterministic delivery keys.
2. Delivery ledger uniqueness continues to protect against duplicate sends.
3. Steps re-check cancellation/version validity before side effects.

## 8. Data Model Changes

### 8.1 Remove

1. `event_outbox` table.
2. Legacy outbox statuses/processing fields and worker-only concepts.

### 8.2 Keep and Reshape

1. `workflow_definitions`
2. `workflow_definition_versions`
3. `workflow_bindings`

Required shape updates:
1. Replace custom graph payloads with Workflow Kit JSON.
2. Keep immutable publish versions.
3. Keep org-scoped RLS on all workflow tables.

### 8.3 Optional Runtime Tracking Tables

`workflow_run_entity_links` and `workflow_delivery_log` remain if needed for product-facing run/delivery views and dedupe ledger.

## 9. API Surface (v1)

### 9.1 New/Updated Runtime Endpoint

1. Add Inngest serve endpoint in API app:
   - `GET|POST|PUT /api/inngest`

### 9.2 Workflow Routes

Keep workflow namespace and adapt payload contracts:

1. `workflow.listDefinitions`
2. `workflow.getDefinition`
3. `workflow.createDefinition`
4. `workflow.updateDraft`
5. `workflow.validateDraft`
6. `workflow.publishDraft`
7. `workflow.listRuns`
8. `workflow.getRun`
9. `workflow.cancelRun`

## 10. Admin UI Scope (v1)

1. Implement workflow routes:
   - `/_authenticated/workflows`
   - `/_authenticated/workflows/$workflowId`
2. Use `@inngest/workflow-kit/ui` components as editor foundation.
3. Use controlled draft updates and persist Workflow Kit JSON through existing oRPC patterns.
4. Remove custom React Flow compiler assumptions from plan and implementation.

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
- [ ] Add function flow-control config for integration workloads.

Exit criteria:
1. Svix and logger integrations receive events through Inngest.
2. Integration retries and failures are visible in Inngest run history.

### Phase 4: Workflow Runtime Migration

- [x] Remove Workflow DevKit worker and build pipeline.
- [ ] Implement workflow execution functions with `cancelOn` and waits.
- [ ] Encode strict cancel+replace run policy for appointment lifecycle.
- [ ] Keep deterministic side-effect dedupe and send-time guards.

Exit criteria:
1. Appointment-triggered workflows run, wait, cancel, and replace deterministically.
2. No Workflow DevKit runtime process remains in app scripts.

### Phase 5: Workflow Kit Authoring Adoption

- [ ] Replace custom graph assumptions with Workflow Kit JSON contracts in DTO/API.
- [ ] Implement/complete workflow CRUD and publish routes against Workflow Kit model.
- [ ] Build admin workflow editor routes using `@inngest/workflow-kit/ui`.
- [ ] Persist draft and published versions as Workflow Kit JSON.

Exit criteria:
1. Users can create/edit/publish workflows via Workflow Kit editor.
2. Published definitions are executable by Inngest runtime functions.

### Phase 6: Schema Cleanup (No Backward Compatibility)

- [x] Update initial DB migration and schema to remove `event_outbox`.
- [ ] Update schema/types for Workflow Kit JSON persistence.
- [x] Remove obsolete enums/indexes tied to outbox processing.
- [ ] Update seed scripts and RLS tests for new schema shape.

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

## 12. Testing Strategy and Acceptance Criteria

Required automated coverage:

1. Event emission
   - one event emitted per domain mutation
   - payload shape matches DTO schema
2. Workflow semantics
   - trigger -> wait -> send happy path
   - cancelOn cancellation path
   - cancel + replacement run behavior
   - wait timeout returns null path
3. Integration delivery
   - Svix publish success/failure + retry behavior
   - org-level integration enablement respected
4. Idempotency
   - duplicate event IDs do not create duplicate logical side effects
   - delivery key uniqueness blocks duplicate sends

Release acceptance:

1. Local dev flow works with Inngest dev server.
2. No outbox/BullMQ code paths are called.
3. Workflow Kit editor can publish an executable workflow.
4. Appointment lifecycle workflow runs correctly in end-to-end test.

## 13. Observability

Required signals:

1. Event send failures by event type.
2. Function start/latency/error by function ID.
3. Cancellation and replacement counts.
4. Wait timeout rates.
5. Side-effect send success/failure by provider/channel.
6. Correlation IDs across API logs and Inngest run IDs.

## 14. Risks and Mitigations

1. Post-commit send gaps without outbox.
   - Mitigation: explicit failure handling, retries where safe, operational alerting.
2. Duplicate side effects due to at-least-once retries.
   - Mitigation: deterministic delivery keys + unique ledger + pre-send guards.
3. Wait-for-event race conditions.
   - Mitigation: flow design constraints and explicit timeout/fallback branches.
4. Migration breakage due to big-bang changes.
   - Mitigation: enforce end-to-end acceptance gates before merge.

## 15. References

1. Inngest self-hosting: https://www.inngest.com/docs/self-hosting
2. Inngest dev server: https://www.inngest.com/docs/dev-server
3. Inngest `cancelOn`: https://www.inngest.com/docs/reference/typescript/functions/cancel-on
4. Inngest `waitForEvent`: https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event
5. Inngest Workflow Kit: https://www.inngest.com/docs/reference/workflow-kit
