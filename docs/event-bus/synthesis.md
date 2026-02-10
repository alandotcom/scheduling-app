# Event Bus + Workflow Synthesis

Status: Draft synthesis (decision update)  
Last Updated: 2026-02-10  
Owners: Product, `@scheduling/api`, `@scheduling/db`, `@scheduling/admin-ui`  
Audience: Engineering + Product architecture review

## 1. Purpose

This document synthesizes findings from the deep research reports in `docs/event-bus/` and updates architecture direction based on new guidance:

1. We should **not** commit to replacing BullMQ event pub/sub immediately.
2. We should keep the currently working BullMQ/Valkey event bus path for now.
3. We should adopt Workflow DevKit for durable orchestration workflows.
4. We should evolve the current outbox framing toward a first-class **Domain Events** log with actor/source metadata.
5. We should improve BullMQ testability with spy-style queue test helpers.

This is a decision update to the prior “definitely replace with pg-boss” stance.

## 2. Inputs Reviewed

1. `docs/event-bus/workflow-devkit-research.md`
2. `docs/event-bus/pgboss-research.md`
3. `docs/event-bus/performance-considerations.md`
4. `docs/event-bus/database-considerations.md`
5. `docs/event-bus/queue-ui-research.md`
6. `docs/event-bus/workflow-builder-research.md`

## 3. Updated Decision

### 3.1 Final position for now

1. **Keep BullMQ/Valkey as the Domain Event Bus runtime** (outbox dispatch/fanout).
2. **Adopt Workflow DevKit as the durable orchestration layer** for delayed/cancellable flows.
3. **Do not migrate event pub/sub to pg-boss in this phase.**
4. Treat pg-boss event bus migration as a **future optimization option**, gated by evidence.
5. Rebrand `event_outbox` conceptually to **Domain Events** (transport + audit-friendly metadata), even if table rename is deferred.

### 3.2 Why this decision is better now

1. Existing BullMQ bus path is already working and operationally known.
2. Offloading high-volume pub/sub from Postgres lowers immediate DB load risk.
3. Workflow value can be delivered without destabilizing core event distribution.
4. It keeps migration surface smaller and increases time-to-value for notifications/workflows.

## 4. Target Architecture (Revised)

### 4.1 Event plane

1. Domain mutations emit `DomainEvent` rows into the current `event_outbox` table, treated as the canonical Domain Events log.
2. Existing BullMQ dispatch/fanout remains the runtime path.
3. Integrations continue to subscribe and process from BullMQ queues.
4. Domain events should include trigger context (`user`, `api_key`, `system/worker`) as fields we can audit and reason about.

### 4.2 Workflow plane

1. Add a `workflow-starter` integration consumer on current event bus.
2. It translates selected events into workflow runs (deterministic run key).
3. Workflow steps handle waits/delays, guard checks, and side effects.
4. Cancellation events are consumed from the same event bus and mapped to run cancellation.

### 4.3 Side-effect safety

1. Use workflow step idempotency patterns (`stepId`-based provider keys where supported).
2. Add app-side delivery dedupe ledger with unique key constraints.
3. Re-check domain state and consent at send time (defense in depth).

## 5. What Changes vs Prior RFC

The prior RFC direction assumed full event-bus runtime migration to pg-boss.  
This synthesis updates that:

1. Keep BullMQ/Valkey pub/sub for now.
2. Limit Workflow DevKit adoption to orchestration concerns first.
3. Defer pg-boss bus replacement until performance/operational evidence justifies it.
4. Keep and enrich the Domain Events table instead of removing outbox immediately.

## 6. Decision Matrix (Current)

| Option | Now | Pros | Cons |
|---|---|---|---|
| BullMQ bus + WDK workflows | **Chosen** | Fastest safe delivery; lower DB pressure; least migration risk | Two runtime systems in near term |
| Full pg-boss replacement now | Deferred | Single Postgres-centric substrate | Higher DB risk; larger migration blast radius |
| BullMQ only (no WDK) | Rejected | No new runtime | Slower path to durable orchestration features |

## 7. Implementation Plan (Phased)

### Phase 0: Terminology + abstraction cleanup

1. Standardize internal naming: `DomainEvent`, `EventBus`, `WorkflowOrchestrator`.
2. Keep runtime implementation unchanged in this phase.
3. Add interface seams in API services to avoid coupling to queue internals.
4. Define Domain Event metadata additions (actor/source/programmatic context).

### Phase 1: Workflow runtime introduction (no bus migration)

1. Introduce Workflow DevKit runtime for orchestration.
2. Add `workflow-starter` integration consumer on BullMQ path.
3. Implement one reference workflow:
   - `appointment.created -> wait -> send SMS`
4. Add cancellation handling from `appointment.cancelled` / disqualifying reschedules.

### Phase 2: Guardrails and reliability hardening

1. Add consent model and checks.
2. Add org-level channel quotas/rate guardrails.
3. Add delivery dedupe table and deterministic keys.
4. Add workflow and delivery observability.

### Phase 3: UI rollout

1. Queue ops UI strategy:
   - Keep Bull Board for bus operations initially.
   - Add workflow observability UI (WDK tooling and/or embedded ops views).
2. Builder v1:
   - Curated blocks only (`trigger`, `wait`, `send`).
   - No generic DAG programming in v1.
3. Add event/queue testing harness improvements from `docs/event-bus/docs/testing.md`.

### Phase 4: Re-evaluate pg-boss bus migration

Only evaluate replacing BullMQ if all gates are met:

1. Measured event volume justifies simplification.
2. Postgres headroom and lock/vacuum profile support added load.
3. Operational confidence from workflow rollout is high.
4. Migration plan includes reversible cutover.

## 8. Performance and Database Guardrails

Based on performance/database research, enforce before scaling workflows:

1. Explicit DB connection budget for API + workers.
2. Queue and workflow lag SLOs with alerting.
3. Retention/cleanup strategy for workflow runtime tables.
4. Autovacuum/bloat dashboards for high-churn tables.
5. Staging load tests with failure injection before larger rollout.

## 9. Queue Operations UI Direction

From queue UI research:

1. There is no official pg-boss dashboard equivalent to Bull Board.
2. For current architecture, keep Bull Board for BullMQ queues.
3. Add a custom admin “Workflow Ops” section in existing admin UI for:
   - run status,
   - retries/failures,
   - cancellation actions,
   - delivery logs.

This avoids unnecessary tooling churn while workflows are introduced.

## 10. Workflow Builder Direction (No Next.js)

From workflow-builder research:

1. Build in current React + TanStack app (`apps/admin-ui`), no Next.js dependency.
2. Use a graph editor stack compatible with current frontend (recommended research direction: React Flow).
3. Persist immutable workflow definition versions.
4. Compile definitions to validated execution plans server-side.
5. Keep v1 constrained to curated workflow primitives.

## 11. Key Risks and Mitigations

1. **Risk:** Duplicate sends from retries/replays.
   - Mitigation: deterministic idempotency keys + unique delivery ledger + provider idempotency keys.
2. **Risk:** Workflow orchestration complexity leaks into event bus.
   - Mitigation: strict boundary: bus triggers workflows, workflows own long-lived state.
3. **Risk:** Operational fragmentation (BullMQ + WDK).
   - Mitigation: unified observability dashboard and shared runbooks.
4. **Risk:** Premature bus migration pressure.
   - Mitigation: formal gate criteria in Phase 4.

## 12. Open Questions

1. Which workflow world/deployment topology should be used first in this repo’s runtime setup?
2. What are default org-level messaging quotas and escalation behavior?
3. What are exact workflow run/cancellation SLAs for v1?
4. Which workflow actions beyond messaging are included in v1/v2?

## 13. Immediate Next Steps

1. Update architecture decision records to reflect this revised stance.
2. Implement Phase 0 naming/abstraction cleanup.
3. Ship one end-to-end workflow template with full idempotency and cancellation checks.
4. Define metrics dashboards and on-call runbooks before broader rollout.
5. Implement BullMQ spy-style test helpers and migrate priority event tests.

## 14. Source Index

1. `docs/event-bus/workflow-devkit-research.md`
2. `docs/event-bus/pgboss-research.md`
3. `docs/event-bus/performance-considerations.md`
4. `docs/event-bus/database-considerations.md`
5. `docs/event-bus/queue-ui-research.md`
6. `docs/event-bus/workflow-builder-research.md`
7. `docs/event-bus/docs/testing.md`
