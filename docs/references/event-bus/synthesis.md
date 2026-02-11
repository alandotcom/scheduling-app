# Eventing + Workflow Synthesis (Inngest-First)

Status: Aligned with `docs/plans/workflow-runtime-rfc.md`
Last Updated: 2026-02-11
Owners: Product, `@scheduling/api`, `@scheduling/db`, `@scheduling/admin-ui`

## 1. Purpose

This document is a concise alignment summary of the canonical implementation plan in `docs/plans/workflow-runtime-rfc.md`.

## 2. Final Direction

1. Replace outbox + BullMQ + Workflow DevKit with self-hosted Inngest.
2. Use Inngest events/functions for both integration fanout and workflow execution.
3. Use Workflow Kit for workflow authoring UI and backend execution model.
4. Store Workflow Kit JSON as canonical workflow definition data.
5. Perform a big-bang cutover and remove `event_outbox`.

## 3. Runtime Planes

1. Event plane: domain mutations -> `inngest.send`.
2. Integration plane: Inngest-triggered integration handlers (Svix, logger, future providers).
3. Definition plane: workflow definitions/versions/bindings in Postgres.
4. Execution plane: Inngest function runs with `cancelOn`, waits, retries, and flow control.
5. UI plane: admin workflow editor via `@inngest/workflow-kit/ui`.

## 4. Critical Semantics

1. Appointment mutation events cancel active runs.
2. Cancelled runs are replaced immediately with new revision runs based on latest state.
3. `step.waitForEvent` timeout paths are explicit (`null` branch handling).
4. Side effects stay idempotent with deterministic delivery keys.

## 5. What Is Superseded

The following previous direction is superseded for implementation:

1. Keeping BullMQ as event bus runtime.
2. Keeping `event_outbox` as canonical domain event log.
3. Running Workflow DevKit as dedicated workflow runtime worker.
4. Building a custom React Flow compiler-first workflow authoring model.

## 6. References

1. Canonical RFC: `docs/plans/workflow-runtime-rfc.md`
2. Testing strategy: `docs/references/event-bus/testing.md`
3. Inngest/Workflow Kit research: `docs/references/event-bus/workflow-devkit-research.md`
