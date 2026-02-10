# Architecture

## Repository Layout

```text
apps/
  api/          → Hono backend with oRPC (UI) + OpenAPI (M2M), BetterAuth
  admin-ui/     → React 19 + TanStack Router/Query frontend
integrations/
  core/         → Shared integration interfaces and event types
  logger/       → Example integration consumer (console logging)
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
- Event integrations: BullMQ + Valkey fanout to per-integration queues (`svix`, `logger`, future email/sms/internal)
- Testing: Real Postgres via Docker
- Linting: oxlint (Rust-based, strict rules)

## Database Model

Key entities:

- Organizations (`orgs`): tenant boundary with RLS
- Users and sessions: BetterAuth-managed auth/session state
- Locations: physical or virtual appointment locations
- Calendars: schedulable calendars linked to locations
- Appointment types: duration, padding, capacity
- Resources: bookable resources with quantity constraints
- Availability rules and overrides
- Blocked time entries (including RRULE)
- Appointments and client records
- Event outbox (`event_outbox`) for durable event dispatch
- API keys for M2M auth
- Audit events for mutation history

## API Shape

Two transports:

| Transport    | Base Path    | Purpose              | Auth      |
| ------------ | ------------ | -------------------- | --------- |
| oRPC         | `/v1/*`      | Admin UI (type-safe) | Session   |
| OpenAPI/REST | `/api/v1/*`  | M2M integrations     | API Key   |

OpenAPI docs:

- `/api/v1/docs` (Scalar UI)
- `/api/v1/openapi.json` (raw spec)

## Multi-Tenancy

All org-scoped data uses PostgreSQL row-level security. Organization context is derived from active org session or API key metadata and applied before data access.

## Event and Integration System

> Superseded direction: see [`event-bus-workflow-runtime-rfc.md`](./event-bus-workflow-runtime-rfc.md) for the accepted migration from BullMQ/Valkey to pg-boss + Workflow DevKit orchestration.

Domain events on mutations follow this path:

1. Write durable row to `event_outbox`.
2. Dispatch worker claims row atomically (`pending -> processing`).
3. Dispatcher creates BullMQ Flow fanout.
4. One child job is enqueued per enabled integration queue.
5. Integration workers consume independently with isolated retry/backoff.

Current integration registry:

- `svix` (`apps/api/src/services/integrations/svix.ts`)
- `logger` (`integrations/logger/src/index.ts`)

Integrations are enabled with `INTEGRATIONS_ENABLED`.

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

- Integration authoring: [`../integrations/README.md`](../integrations/README.md)
- Root setup/commands: [`../README.md`](../README.md)
- Event bus/workflow runtime RFC: [`./event-bus-workflow-runtime-rfc.md`](./event-bus-workflow-runtime-rfc.md)
