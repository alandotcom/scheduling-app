# Inngest Eventing + Workflow Testing Strategy

Status: Draft
Last Updated: 2026-02-11
Scope: Event emission, integration fanout, and workflow reliability tests for Inngest-first architecture

## 1. Context

The runtime is moving to self-hosted Inngest. This changes test focus from queue mechanics to function semantics and side-effect safety.

## 2. Goals

1. Keep tests deterministic and fast for core behavior.
2. Validate event emission correctness from domain services.
3. Prove workflow semantics: wait, cancel, replace, retry.
4. Prove idempotent side effects under retries/duplicate deliveries.

## 3. Non-Goals

1. Maintaining BullMQ-specific queue contract tests.
2. Reproducing Inngest internal runtime behavior in unit tests.
3. Building a generic test framework for external reuse.

## 4. Proposed Test Layers

### 4.1 Unit Tests (default)

1. Validate payload construction and event naming.
2. Validate cancellation/replacement key derivation.
3. Validate delivery key generation and dedupe logic.

### 4.2 Service Integration Tests

1. Run domain service mutations against real Postgres test DB.
2. Assert event sender invocation count and payload shape.
3. Assert integration configuration filtering by org.

### 4.3 Function Runtime Tests (focused set)

1. Execute Inngest handlers with mocked dependencies.
2. Cover step-level retries and failure categorization.
3. Cover `waitForEvent` timeout and matched-event branches.

### 4.4 End-to-End Tests (small, high-value)

1. Run API + Inngest dev server.
2. Perform real domain mutation.
3. Assert workflow run lifecycle and integration delivery outcomes.

## 5. Required Scenarios

### 5.1 Event Emission

1. Creating appointment emits exactly one `appointment.created` event.
2. Cancelling appointment emits exactly one `appointment.cancelled` event.
3. Reschedule/no-show/update mutations emit exactly one corresponding event.

### 5.2 Payload and Metadata

1. Event payload conforms to DTO schema for each event type.
2. Event IDs are deterministic UUIDv7 and unique per logical mutation.

### 5.3 Workflow Semantics

1. Trigger event starts expected workflow run.
2. `cancelOn` cancels matching active run.
3. Appointment mutation starts replacement run after cancellation.
4. `step.waitForEvent` returns matched event when received.
5. `step.waitForEvent` returns `null` on timeout.

### 5.4 Retry and Idempotency

1. Retried steps do not produce duplicate side effects.
2. Duplicate event delivery does not double-send for same delivery key.
3. Integration/provider transient failures are retried and observable.

### 5.5 Integration Routing

1. Disabled integration for org is skipped.
2. Enabled integration receives supported events only.
3. Unsupported event types do not execute integration handler logic.

## 6. Recommended File Targets

1. `apps/api/src/inngest/client.ts`
2. `apps/api/src/inngest/functions/**/*.ts`
3. `apps/api/src/services/jobs/emitter.ts` (rewritten or replaced module)
4. domain services currently emitting events (`apps/api/src/services/*.ts`)
5. new test utilities under `apps/api/src/test-utils/` or `apps/api/src/inngest/testing/`

## 7. Rollout Order for Test Updates

1. Add event sender unit tests first.
2. Add service-level emission tests for appointments.
3. Add workflow function tests (wait/cancel/replace).
4. Add integration delivery tests (Svix/logger).
5. Add one full end-to-end happy path and one cancellation path.

## 8. Quality Gates

1. Every new event type must have at least one emission test.
2. Workflow cancellation logic changes require cancel+replace regression tests.
3. Any side-effecting step requires idempotency coverage.
4. CI must run at least one E2E Inngest workflow test before merge.

## 9. References

1. Canonical RFC: `docs/plans/workflow-runtime-rfc.md`
2. Inngest retries/error handling: https://www.inngest.com/docs/guides/error-handling
3. Inngest wait-for-event: https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event
4. Inngest cancelOn: https://www.inngest.com/docs/reference/typescript/functions/cancel-on
