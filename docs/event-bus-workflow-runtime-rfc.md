# Event Bus and Workflow Runtime RFC

Status: Accepted (Updated)  
Last Updated: 2026-02-10  
Owners: Product, `@scheduling/api`, `@scheduling/db`, `@scheduling/admin-ui`  
Related: `docs/ARCHITECTURE.md`, `docs/event-bus/synthesis.md`, `docs/event-bus/docs/testing.md`

## 1. Abstract

This RFC defines the architecture and rollout plan for durable workflows while keeping the current BullMQ/Valkey event bus runtime. Domain mutations continue to emit canonical `DomainEvent` records (currently in `event_outbox`), BullMQ remains the fanout mechanism, and Workflow DevKit is introduced for long-lived orchestration (waits, cancellation, guarded side effects). A future pg-boss migration remains optional and evidence-gated rather than a committed near-term replacement.

## 2. Context and Problem

### 2.1 Current state

Today, domain mutations emit events to `event_outbox`, then BullMQ workers claim and fan out those events to integration consumers.

### 2.2 Problem statement

This works for queue fanout, but product direction requires durable orchestration patterns:

1. Trigger from domain events.
2. Wait for delayed windows.
3. Conditionally execute side effects.
4. Cancel or skip on later disqualifying events.

We need a model that preserves current reliability while adding robust orchestration and effectively-once side-effect controls.

## 3. Goals

1. Preserve a reliable event bus for current integrations.
2. Introduce durable workflow orchestration for delayed/cancellable flows.
3. Formalize event contracts as `DomainEvent` + `EventBus`.
4. Achieve effectively-once external side effects using deterministic idempotency and DB uniqueness.
5. Keep implementation scope incremental and operationally safe.

## 4. Non-Goals

1. Building the visual workflow builder in this RFC implementation phase.
2. Shipping full provider-specific notifications rollout in this RFC implementation phase.
3. Claiming mathematical exactly-once guarantees across third-party providers.
4. Committing to immediate BullMQ replacement.

## 5. Decision

### 5.1 Accepted decisions

1. Keep BullMQ/Valkey as the EventBus runtime now.
2. Adopt Workflow DevKit for durable orchestration.
3. Reframe `event_outbox` conceptually as the Domain Events log, including actor/source metadata over time.
4. Keep `integrations` as adapter concept; integrations can trigger workflows and workflows can invoke integrations.
5. Improve queue testability with BullMQ spy-style testing helpers.

### 5.2 Deferred decision

1. Replacing BullMQ with pg-boss is deferred and gated by data (DB headroom, ops complexity, throughput/latency evidence).

## 6. Decision Matrix

| Option | Decision | Pros | Cons |
|---|---|---|---|
| BullMQ bus + Workflow DevKit | **Chosen now** | Fastest safe path, known runtime, lower immediate DB pressure | Two async runtimes in near term |
| Full pg-boss migration now | Deferred | Single Postgres substrate | Higher migration risk and added DB load on hot paths |
| BullMQ only (no workflow runtime) | Rejected | Lowest change surface | Blocks durable workflow product direction |

## 7. Architecture

### 7.1 Event plane

1. Domain writes create canonical `DomainEvent` records (currently persisted in `event_outbox`).
2. BullMQ workers claim pending domain events and fan out to subscribers/integrations.
3. Domain event envelope evolves to include trigger context (`user`, `api_key`, `system`, `workflow`).

### 7.2 Workflow plane

1. A workflow-starter subscriber listens to selected domain events from BullMQ.
2. Workflow runs are started with deterministic run keys.
3. Workflow steps own waits/delays, conditional checks, and side-effect execution.
4. Cancellation/disqualifying events are mapped to workflow cancellation signals.

### 7.3 Idempotency and side-effect safety

1. Workflow steps use deterministic step keys.
2. External sends are guarded by a delivery ledger with unique `delivery_key`.
3. Provider idempotency keys are reused across retries when supported.
4. Send-time guard checks (state and consent) execute before side effects.

### 7.4 Cancellation model

1. Immediate cancellation on disqualifying events (cancel/reschedule/state change).
2. Send-time re-check prevents stale delivery if cancellation arrives late.

## 8. Public Interfaces and Data Changes (Proposed)

### 8.1 Terminology and contracts

1. `AnyDomainEvent` remains payload contract and is documented as canonical `DomainEvent` envelope.
2. Queue-engine-specific names are abstracted behind `EventBus` contracts.

### 8.2 Service interfaces

1. `EventBusPublisher` with `publish(event: DomainEvent): Promise<void>`.
2. `EventBusSubscriber` with typed `subscribe(...)` handlers.
3. `WorkflowStarter` with `startFromEvent(...)` deterministic run behavior.
4. `WorkflowOrchestrator` with `start`, `cancel`, and `status` operations.

### 8.3 Data model direction

1. Keep and evolve current domain event persistence (current `event_outbox` table).
2. Add workflow persistence tables:
   - `workflow_definitions`
   - `workflow_runs`
   - `workflow_run_entity_links`
   - `workflow_delivery_log` (unique `delivery_key`)
3. Add policy-related data over time:
   - client consent/opt-out
   - org-level channel quota/rate guardrails

### 8.4 Route surface (documented, not implemented here)

1. `/v1/workflows/definitions/*`
2. `/v1/workflows/runs/*`
3. `/v1/workflows/triggers/*`

## 9. Implementation Plan (High-Level Phases and Tasks)

### Phase 0: Naming, Boundaries, and Baseline Instrumentation

Goal: standardize architecture language and create seams without behavior change.

Task checklist:

- [ ] `[@scheduling/api]` Standardize runtime/service terminology to `DomainEvent`, `EventBus`, `WorkflowOrchestrator`.
- [ ] `[@scheduling/db]` Document and validate `event_outbox` as canonical Domain Events log (rename optional, deferred).
- [ ] `[@scheduling/api]` Add/confirm queue abstraction interfaces at publish/subscribe boundaries.
- [ ] `[@scheduling/api, @scheduling/db]` Define DomainEvent metadata contract for actor/source attribution.
- [ ] `[@scheduling/api]` Add baseline metrics for publish latency, consumer lag, retries, and dead-letter counts.
- [ ] `[@scheduling/admin-ui]` Confirm metric names/labels needed for future dashboard integration.

Exit criteria:

1. No runtime behavior changes.
2. All key async paths mapped to explicit interfaces.

### Phase 1: Workflow Runtime Introduction on Existing Bus

Goal: introduce durable orchestration while preserving BullMQ for fanout.

Task checklist:

- [ ] `[@scheduling/api]` Integrate Workflow DevKit runtime in API/worker architecture.
- [ ] `[@scheduling/api]` Add workflow-starter consumer subscribed to selected DomainEvents from BullMQ.
- [ ] `[@scheduling/api]` Implement reference workflow: `appointment.created -> wait -> send SMS`.
- [ ] `[@scheduling/api, @scheduling/db]` Implement deterministic run-key derivation and duplicate-trigger handling.
- [ ] `[@scheduling/api]` Implement cancellation handling from disqualifying appointment events.
- [ ] `[@scheduling/db]` Create workflow persistence schema required for runs and state transitions.

Exit criteria:

1. Reference workflow runs end-to-end in non-production environments.
2. Duplicate trigger events do not create duplicate logical runs.

### Phase 2: Reliability and Guardrails

Goal: harden side effects and policy correctness.

Task checklist:

- [ ] `[@scheduling/db]` Add delivery dedupe ledger with unique-key enforcement (`delivery_key`).
- [ ] `[@scheduling/api]` Add send-time guard checks (fresh domain state + consent validity).
- [ ] `[@scheduling/db, @scheduling/api]` Add org-level quota/rate-limit policy model and enforcement points.
- [ ] `[@scheduling/api]` Add structured workflow telemetry and failure categorization.
- [ ] `[@scheduling/api]` Implement reconciliation tooling for stuck/cancelled/inconsistent runs.
- [ ] `[@scheduling/admin-ui]` Surface guard-blocked and duplicate-prevented outcomes in ops views.

Exit criteria:

1. Effectively-once guarantees are demonstrated through integration tests.
2. Guardrails are enforced under retries and replay scenarios.

### Phase 3: Operations UI and Workflow Builder v1 Foundation

Goal: provide operational visibility and controlled authoring primitives.

Task checklist:

- [ ] `[@scheduling/api]` Keep Bull Board operational for queue operations during this phase.
- [ ] `[@scheduling/admin-ui]` Add Workflow Ops views (run status, retries, failures, cancellation state, delivery logs).
- [ ] `[@scheduling/api, @scheduling/db]` Define immutable workflow definition versioning model.
- [ ] `[@scheduling/admin-ui]` Implement builder v1 foundation in `apps/admin-ui` (non-Next.js) with curated blocks (`trigger`, `wait`, `send`).
- [ ] `[@scheduling/api]` Add server-side validation and compilation of workflow definitions into executable plans.
- [ ] `[@scheduling/admin-ui, @scheduling/api]` Add builder publish flow and validation error UX.

Exit criteria:

1. Operators can inspect and triage workflow run health in admin UI.
2. v1 builder can produce valid definitions for curated workflow templates.

### Phase 4: Test System Expansion and Release Hardening

Goal: raise confidence for rollout and ongoing changes.

Task checklist:

- [ ] `[@scheduling/api]` Implement BullMQ spy-style test helpers (see `docs/event-bus/docs/testing.md`).
- [ ] `[@scheduling/api]` Expand deterministic tests for emission, fanout, duplicate prevention, and workflow triggers.
- [ ] `[@scheduling/api]` Keep a minimal real-runtime queue integration test suite as contract tests.
- [ ] `[@scheduling/api, @scheduling/db]` Add fault-injection scenarios for retry storms, late cancellation, and worker restarts.
- [ ] `[@scheduling/api]` Finalize SLOs, alert definitions, and on-call runbooks.
- [ ] `[@scheduling/admin-ui]` Validate operator workflows for failure triage from Workflow Ops UI.

Exit criteria:

1. Queue/workflow test matrix covers critical failure modes.
2. Alerting and runbooks are production-ready.

### Phase 5: Optional EventBus Runtime Re-evaluation

Goal: decide whether pg-boss migration is justified.

Task checklist:

- [ ] `[@scheduling/db, @scheduling/api]` Review production-like load metrics and DB headroom.
- [ ] `[@scheduling/api]` Compare operational cost/complexity of dual runtime vs single-runtime migration.
- [ ] `[@scheduling/api, @scheduling/db]` If justified, author a separate pg-boss migration RFC with rollback plan.
- [ ] `[@scheduling/admin-ui]` Assess UI/tooling impact if queue runtime changes.

Exit criteria:

1. Explicit Go/No-Go decision documented with data.

## 10. Operations and Observability

### 10.1 Metrics

Event bus metrics:

1. publish latency p50/p95/p99
2. consumer lag by queue/subscriber
3. retry count/rate
4. dead-letter count
5. duplicate-prevented count

Workflow metrics:

1. run start latency
2. wake latency after waits
3. cancellation success count
4. guard-blocked side effects
5. external send success/failure by provider/channel

### 10.2 Dashboards and alerting

1. EventBus health dashboard by event type and org.
2. Workflow reliability dashboard by definition/version and step.
3. Alerts for sustained lag, retry spikes, dead-letter growth, wake latency SLO breaches.

### 10.3 Runbooks

1. Stuck worker recovery.
2. Retry storm containment.
3. Reconciliation and replay process.
4. Workflow cancellation drift triage.

## 11. Risks and Mitigations

1. Duplicate side effects under retries/replays.
   - Mitigation: deterministic keys + unique delivery ledger + provider idempotency keys.
2. Event-to-workflow semantic drift.
   - Mitigation: canonical domain event schemas and trigger contract tests.
3. Operational complexity across bus + workflow runtime.
   - Mitigation: unified dashboards, runbooks, and clear ownership boundaries.
4. Domain events retention growth.
   - Mitigation: retention policy, archival strategy, and partitioning when needed.
5. Future migration churn if pg-boss is reconsidered.
   - Mitigation: preserve clean interfaces (`EventBus*`) and avoid runtime leakage.

## 12. Acceptance Criteria

1. RFC reflects revised architecture decision (BullMQ retained for now).
2. High-level implementation phases and task inventory are explicit and actionable.
3. Idempotency and cancellation semantics are concrete and testable.
4. Operational metrics, alerting, and runbook expectations are defined.
5. Research sources are linked for implementation-time reference.

## 13. Test Scenarios

### 13.1 Event bus correctness

1. Every emitted domain event reaches each logical subscriber once after dedupe.
2. No dropped events across worker restart/failover.

### 13.2 Workflow idempotency

1. Duplicate trigger events do not create duplicate logical runs.
2. Retried action steps do not produce duplicate external sends.

### 13.3 Cancellation behavior

1. Disqualifying events cancel pending delayed runs.
2. Send-time guard blocks stale sends when cancellation is late.

### 13.4 Migration and release safety

1. Staging validation includes replay samples and injected failure tests.
2. Dead-letter, retry, and recovery behavior is verified before broad rollout.

## 14. Assumptions and Defaults

1. This RFC is decision-final for the current phase.
2. Event bus runtime remains BullMQ/Valkey until a future explicit migration decision.
3. Workflow runtime baseline is Workflow DevKit.
4. Scope is architecture + implementation plan, not code rollout in this document.
5. Guarantee language is effectively-once external side effects.
6. Workflow builder implementation starts with curated blocks only.

## 15. Open Questions (Non-Blocking)

1. Which workflow actions beyond trigger/wait/send are in builder v1 vs v2?
2. What default org-level quotas/rate limits should ship first?
3. What SLO thresholds should gate broader rollout phases?
4. What retention window should be default for Domain Events in pre-production?

## 16. Research References and Source Links

### 16.1 Internal research docs

1. `docs/event-bus/synthesis.md`
2. `docs/event-bus/workflow-devkit-research.md`
3. `docs/event-bus/pgboss-research.md`
4. `docs/event-bus/performance-considerations.md`
5. `docs/event-bus/database-considerations.md`
6. `docs/event-bus/queue-ui-research.md`
7. `docs/event-bus/workflow-builder-research.md`
8. `docs/event-bus/docs/testing.md`

### 16.2 External references

1. Workflow DevKit idempotency: [https://useworkflow.dev/docs/foundations/idempotency](https://useworkflow.dev/docs/foundations/idempotency)
2. Workflow DevKit worlds: [https://useworkflow.dev/docs/worlds](https://useworkflow.dev/docs/worlds)
3. Workflow DevKit Postgres world: [https://useworkflow.dev/worlds/postgres](https://useworkflow.dev/worlds/postgres)
4. pg-boss pub/sub API: [https://timgit.github.io/pg-boss/#/api/pubsub](https://timgit.github.io/pg-boss/#/api/pubsub)
5. pg-boss testing API: [https://timgit.github.io/pg-boss/#/./api/testing](https://timgit.github.io/pg-boss/#/./api/testing)
6. BullMQ important notes (at-least-once): [https://docs.bullmq.io/bull/important-notes](https://docs.bullmq.io/bull/important-notes)
7. Workflow builder reference app: [https://workflow-builder.dev/](https://workflow-builder.dev/)
8. Vercel workflow builder template: [https://github.com/vercel-labs/workflow-builder-template](https://github.com/vercel-labs/workflow-builder-template)
