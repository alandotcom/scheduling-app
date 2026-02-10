# Event Bus + Workflow DevKit Runtime RFC (Simplified)

Status: Accepted (Simplified)
Last Updated: 2026-02-10
Owners: Product, `@scheduling/api`, `@scheduling/db`, `@scheduling/admin-ui`
Related: `docs/ARCHITECTURE.md`, `docs/event-bus/synthesis.md`

## 1. Summary

We will keep the existing BullMQ/Valkey event bus and add **Workflow DevKit** for durable workflow execution.

Key point: we are **not** building a custom workflow orchestrator abstraction right now.
We will use Workflow DevKit directly for workflow runs, waits, and cancellation.

## 2. Current State

1. Domain writes create events in `event_outbox`.
2. BullMQ workers claim and fan out those events to integrations.
3. This works for fanout, but not for long-lived, cancellable business flows.

## 3. Decision

1. Keep BullMQ/Valkey as the event bus runtime.
2. Add Workflow DevKit for durable workflows.
3. Keep `event_outbox` as the canonical domain event log for now.
4. Do not add new generic orchestrator/service abstraction layers unless proven necessary by real duplication.
5. Defer pg-boss migration discussion until we have production evidence.
6. Add a dedicated Workflow runtime process (`apps/api/src/workflow-worker.ts`) to host Workflow HTTP handlers and Postgres world polling.
7. Keep `apps/api/src/worker.ts` as a non-HTTP BullMQ worker process.

## 4. Goals

1. Preserve existing event fanout behavior and reliability.
2. Support durable workflow patterns: trigger, wait, condition check, cancel.
3. Ensure effectively-once external side effects with deterministic idempotency keys.
4. Keep implementation small and incremental.

## 5. Non-Goals

1. Building a general workflow framework around Workflow DevKit.
2. Replacing BullMQ now.
3. Shipping a visual workflow builder in this phase.
4. Promising mathematical exactly-once across third-party providers.

## 6. Architecture (Minimal)

### 6.1 Event plane (unchanged)

1. Domain writes persist events to `event_outbox`.
2. Dispatch worker claims pending rows and enqueues fanout jobs.
3. Integration workers process their own queues.

### 6.2 Workflow plane (new)

1. A workflow trigger consumer listens to selected domain events.
2. It starts Workflow DevKit runs using deterministic run keys.
3. Workflow DevKit manages wait/delay and cancellation semantics.
4. Disqualifying events (cancel/reschedule/state change) map to workflow cancellation.

### 6.3 Runtime topology (explicit)

1. `apps/api/src/index.ts` remains the business API server.
2. `apps/api/src/worker.ts` remains BullMQ/event-bus processing only.
3. `apps/api/src/workflow-worker.ts` runs a Bun HTTP server exposing Workflow protocol handlers:
   - `/.well-known/workflow/v1/flow`
   - `/.well-known/workflow/v1/step`
   - `/.well-known/workflow/v1/webhook/:token`
4. `apps/api/src/workflow-worker.ts` also starts the Postgres world polling loop (`getWorld().start?.()`).
5. Workflow HTTP handlers and world polling run in the same workflow process by default.

### 6.4 Side-effect safety

1. Use deterministic run and step idempotency keys.
2. Add a delivery dedupe table with unique `delivery_key`.
3. Re-check send conditions at send time (state + consent).

## 7. Data Changes

### 7.1 Keep

1. Keep `event_outbox` as-is for current phase.

### 7.2 Add (only what we need for first workflow)

1. Workflow run persistence required by Workflow DevKit/Postgres world.
2. `workflow_delivery_log` with unique `delivery_key`.

No speculative tables or generic definition systems in this phase.

## 8. Implementation Plan

### Phase A: First Working Flow (narrow scope)

Target flow: `appointment.created -> wait -> send SMS reminder`.

Tasks:

1. Add `apps/api/src/workflow-worker.ts` as a dedicated Workflow process (HTTP handlers + Postgres world start).
2. Add `dev:workflow-worker`, `build:workflow-worker`, and `start:workflow-worker` scripts (`apps/api/package.json` + root `package.json`).
3. Keep `apps/api/src/worker.ts` BullMQ-only and add one workflow trigger consumer for `appointment.created`.
4. Derive deterministic run key from `(org_id, workflow_type, appointment_id)`.
5. Add cancellation mapping from `appointment.cancelled` and `appointment.rescheduled`.
6. Add `workflow_delivery_log` and enforce unique `delivery_key`.
7. Add one end-to-end integration test for create/wait/send/cancel.

Exit criteria:

1. Workflow runs end-to-end in dev.
2. Duplicate trigger events do not produce duplicate sends.
3. Late cancellation does not send stale reminders.

### Phase B: Hardening

Tasks:

1. Add send-time guard checks (latest appointment status + consent).
2. Add retry/failure categorization for workflow actions.
3. Add reconciliation job for stuck/inconsistent runs.
4. Add failure-mode tests (retries, worker restart, replay, late cancellation).

Exit criteria:

1. Effectively-once behavior demonstrated under retries/replay.
2. Operators can identify and recover failed/stuck runs.

## 9. Observability

Use OpenTelemetry for metrics/traces/log correlation.

Initial required signals:

1. Event dispatch latency and retry counts.
2. Workflow start latency and wake latency.
3. Cancellation success count.
4. Delivery dedupe prevented count.
5. External send success/failure by provider.
6. Workflow runtime process health (HTTP handler availability + world polling heartbeat).

No custom metrics framework should be introduced for this work.

## 10. Guardrails

1. No new abstraction layers around Workflow DevKit unless concrete duplication appears (3+ real call sites).
2. No speculative builder/definition system in this phase.
3. Keep process responsibilities explicit: API server for business routes, BullMQ worker for event bus jobs, workflow worker for Workflow protocol + world polling.
4. Prefer deletion/simplification over additive architectural scaffolding.

## 11. Risks and Mitigations

1. Duplicate sends under retries/replay.
   - Mitigation: deterministic keys + unique delivery ledger.
2. Late cancellation race.
   - Mitigation: explicit cancellation signals + send-time guard.
3. Operational complexity.
   - Mitigation: OpenTelemetry dashboards + minimal runbook.

## 12. Open Questions (Non-blocking)

1. Which SMS provider is first for reminder delivery?
2. What default wait offset should ship first?
3. What consent model fields are mandatory before enabling SMS sends?

## 13. References

1. `docs/event-bus/synthesis.md`
2. `docs/event-bus/workflow-devkit-research.md`
3. Workflow DevKit idempotency: https://useworkflow.dev/docs/foundations/idempotency
4. Workflow DevKit worlds: https://useworkflow.dev/docs/worlds
5. Workflow DevKit Postgres world: https://useworkflow.dev/worlds/postgres
6. Workflow framework integrations (Bun): https://useworkflow.dev/docs/how-it-works/framework-integrations#example-bun-integration
