# Scheduling App

A multi-tenant appointment scheduling platform (Acuity-style) built with modern TypeScript tooling.

## Architecture

```
apps/
  api/          → Hono backend with oRPC (UI) + OpenAPI (M2M), BetterAuth
  admin-ui/     → React 19 + TanStack Router/Query frontend
packages/
  db/           → Drizzle ORM schema + Bun SQL
  dto/          → Shared Zod schemas for validation
```

### Tech Stack

- **Runtime:** Bun
- **API:** Hono 4.x + oRPC (REST + OpenAPI)
- **Auth:** BetterAuth with Drizzle adapter, API keys for server-to-server access
- **Database:** Drizzle ORM + Bun SQL, Postgres 18 with native `uuidv7()`
- **Webhooks:** Svix (self-hosted via Docker Compose or hosted Svix Cloud)
- **Job Queue:** BullMQ with Valkey/Redis for outbox processing and webhook delivery
- **Testing:** Real Postgres via Docker
- **Linting:** oxlint (Rust-based, strict rules)

### Database Schema

Key entities:

- **Organizations (orgs):** Multi-tenant isolation via row-level security (RLS)
- **Users & Sessions:** BetterAuth-managed authentication
- **Locations:** Physical or virtual appointment locations with timezones
- **Calendars:** Schedulable calendars linked to locations
- **Appointment Types:** Service definitions with duration, padding, capacity
- **Resources:** Bookable resources (rooms, equipment) with quantity constraints
- **Availability Rules:** Weekly recurring hours per calendar
- **Availability Overrides:** Date-specific schedule changes
- **Blocked Time:** One-off or recurring blocked periods (RRULE support)
- **Appointments:** Bookings with status tracking and client info
- **Event Outbox:** Transactional outbox for reliable webhook delivery
- **API Keys:** Server-to-server authentication with scoped access
- **Audit Events:** Change history for compliance and debugging

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [pnpm](https://pnpm.io/) >= 8.0
- [Docker](https://www.docker.com/) (for Postgres and Valkey)

### Setup

1. Clone the repository:

   ```bash
   git clone <repo-url>
   cd scheduling-app
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Copy environment template:

   ```bash
   cp .env.example .env
   ```

4. Start infrastructure:

   ```bash
   docker compose up -d
   ```

5. Run database migrations:

   ```bash
   pnpm --filter @scheduling/db run migrate
   ```

6. Start development servers:

   ```bash
   pnpm dev
   ```

   - API: http://localhost:3000
   - Admin UI: http://localhost:5173
   - Bull Board: http://127.0.0.1:3010/

## Development

### Commands

```bash
# Development
pnpm dev              # Run API + admin UI + worker + Bull Board in parallel
pnpm dev:api          # Run API only with hot reload
pnpm dev:worker       # Run worker only with hot reload
pnpm dev:admin        # Run admin UI only
pnpm dev:bull-board   # Run only Bull Board as a separate server
pnpm --filter @scheduling/api run sync:svix-event-catalog  # Manual Svix event schema sync

# Testing
pnpm test             # Run all tests
pnpm --filter @scheduling/api run test           # Run API tests only
pnpm --filter @scheduling/db run test            # Run DB tests only

# Code Quality
pnpm lint             # Run oxlint
pnpm format           # Auto-format with Biome
pnpm typecheck        # Type-check all packages

# Database (from packages/db)
pnpm --filter @scheduling/db run generate   # Generate migration from schema changes
pnpm --filter @scheduling/db run migrate    # Run pending migrations
pnpm --filter @scheduling/db run push       # Push schema to dev database
```

### API Endpoints

The API exposes two transports:

| Transport    | Base Path    | Purpose              | Auth      |
| ------------ | ------------ | -------------------- | --------- |
| oRPC         | `/v1/*`      | Admin UI (type-safe) | Session   |
| OpenAPI/REST | `/api/v1/*`  | M2M integrations     | API Key   |

OpenAPI docs are available at `/api/v1/docs` (Scalar UI) and `/api/v1/openapi.json` (raw spec).

**UI Endpoints (`/v1/*`)** - Full admin features:

- `locations`, `calendars`, `resources`, `appointmentTypes`
- `availability` (rules, overrides, blocked time, scheduling limits, queries)
- `appointments`, `clients`
- `apiKeys`, `audit`, `webhooks` (admin only)

**API Endpoints (`/api/v1/*`)** - External integrations:

- `locations`, `calendars`, `resources`, `appointmentTypes`
- `appointments`, `clients`
- `webhooks`
- `availability` (query-only: dates, times, check)
- Excludes: `apiKeys`, `audit`, availability management

### Authentication

Two authentication methods are supported:

1. **Session Auth:** Cookie-based sessions via BetterAuth for browser clients
2. **API Key Auth:** Better Auth API keys for server-to-server integration

API keys are scoped (`owner`, `admin`, `member`) and are managed in Settings under API Access.

### Multi-tenancy

All org-scoped data is protected by PostgreSQL row-level security (RLS). Organization context comes from the active org session or API key metadata.

### Event System

Domain events are emitted on mutations:

- Written to `event_outbox` table for reliable delivery
- Claimed atomically (`pending -> processing`) before publish to prevent pre-commit delivery races
- Processed by BullMQ workers and published to Svix with idempotency key = event ID
- Audit events recorded for compliance tracking

### Webhooks (Svix)

- Webhook event payloads are strongly typed in `packages/dto/src/schemas/webhook.ts`.
- Svix event catalog schemas are synced idempotently (`create`, then `update` on conflict).
- Catalog sync runs automatically on API and worker startup.
- You can also run manual sync at any time:

  ```bash
  pnpm --filter @scheduling/api run sync:svix-event-catalog
  ```

- Admin webhook management in Settings uses `svix-react` hooks (OSS flow) with a short-lived session from `GET /v1/webhooks/session`.

## Environment Variables

| Variable               | Description                              | Default                                                      |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`         | Postgres connection string               | `postgres://scheduling:scheduling@localhost:5433/scheduling` |
| `REDIS_URL`            | Redis/Valkey URL (overrides host/port)   | _(unset)_                                                    |
| `VALKEY_HOST`          | Valkey/Redis host                        | `localhost`                                                  |
| `VALKEY_PORT`          | Valkey/Redis port                        | `6380`                                                       |
| `AUTH_SECRET`          | BetterAuth secret (change in production) | `dev-secret-change-in-production`                            |
| `PORT`                 | API server port                          | `3000`                                                       |
| `BULL_BOARD_HOST`      | Bull Board bind host                     | `127.0.0.1`                                                  |
| `BULL_BOARD_PORT`      | Bull Board server port                   | `3010`                                                       |
| `BULL_BOARD_BASE_PATH` | Bull Board UI base path                  | `/`                                                          |
| `SVIX_WEBHOOKS_ENABLED`| Enable Svix publishing + webhook features| `false`                                                      |
| `SVIX_BASE_URL`        | Svix API base URL                        | _(unset)_                                                    |
| `SVIX_AUTH_TOKEN`      | Svix auth token for API access           | _(unset)_                                                    |
| `SVIX_JWT_SECRET`      | Svix server JWT secret (self-hosted only)| _(unset)_                                                    |

## License

Private - All rights reserved.
