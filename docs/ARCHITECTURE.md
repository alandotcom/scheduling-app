# Architecture

## Repository Layout

```text
apps/
  api/          → Hono backend with oRPC (UI) + OpenAPI (M2M), BetterAuth
  admin-ui/     → React 19 + TanStack Router/Query frontend
packages/
  db/           → Drizzle ORM schema + Bun SQL
  dto/          → Shared Zod schemas for validation
```

## Tech Stack

- Runtime: Bun
- API: Hono 4.x + oRPC (REST + OpenAPI)
- Auth: BetterAuth with Drizzle adapter, API keys for server-to-server access
- Database: Drizzle ORM + Bun SQL, Postgres 18 with native `uuidv7()`
- Webhooks: Svix (self-hosted via Docker Compose or hosted Svix Cloud)
- Eventing + workflow runtime: Inngest
- Testing: Real Postgres via Docker
- Linting: oxlint (Rust-based, strict rules)

## API Shape

Two transports:

| Transport | Base Path | Purpose | Auth |
| --- | --- | --- | --- |
| oRPC | `/v1/*` | Admin UI (type-safe) | Session |
| OpenAPI/REST | `/api/v1/*` | M2M integrations | API Key |

OpenAPI docs:

- `/api/v1/docs` (Scalar UI)
- `/api/v1/openapi.json` (raw spec)

## Multi-Tenancy

All org-scoped data uses PostgreSQL RLS. Organization context is derived from active org session or API key metadata and applied before data access.

## Event and Integration System

Inngest is the runtime for domain-event fanout and journey execution.

Domain events on mutations follow this path:

1. Domain mutation commits.
2. API emits one typed Inngest event.
3. Inngest triggers matching functions (integration fanout, journey planning, and provider execution).
4. Handlers execute independently with function-level retry and observability.

Integration consumers:

- System integration: `svix` (`apps/api/src/services/integrations/svix.ts`)
- App-managed consumer: `logger` (`apps/api/src/services/integrations/logger.ts`)

System integrations are enabled by `INTEGRATIONS_ENABLED`. Org-managed integration enablement is resolved at runtime from `integrations` table state.

## Journey Runtime

Journeys are graph-based automations for appointment/client lifecycle events. Graphs can include waits, wait-for-confirmation, conditions, and delivery actions.

### Data Model

```text
journeys              → draft/published/paused journey definitions
journey_versions      → immutable snapshots of published journey graphs
journey_runs          → one run per (journey_version, trigger entity, mode)
journey_deliveries    → planned/sent/failed/canceled/skipped delivery actions
journey_run_step_logs → per-step execution logs
journey_run_events    → append-only run lifecycle events
```

Key constraints:

- `journey_runs` unique key: `(org_id, journey_version_id, trigger_entity_type, trigger_entity_id, mode)`
- `journey_deliveries` unique key: `(org_id, deterministic_key)`
- All runtime tables are RLS-protected with `org_id`

### Trigger Types

Trigger config schema lives in `packages/dto/src/schemas/workflow-graph.ts`.

#### AppointmentJourney

- `start`: `appointment.scheduled`
- `restart`: `appointment.rescheduled`
- `stop`: `appointment.canceled`
- correlation key: `appointmentId`

#### ClientJourney

- `event`: `client.created` or `client.updated`
- correlation key: `clientId`
- `client.updated` requires `trackedAttributeKey`

### Trigger Event Coverage

Journey trigger functions are registered for:

- `appointment.scheduled`
- `appointment.confirmed`
- `appointment.rescheduled`
- `appointment.canceled`
- `client.created`
- `client.updated`

Source: `apps/api/src/inngest/functions/journey-domain-triggers.ts`

### End-to-End Flow

The engine is split into a dispatcher and a per-run Inngest function. See
`docs/guides/journey-execution-lifecycle.md` for the full runtime contract.

```text
Domain mutation
  → Domain event emitted to Inngest
  → journey-domain-trigger-{event-type}
  → processJourneyDomainEvent()  (dispatcher)
    → For each matching published journey:
      1. Parse trigger config + latest pinned graph snapshot
      2. Resolve routing (plan/cancel/ignore)
      3. start/restart → create a planned journey_run + emit journey.run.start
         stop/no_show  → cancel active run(s) (+ start terminal branch if any)
  → journey-run function (one per run)
    → walk the pinned graph, one durable primitive per node:
        step.run (exactly-once sends) · step.sleepUntil (waits)
        step.waitForEvent (confirmation) · cancelOn (cancellation)
    → project step logs / run events / delivery rows for the overlay
```

### Per-node primitives and waits

A `wait` node maps to `step.sleepUntil`; `wait-for-confirmation` maps to
`step.waitForEvent("appointment.confirmed", { timeout })`. There are no internal
wait-resume / wait-for-confirmation-timeout deliveries — Inngest's durable sleep
and wait-for-event replace them. A trigger/condition branch may fan out to
multiple nodes that all run (parallel via `Promise.all`).

### Delivery Providers

Providers are registered in `apps/api/src/services/delivery-provider-registry.ts`
and dispatched by the run function's send step via `dispatchForActionType`.

| Provider | Action Types | Channel |
| --- | --- | --- |
| resend | `send-resend`, `send-resend-template` | email |
| slack | `send-slack` | slack |
| twilio | `send-twilio` | sms |
| logger | `logger` | logger |

Twilio is async: the send is accepted, the row stays `planned`, and the status
callback finalizes it (`integrations/twilio/callbacks.ts`).

### Run Status Lifecycle

`journey_runs.status` values: `planned`, `running`, `completed`, `canceled`,
`failed`. The run function owns status directly (`planned → running →
completed/failed`); the dispatcher's cancellation projection sets `canceled`;
the function's `onFailure` records `failed` after retries are exhausted. Status
is never inferred from delivery rows.

### Key Files

| File | Purpose |
| --- | --- |
| `apps/api/src/services/journey-planner.ts` | Dispatcher: trigger routing, run identity, emits journey.run.start |
| `apps/api/src/services/journey-run-executor.ts` | The run walk over the pinned graph (durable primitives + projection) |
| `apps/api/src/services/journey-graph-walk.ts` | Pure graph-walk helpers shared by both halves |
| `apps/api/src/services/journey-trigger-engines.ts` | Appointment/client trigger routing and identity resolution |
| `apps/api/src/services/delivery-provider-registry.ts` | Provider registration and action-type dispatch |
| `apps/api/src/services/journey-template-context.ts` | Context hydration for branch evaluation/template rendering |
| `apps/api/src/services/journey-condition-evaluator.ts` | Condition expression evaluation |
| `apps/api/src/services/journey-trigger-filters.ts` | Trigger-level filter evaluation |
| `apps/api/src/services/journey-run-artifacts.ts` | Run-event append and step-log upsert |
| `apps/api/src/inngest/functions/journey-domain-triggers.ts` | Domain-event trigger functions (dispatcher entry) |
| `apps/api/src/inngest/functions/journey-run.ts` | The journey-run Inngest function (durable runtime wiring) |
| `apps/api/src/inngest/runtime-events.ts` | Runtime Inngest event senders |
| `apps/api/src/inngest/client.ts` | Typed Inngest client and internal event definitions |

## Webhook Delivery (Svix)

- Event payload schemas: `packages/dto/src/schemas/webhook.ts`
- Delivery adapter: `apps/api/src/services/integrations/svix.ts`
- Event catalog sync: `apps/api/src/services/svix-event-catalog.ts`
- Sync behavior: idempotent create-or-update
- Manual sync command:

```bash
pnpm --filter @scheduling/api run sync:svix-event-catalog
```

## Related Docs

- Docs index: [`./README.md`](./README.md)
- Journey engine guide: [`./guides/journey-engine-domain-events.md`](./guides/journey-engine-domain-events.md)
- Journey lifecycle guide: [`./guides/journey-execution-lifecycle.md`](./guides/journey-execution-lifecycle.md)
- UI guide: [`./guides/mobile-first-container-pattern.md`](./guides/mobile-first-container-pattern.md)
- Implementation plans index: [`./plans/README.md`](./plans/README.md)
- Root setup/commands: [`../README.md`](../README.md)
