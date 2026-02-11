# Inngest + Workflow Kit Deep Dive (Supersedes Workflow DevKit Direction)

Status: Adopted Inputs
Last Updated: 2026-02-11
Topic: Inngest and Workflow Kit fit for eventing, integrations, and user-defined workflows

## 1. Executive Summary

Inngest covers the core runtime capabilities this project needs in one system:

1. Event-triggered durable function runs.
2. Built-in retries and step-level checkpointing.
3. Cancellation primitives via `cancelOn`.
4. Event waits via `step.waitForEvent`.
5. Flow control primitives (`concurrency`, `throttle`, etc.).
6. Self-hosting on Postgres + Redis/Valkey.
7. Workflow Kit for user-defined workflow UI + engine pattern.

Conclusion: Inngest should replace BullMQ and Workflow DevKit runtime for this codebase.

## 2. Why Inngest Fits This Repo

1. Current architecture already models domain events and async fanout.
2. Existing Postgres + Valkey infra maps cleanly to self-hosted Inngest requirements.
3. Existing typed DTO event schemas can drive typed Inngest event contracts.
4. Existing integration registry/settings model can be reused in Inngest handlers.
5. Workflow Kit reduces custom editor/runtime compiler complexity.

## 3. Capability Mapping to Project Needs

### 3.1 Event Fanout

Need:
- Domain events fan out to multiple downstream processors.

Inngest mapping:
- Send one event; multiple functions subscribe by event name.
- Per-function flow control and retries replace queue-specific fanout code.

### 3.2 Cancel + Replace

Need:
- Appointment mutations cancel active automation and start replacement run.

Inngest mapping:
- Use `cancelOn` with matching expressions (`orgId`, `appointmentId`, workflow key).
- Trigger replacement run from mutation event function.

### 3.3 Wait-for-event

Need:
- Pause workflows until future domain/user events or timeout.

Inngest mapping:
- Use `step.waitForEvent` with match expressions and explicit timeout branch handling.

### 3.4 Integration Delivery Reliability

Need:
- Retry transient failures, prevent duplicate side effects.

Inngest mapping:
- Step retries + idempotent delivery keys + dedupe ledger checks.

### 3.5 User-defined Workflows

Need:
- Admin editor and publishable workflow definitions.

Inngest mapping:
- Workflow Kit engine/actions on backend + prebuilt React editor components on frontend.

## 4. Self-Hosting Model

Key points for this repo:

1. Inngest can be self-hosted.
2. Runtime relies on Postgres and Redis/Valkey class store.
3. Local dev can use Inngest dev server for fast iteration.
4. API app only needs to serve Inngest endpoint and send events.

## 5. Operational Implications

1. Remove queue worker fleet complexity (`dispatch`, `fanout`, per-integration workers).
2. Remove Workflow DevKit worker and build pipeline.
3. Shift ops focus to function health, retries, and Inngest service health.
4. Use Inngest run history as primary execution visibility.

## 6. Risks and Controls

1. At-least-once retries can duplicate effects.
   - Control: deterministic delivery keys + unique ledger.
2. Wait event ordering races.
   - Control: design waits so events are emitted after wait begins; always implement timeout branch.
3. Big-bang migration risk.
   - Control: enforce strict acceptance suite and complete legacy deletion in one PR series.
4. Loss of outbox atomicity.
   - Control: explicit post-commit event send policy and failure alerting.

## 7. Recommended Adoption Pattern

1. Foundation: add Inngest client + serve endpoint.
2. Cutover event emission.
3. Move integrations to Inngest handlers.
4. Move workflows to Inngest functions + Workflow Kit.
5. Remove legacy workers/outbox/runtime/deps.

## 8. Reference Links

1. Inngest TypeScript SDK: https://www.inngest.com/docs/typescript
2. Inngest serve endpoint: https://www.inngest.com/docs/reference/serve
3. Inngest send events: https://www.inngest.com/docs/reference/events/send
4. Inngest cancelOn: https://www.inngest.com/docs/reference/typescript/functions/cancel-on
5. Inngest waitForEvent: https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event
6. Inngest self-hosting: https://www.inngest.com/docs/self-hosting
7. Inngest dev server: https://www.inngest.com/docs/dev-server
8. Workflow Kit overview: https://www.inngest.com/docs/reference/workflow-kit
9. Workflow Kit engine: https://www.inngest.com/docs/reference/workflow-kit/engine
10. Workflow Kit components API: https://www.inngest.com/docs/reference/workflow-kit/components-api
