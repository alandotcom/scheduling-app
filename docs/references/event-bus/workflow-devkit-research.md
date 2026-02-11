# Workflow DevKit Deep Research

Date: 2026-02-10  
Repo Context: `/Users/alancohen/projects/scheduling-app`  
Topic: Workflow DevKit fit for EventBus + workflow orchestration architecture

## Executive Summary

Workflow DevKit (WDK) is a strong fit for the orchestration layer in this repo when paired with a separate Domain Event Bus. It provides durable workflow execution primitives (`"use workflow"`, `"use step"`), built-in retry semantics, and explicit idempotency guidance based on stable `stepId`.

For your current plan, the key point is:

1. WDK is best used for long-lived orchestration, waits/sleeps, and stateful business processes.
2. WDK Postgres World is explicitly documented as using PostgreSQL for durable state and **pg-boss** for job processing.
3. You still need app-level event modeling and trigger-dedup strategy (especially for webhook/event retries) above workflow start boundaries.

Inference for this codebase: keep DomainEvent/EventBus as the trigger plane, and use WDK as the execution plane for delayed/cancellable workflows.

## What WDK Is (and Is Not)

WDK is an open-source TypeScript framework for durable workflows that can suspend/resume and survive restarts/deploys.

It is not just a queue library:

1. It gives a workflow programming model with orchestration semantics.
2. It gives step-level retry semantics and error control.
3. It provides inspection tooling and a web UI for runs.

It is also not a complete replacement for business event taxonomy:

1. You still need your own DomainEvent definitions and trigger mappings.
2. You still need your own guardrails (consent, quotas, domain state checks).

## Runtime Model

From WDK foundations docs:

1. **Workflow functions** (`"use workflow"`) orchestrate logic and are intentionally constrained.
2. **Step functions** (`"use step"`) execute units of work and are persisted/retried.

Important architectural implication:

1. Keep workflow functions for control flow and deterministic orchestration.
2. Put side effects (APIs, DB writes, notifications) in steps.
3. Design steps to be idempotent under retry/replay.

## Worlds and Postgres World

WDK exposes a world abstraction (local, Vercel, Postgres, etc.).

For your plan, Postgres World matters most:

1. It is documented as a production-ready self-hosted world.
2. It uses PostgreSQL durable storage.
3. It uses pg-boss for reliable job processing.

Operationally this aligns with your “single Postgres-centric substrate” direction.  
It also means queue tuning and DB tuning become one operational surface, which simplifies topology but increases focus on Postgres capacity management.

## Idempotency Semantics

The WDK idempotency guidance is explicit:

1. External side-effecting steps should use idempotency keys.
2. `getStepMetadata().stepId` is stable across retries for the same step invocation.
3. Recommended pattern is using `stepId` as provider idempotency key where supported.

For this repo’s notification use cases:

1. Use `stepId` plus business context as deterministic idempotency key (`sms:{stepId}` or stricter).
2. Persist an app-side delivery ledger keyed by deterministic key to prevent duplicate side effects even if provider behavior is ambiguous.
3. Keep send-time domain checks in a step before side effects.

## Retry and Error Controls

WDK defaults and controls:

1. Steps retry on arbitrary errors by default.
2. Retry count can be customized (`maxRetries`).
3. `FatalError` can stop retries for terminal conditions.
4. `RetryableError` supports customized retry timing.

Practical mapping for this repo:

1. Use `FatalError` for policy failures (opt-out, quota exceeded, invalid state).
2. Use retryable errors for transient provider/network failures.
3. Make retry policy explicit by step type (SMS vs webhook vs internal sync).

## Sleep, Suspense, and Scheduling

WDK exposes a workflow-level `sleep()` primitive and supports long pauses.  
The docs position this for durable waiting and scheduling semantics.

For your target example:

1. Trigger on `appointment.created`.
2. Sleep for relative/absolute delay.
3. Re-check state and policy.
4. Send message step with idempotency key.

This is cleaner than hand-rolling delayed queue jobs and cancellation chains in queue-only infrastructure.

## Observability and Debugging

WDK ships with observability features:

1. CLI inspection (`npx workflow inspect ...`).
2. Local web UI via CLI (`--web`) for run exploration.
3. World-aware inspection backends.

Implication:

1. You can get a workflow-run-native debug surface faster than custom instrumentation-only approaches.
2. You should still integrate with app-level metrics and logs for business outcomes (sends, skips, consent blocks).

## Deployment and Runtime Topology

Postgres World deployment points in docs:

1. Install world package and set `WORKFLOW_TARGET_WORLD`.
2. Provide `WORKFLOW_POSTGRES_URL`.
3. Run setup/migration command (`workflow-postgres-setup`).
4. Start world on server start to subscribe to jobs.

For this monorepo:

1. Run WDK workers in API process only if load is low to moderate.
2. Prefer separate worker process (or process group) for predictable scaling and fault isolation once workflow volume grows.
3. Keep explicit health checks for both API and workflow worker roles.

## Migration Implications for `scheduling-app`

### Good fit points

1. Existing domain events and outbox are already present.
2. Existing integration abstraction maps naturally to “workflow starter” and “delivery adapters”.
3. Existing admin/settings surface can evolve toward workflow definitions.

### Required design decisions

1. Trigger dedupe strategy at workflow start (event-id + workflow-id uniqueness).
2. State model for workflow definitions/runs in your DB schema.
3. Relationship between integration toggles and workflow-level actions.

### Likely immediate tasks

1. Introduce a `WorkflowStarter` integration consumer subscribing to selected domain events.
2. Add deterministic run identity policy and uniqueness constraints.
3. Add delivery ledger + provider idempotency key adapter layer.

## Risks and Limitations

1. WDK is in beta (as documented on site), so API/runtime changes may occur.
2. Workflow start idempotency by custom run ID has been discussed publicly; verify current behavior/version before relying on assumptions.
3. If workflow and queueing share same Postgres under heavy load, DB performance governance becomes critical.
4. Durable orchestration does not remove need for business-level guardrails (consent, quota, and state validation).

## Recommendation for This Repo

1. Keep DomainEvent + EventBus as first-class architecture.
2. Use WDK Postgres World for orchestration of delayed/cancellable workflows.
3. Standardize idempotency:
1. Trigger dedupe key at run creation.
2. Step-level provider idempotency key from `stepId`.
3. App-side delivery dedupe ledger with unique constraints.
4. Build workflow v1 with curated blocks (`trigger`, `wait`, `send`) and strict policy checks.

## Open Questions to Resolve Before Implementation

1. Exact dedupe contract for workflow run creation across retries.
2. Worker topology choice (co-located vs dedicated service).
3. Operational SLOs for wake latency and retry latency.
4. Multi-tenant scoping strategy for workflow metadata and inspection APIs.

## Sources

1. WDK home: [https://useworkflow.dev/](https://useworkflow.dev/)
2. Workflows and steps: [https://useworkflow.dev/docs/foundations/workflows-and-steps](https://useworkflow.dev/docs/foundations/workflows-and-steps)
3. Idempotency: [https://useworkflow.dev/docs/foundations/idempotency](https://useworkflow.dev/docs/foundations/idempotency)
4. Errors and retries: [https://useworkflow.dev/docs/foundations/errors-and-retries](https://useworkflow.dev/docs/foundations/errors-and-retries)
5. API reference (`getStepMetadata`, `sleep`): [https://useworkflow.dev/docs/api-reference/workflow](https://useworkflow.dev/docs/api-reference/workflow)
6. Observability: [https://useworkflow.dev/docs/observability](https://useworkflow.dev/docs/observability)
7. Worlds: [https://useworkflow.dev/worlds](https://useworkflow.dev/worlds)
8. Postgres world: [https://useworkflow.dev/worlds/postgres](https://useworkflow.dev/worlds/postgres)
9. Deploying with Postgres world: [https://useworkflow.dev/docs/deploying/world/postgres-world](https://useworkflow.dev/docs/deploying/world/postgres-world)
10. Vercel Workflow docs (managed layer context): [https://vercel.com/docs/workflow](https://vercel.com/docs/workflow)
11. Workflow repository (project status and issues): [https://github.com/vercel/workflow](https://github.com/vercel/workflow)
