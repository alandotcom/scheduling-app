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
- Eventing + workflows: Inngest (self-hosted or dev server)
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

Inngest is the runtime for both domain-event fanout and journey workflow execution.

Domain events on mutations follow this path:

1. Domain mutation commits successfully.
2. API emits one typed Inngest event via `inngest.send`.
3. Inngest triggers matching functions (integration fanout, journey planning, etc.).
4. Integration handlers execute independently with function-level retries and observability.

Current integration registry:

- `svix` (`apps/api/src/services/integrations/svix.ts`)
- `logger` (`integrations/logger/src/index.ts`)

Integrations are enabled with `INTEGRATIONS_ENABLED`.

## Journey Delivery Pipeline

Journeys are the appointment-communication automation system. A journey defines a graph of actions (emails, SMS, Slack messages) triggered by appointment lifecycle events, with waits and conditions controlling timing and branching.

### Data Model

```
journeys                 → draft/published journey definitions
journey_versions         → immutable snapshots of published journey graphs
journey_runs             → one run per (journey_version, appointment, mode)
journey_deliveries       → individual planned/sent/canceled delivery actions
journey_run_step_logs    → per-node execution logs (timing, input/output, errors)
journey_run_events       → append-only audit trail of run lifecycle events
```

Key constraints:

- `journey_runs` has a unique index on `(org_id, journey_version_id, appointment_id, mode)` — one run per journey+appointment+mode
- `journey_deliveries.deterministic_key` is unique per org — prevents duplicate deliveries on retries/replans
- All tables are RLS-protected with `org_id`

### Trigger Events

Three appointment domain events can trigger journeys:

| Event | Routing |
|-------|---------|
| `appointment.scheduled` | Typically `start` |
| `appointment.rescheduled` | Typically `restart` (re-plans the graph) |
| `appointment.canceled` | Typically `stop` (cancels pending deliveries) |

Each journey's trigger config maps these events to routing decisions: `start`, `restart`, `stop`, or `ignore`. An optional filter (expression AST) can further gate whether the journey applies to a given appointment.

### End-to-End Flow

```
Appointment mutation
  → Domain event emitted via inngest.send()
  → Inngest function: journey-domain-trigger-{event-type}
  → processJourneyDomainEvent()
    → For each active published journey:
      1. Parse trigger config + graph from latest journey_version
      2. Resolve trigger routing (start/restart/stop/ignore)
      3. If stop: cancel all pending deliveries for this run
      4. If start/restart: apply optional trigger filter
      5. Find or create journey_run
      6. Walk the graph (buildDesiredDeliveries)
      7. Reconcile desired deliveries against existing ones
      8. Fire Inngest events for new/canceled deliveries
  → Inngest functions: provider-specific execute functions
    → Delivery worker sleeps until scheduledFor
    → Re-checks cancellation status (stale key, canceled run)
    → Dispatches through provider (Resend, Twilio, Slack, etc.)
```

### Graph Planning (`buildDesiredDeliveries`)

The planner walks the journey graph starting from the trigger node, advancing a time cursor through each node:

- **Trigger node**: sets the initial cursor from the event timestamp
- **Wait node**: resolves the wait duration/until to a target time
  - If the wait is in the future (`isWaiting`): emits a `wait_resume` delivery and **stops walking** (see Wait-Boundary Planning below)
  - If the wait has elapsed: advances the cursor and continues
- **Condition node**: evaluates the expression against appointment/client context and follows the matching branch (true/false)
- **Delivery action node** (send-resend, send-slack, send-twilio, logger): emits a `planned` delivery at the current cursor time
- **Unknown/unrecognized nodes**: skips to successors

Each delivery gets a deterministic key (`{runId}:{stepKey}:{scheduledFor}`) that enables idempotent reconciliation.

### Wait-Boundary Phase Planning

When the planner encounters an active wait (wait time is in the future), it does **not** continue walking past the wait. Instead:

1. The planner emits a `wait_resume` delivery (actionType `"wait_resume"`, channel `"internal"`) scheduled for the wait expiry time.
2. Successor nodes are not visited — no deliveries are planned downstream of the active wait.
3. When the `wait_resume` delivery fires after sleeping:
   - Fresh appointment and client data is fetched from the database
   - The planner resumes from the wait node's successors using the fresh data
   - New downstream deliveries are planned with up-to-date context

This ensures that conditions evaluated after a wait (e.g., "is the appointment still confirmed?") use current data rather than the stale trigger snapshot. Nodes before a wait execute immediately and correctly use the trigger snapshot since no time has elapsed.

**Sequential waits** produce one `wait_resume` at a time. A graph like `trigger → wait1 → wait2 → action` creates a single `wait_resume` at `wait1`. When that fires, fresh planning hits `wait2` and creates another `wait_resume` if it's still in the future.

**Cancellation** works unchanged because `cancelPendingDeliveries` cancels all `planned` deliveries for a run, including `wait_resume` entries.

**Rescheduling** works because `reconcileDeliveries` compares deterministic keys and cancels stale deliveries (including old `wait_resume` entries).

### Delivery Providers

Providers are registered in `delivery-provider-registry.ts`. Each provider defines:

| Field | Purpose |
|-------|---------|
| `key` | Unique provider name |
| `actionTypes` | Action types this provider handles |
| `channel` | Logical channel (email, sms, slack, internal) |
| `eventName` | Inngest event name for the execute function |
| `functionId` | Inngest function ID |
| `retries` | Inngest retry count |
| `maxDispatchAttempts` | Application-level retry count |
| `dispatch` | The actual dispatch function |

Current providers:

| Provider | Action Types | Channel | Event |
|----------|-------------|---------|-------|
| resend | `send-resend`, `send-resend-template` | email | `journey.action.send-resend.execute` |
| slack | `send-slack` | slack | `journey.action.send-slack.execute` |
| twilio | `send-twilio` | sms | `journey.action.send-twilio.execute` |
| logger | `logger` | logger | `journey.delivery.scheduled` |
| wait_resume | `wait_resume` | internal | `journey.wait-resume.execute` |

One Inngest function is auto-generated per provider from the `deliveryProviders` array. All share a common execution path through `executeJourneyDeliveryScheduled` which handles sleeping, cancellation checks, and dispatch — with a special intercept for `wait_resume` that calls `executeWaitResume()` instead of dispatching through a provider.

### Delivery Worker (`executeJourneyDeliveryScheduled`)

The delivery worker handles the full lifecycle of a single delivery:

1. **Load**: fetch delivery + run from DB
2. **Sleep**: wait until `scheduledFor` using Inngest `step.sleep()`
3. **Re-check**: reload delivery and verify it's still `planned` (not canceled during sleep)
4. **Cancellation checks**: stale deterministic key, inactive run, already-terminal status
5. **Intercept**: if `actionType === "wait_resume"`, call `executeWaitResume()` and finalize
6. **Dispatch**: call the provider's dispatch function with retry (via `es-toolkit/retry`)
7. **Finalize**: mark delivery as `sent` or `failed`, update step logs and run status

Inngest's `cancelOn` mechanism also allows deliveries to be canceled mid-sleep via a `journey.delivery.canceled` event.

### Reconciliation (`reconcileDeliveries`)

When a journey is re-planned (e.g., on `appointment.rescheduled`), the reconciler:

1. Writes all step logs and run events from the build phase
2. Lists existing deliveries for the run
3. Identifies stale `planned` deliveries whose deterministic keys are no longer in the desired set → cancels them
4. Inserts new deliveries that don't yet exist (matched by deterministic key)
5. Fires Inngest events for new schedules and cancellations

This makes re-planning idempotent — duplicate events produce the same deterministic keys and skip insertion.

### Run Status Lifecycle

`journey_runs.status` transitions:

```
planned → running → completed
planned → canceled
running → completed
running → failed
running → canceled
```

Status is derived from delivery statuses:
- Any `planned` deliveries → `planned` or `running` (if any terminal deliveries also exist)
- Any `failed` → `failed`
- All `canceled` → `canceled`
- No deliveries or all terminal non-failed → `completed`

### Key Files

| File | Purpose |
|------|---------|
| `apps/api/src/services/journey-planner.ts` | Graph planning, reconciliation, wait_resume execution |
| `apps/api/src/services/journey-delivery-worker.ts` | Delivery execution (sleep, cancel-check, dispatch) |
| `apps/api/src/services/delivery-provider-registry.ts` | Provider registration and dispatch routing |
| `apps/api/src/services/journey-template-context.ts` | Fresh data loading for template rendering and wait resume |
| `apps/api/src/services/journey-condition-evaluator.ts` | Condition expression evaluation |
| `apps/api/src/services/journey-trigger-filters.ts` | Trigger filter evaluation |
| `apps/api/src/services/journey-run-artifacts.ts` | Step log and run event persistence |
| `apps/api/src/services/journey-run-status.ts` | Run status derivation from delivery statuses |
| `apps/api/src/inngest/functions/journey-domain-triggers.ts` | Inngest functions that receive domain events |
| `apps/api/src/inngest/functions/journey-action-send-provider-execute.ts` | Auto-generated Inngest functions per provider |
| `apps/api/src/inngest/runtime-events.ts` | Typed Inngest event senders |
| `apps/api/src/inngest/client.ts` | Inngest client with event type definitions |

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
- Workflow engine guide: [`./guides/workflow-engine-domain-events.md`](./guides/workflow-engine-domain-events.md)
- Workflow lifecycle guide: [`./guides/workflow-execution-lifecycle.md`](./guides/workflow-execution-lifecycle.md)
- Implementation plans index: [`./plans/README.md`](./plans/README.md)
- Integration authoring: [`../integrations/README.md`](../integrations/README.md)
- Root setup/commands: [`../README.md`](../README.md)
- Workflow runtime plan: [`../PLAN.md`](../PLAN.md)
