# Event Bus + Workflow Runtime Synthesis (Unified)

Status: Aligned with `docs/plans/workflow-runtime-rfc.md`  
Last Updated: 2026-02-11  
Owners: Product, `@scheduling/api`, `@scheduling/db`, `@scheduling/admin-ui`

## 1. Purpose

This synthesis captures the final architecture direction from event bus and workflow runtime research and resolves previous conflicting recommendations in this folder.

Canonical source of truth: `docs/plans/workflow-runtime-rfc.md`.

## 2. Final Direction

1. Keep BullMQ/Valkey as the event bus runtime in this phase.
2. Add generalized workflow execution backed by Workflow DevKit.
3. Build workflow authoring as an admin UI utility (React Flow style), not as hardcoded backend-only logic.
4. Use immutable workflow versions with publish-time validation/compilation.
5. Apply strict cancellation semantics for appointment lifecycle changes:
   - Appointment event triggers a run.
   - Mutation events cancel the active run.
   - Replacement run is started from latest appointment state.

## 3. What This Enables

Example supported lifecycle:

1. Appointment created.
2. Send confirmation email now.
3. Wait 3 days, send follow-up update.
4. Wait until 1 hour before appointment, send SMS reminder.
5. If appointment is changed/cancelled during the sequence, cancel active run and replace with a new run revision.

This is the baseline behavior for generalized appointment automation.

## 4. Runtime Planes

1. Event plane (existing): domain mutations -> `event_outbox` -> BullMQ fanout workers.
2. Definition plane (new): workflow definitions, versions, bindings.
3. Execution plane (new): trigger consumer, cancel/replace consumer, Workflow DevKit run/step handlers.
4. UI plane (new): builder and run views in admin UI workflow routes.

## 5. Identity, Cancellation, and Dedupe

1. Baseline active run key: `(org_id, workflow_type, appointment_id)`.
2. Cancellation guarantee: strict.
3. Replacement rule: cancel existing revision, start a new revision immediately.
4. Delivery idempotency key specificity baseline:
   - `org + workflow + appointment + run_revision + step + channel`.
5. Effects are deduped via unique `workflow_delivery_log.delivery_key`.

## 6. Product Decisions State

Still pending in RFC:

1. Initial provider rollout sequence for send actions.
2. Default template library and required variables for v1.
3. Consent policy specifics before enabling SMS per org.

## 7. Superseded Guidance

Some research notes in this folder were written while evaluating migration to `pg-boss`.

For implementation decisions in this phase, treat those migration recommendations as superseded by the unified RFC direction above. Keep them as historical evaluation context only.

## 8. References

1. `docs/plans/workflow-runtime-rfc.md`
2. `docs/ARCHITECTURE.md`
3. `docs/references/event-bus/workflow-devkit-research.md`
4. `docs/references/event-bus/testing.md`
