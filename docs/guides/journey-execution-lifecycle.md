# Journey Execution Lifecycle

This guide defines the runtime contract for journey execution state, run events, and cancellation semantics.

## Runtime Artifacts

Journey execution state is split across these tables:

- `journey_runs`
- `journey_deliveries`
- `journey_run_step_logs`
- `journey_run_events`

Schema source: `packages/db/src/schema/index.ts`

## Run Identity and Correlation

Runs are correlated by trigger entity and mode:

- `trigger_entity_type`: `appointment` or `client`
- `trigger_entity_id`: source entity id
- `mode`: `live` or `test`

Uniqueness is enforced by:

- `(org_id, journey_version_id, trigger_entity_type, trigger_entity_id, mode)`

## Run Status Lifecycle

Defined statuses (`packages/dto/src/schemas/journey.ts`):

- `planned`
- `running`
- `completed`
- `canceled`
- `failed`

Status derivation (`apps/api/src/services/journey-run-status.ts`):

- No deliveries -> `completed`
- Any failed delivery -> `failed`
- Any planned delivery + no terminal deliveries -> `planned`
- Any planned delivery + any terminal delivery -> `running`
- All deliveries canceled -> `canceled`
- Otherwise terminal non-failed -> `completed`

## Delivery and Step Statuses

Delivery statuses:

- `planned`
- `sent`
- `failed`
- `canceled`
- `skipped`

Step log statuses:

- `pending`
- `running`
- `success`
- `error`
- `cancelled`

Source: `packages/dto/src/schemas/journey.ts`

## Run Event Vocabulary

`journey_run_events.event_type` is string-based and append-only. Common runtime values include:

- `run_started`
- `run_planned`
- `run_waiting`
- `run_waiting_confirmation`
- `run_resumed_confirmation`
- `run_canceled`
- `delivery_planned`
- `delivery_skipped`
- `delivery_dispatch_started`
- `delivery_provider_accepted`
- `delivery_canceled`

Primary emit paths:

- planner: `apps/api/src/services/journey-planner.ts`
- delivery worker: `apps/api/src/services/journey-delivery-worker.ts`

## Wait Semantics

Two internal wait mechanisms exist:

- `wait-resume`
  - emitted when a `wait` node is still in the future
  - resumes planning from the wait boundary with fresh context
- `wait-for-confirmation-timeout`
  - emitted by `wait-for-confirmation` nodes
  - executes timeout logic and may cancel run paths

Both are internal delivery action types handled by worker intercepts in `apps/api/src/services/journey-delivery-worker.ts`.

## Cancellation Semantics

Admin cancellation endpoints:

- `POST /journeys/runs/{runId}/cancel`
- `POST /journeys/{id}/runs/cancel`

Route source: `apps/api/src/routes/journeys.ts`

Runtime cancellation behavior:

- Planned deliveries are canceled and marked with reason codes.
- Worker re-checks cancellation before dispatch.
- Inngest `journey.delivery.canceled` allows sleep-time cancellation unblocking.

## Retry and Replay Boundaries

- Inngest domain trigger functions are retried (`retries: 3`).
- Delivery execution retries are provider-specific (`apps/api/src/services/delivery-provider-registry.ts`).
- Delivery creation/reconciliation is idempotent via deterministic keys.

## Related

- Domain trigger guide: [`./journey-engine-domain-events.md`](./journey-engine-domain-events.md)
- Architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
