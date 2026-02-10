# BullMQ Event Bus Testing Strategy

Status: Draft  
Last Updated: 2026-02-10  
Scope: Event bus and workflow trigger reliability tests for current BullMQ architecture

## 1. Context

We are keeping BullMQ/Valkey for event pub/sub.  
We also want stronger queue test ergonomics inspired by pg-boss testing patterns (spy-style verification), without migrating runtimes.

This document defines a testing approach for current code paths:

1. Domain event emission.
2. Dispatch/fanout behavior.
3. Workflow trigger integration on top of BullMQ.

## 2. Goals

1. Make event-bus tests deterministic and fast.
2. Verify enqueue/fanout behavior without requiring live queue infra in most tests.
3. Preserve high-confidence integration coverage with a smaller number of end-to-end tests.
4. Catch duplicate enqueue/scheduling regressions early.

## 3. Non-Goals

1. Replacing BullMQ with pg-boss.
2. Rewriting all queue tests as unit-only.
3. Building a generic queue testing framework for external reuse.

## 4. Proposed Approach

### 4.1 Test layers

1. **Unit-level spies (default)**
   - Use in-memory spy implementations to assert enqueue/fanout intent and payload shape.
2. **Service integration tests (selected)**
   - Run existing service methods with DB and mocked queue boundary.
3. **Queue/runtime integration tests (small set)**
   - Validate key BullMQ semantics and worker wiring with real queue runtime.

### 4.2 Spy primitives

Create lightweight test helpers around queue interfaces:

1. `JobQueueSpy`
   - records `enqueue(event)` calls.
   - provides assertions on count/order/payload.
2. `FanoutSpy`
   - records `enqueueIntegrationFanout(event, integrations)` calls.
3. `EventBusTraceSpy` (optional)
   - records event lifecycle transitions in tests for easier debugging.

### 4.3 Injection pattern

Refactor queue boundary to be injectable in tests:

1. Keep production default queue path unchanged.
2. Allow tests to set spy queue implementations.
3. Provide explicit reset hooks per test to avoid state leaks.

## 5. Test Cases to Add/Strengthen

### 5.1 Emission correctness

1. Creating appointment emits exactly one `appointment.created`.
2. Cancelling appointment emits exactly one `appointment.cancelled`.
3. Reschedule emits exactly one `appointment.rescheduled`.

### 5.2 Payload and metadata

1. Emitted payload includes expected IDs/timestamps.
2. Trigger metadata fields are preserved when introduced (user/programmatic source).

### 5.3 Delivery/fanout behavior

1. Pending outbox row claims once before fanout.
2. Fanout enqueues one child per enabled integration.
3. Unsupported event types do not enqueue irrelevant integration jobs.

### 5.4 Retry and duplicate prevention

1. Retry path does not produce duplicate logical event rows.
2. Re-processing same event ID does not double-enqueue integration child job IDs.

### 5.5 Workflow trigger compatibility

1. Workflow starter integration receives expected event subset.
2. Duplicate trigger event delivery maps to one logical workflow run (via run-key policy).

## 6. Recommended File Targets

Likely code touchpoints for implementation:

1. `apps/api/src/services/jobs/emitter.ts`
2. `apps/api/src/services/jobs/worker.ts`
3. `apps/api/src/services/jobs/queue.ts`
4. `apps/api/src/services/jobs/*.test.ts`
5. optional new test utility:
   - `apps/api/src/services/jobs/testing/queue-spy.ts`

## 7. Rollout Plan

1. Add spy helpers and one representative service test migration first.
2. Add high-value event emission tests (appointments).
3. Add fanout and retry behavior tests.
4. Add workflow-trigger compatibility tests once workflow starter exists.
5. Keep a minimal real BullMQ integration suite as contract tests.

## 8. Quality Gates

1. New event types must include at least one spy-based emission test.
2. Fanout logic changes must include integration-selection assertions.
3. Workflow trigger paths must include duplicate-trigger tests.

## 9. References

1. Current queue runtime:
   - `apps/api/src/services/jobs/queue.ts`
   - `apps/api/src/services/jobs/worker.ts`
   - `apps/api/src/services/jobs/emitter.ts`
2. Architecture synthesis:
   - `docs/event-bus/synthesis.md`
3. pg-boss testing inspiration:
   - [https://timgit.github.io/pg-boss/#/./api/testing](https://timgit.github.io/pg-boss/#/./api/testing)
