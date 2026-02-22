# Journey Engine (Domain Events)

This app runs journey triggers from canonical domain events.

## Trigger Ingress Model

- Canonical event schema source: `packages/dto/src/schemas/domain-event.ts`
- Event producer path: API services emit typed events with `sendDomainEvent` in `apps/api/src/inngest/client.ts`
- Journey trigger consumer path: `apps/api/src/inngest/functions/journey-domain-triggers.ts`
- Trigger routing engine: `apps/api/src/services/journey-trigger-engines.ts`

## Supported Journey Trigger Types

### AppointmentJourney

Schema: `packages/dto/src/schemas/workflow-graph.ts`

- `triggerType: "AppointmentJourney"`
- `start: "appointment.scheduled"`
- `restart: "appointment.rescheduled"`
- `stop: "appointment.canceled"`
- `correlationKey: "appointmentId"`
- optional `filter`

Routing behavior:

- `start`/`restart` routes to planning
- `stop` routes to cancellation
- unrelated events are ignored

### ClientJourney

Schema: `packages/dto/src/schemas/workflow-graph.ts`

- `triggerType: "ClientJourney"`
- `event: "client.created" | "client.updated"`
- `correlationKey: "clientId"`
- optional `trackedAttributeKey`
- optional `filter`

Validation behavior:

- `client.updated` requires `trackedAttributeKey`
- `client.created` must not include `trackedAttributeKey`

Routing behavior:

- `client.created` routes to planning only on `client.created`
- `client.updated` routes to planning only when the tracked attribute value changed

## Journey Trigger Event Coverage

Journey trigger functions are registered for:

- `appointment.scheduled`
- `appointment.confirmed`
- `appointment.rescheduled`
- `appointment.canceled`
- `client.created`
- `client.updated`

Source: `apps/api/src/inngest/functions/journey-domain-triggers.ts`

## Authorization and Org Isolation

Routes: `apps/api/src/routes/journeys.ts`

Read operations are authenticated org-member access:

- list/get journeys
- list/get runs

Write operations are admin-only:

- create/update/publish/pause/resume/set mode/delete journeys
- start test run
- cancel run(s)

All journey tables are org-scoped with RLS (`org_id`) in `packages/db/src/schema/index.ts`.

## Idempotency and Dedupe

- Domain-event dedupe uses canonical `event.id` in Inngest event ids.
- Run identity is unique by `(org_id, journey_version_id, trigger_entity_type, trigger_entity_id, mode)`.
- Delivery dedupe is unique by `(org_id, deterministic_key)`.

## Runtime Artifacts

Journey runtime persistence is split across:

- `journeys`
- `journey_versions`
- `journey_runs`
- `journey_deliveries`
- `journey_run_events`
- `journey_run_step_logs`

## Manual Smoke Validation

From repo root:

```bash
pnpm dev
pnpm dev:inngest
```

Smoke flow:

1. Login as admin (`admin@example.com` / `password123`).
2. Open `/workflows` and create/open a journey.
3. Configure either `AppointmentJourney` or `ClientJourney` trigger.
4. Save, publish, then emit a matching domain event through normal API mutations.
5. Open the runs panel and verify run status, run events, step logs, and deliveries.
6. Login as a member and confirm read-only behavior for journey mutations.

## Regression Validation Commands

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

## Related

- Execution lifecycle contract: [`./journey-execution-lifecycle.md`](./journey-execution-lifecycle.md)
- Architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
