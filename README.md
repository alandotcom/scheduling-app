# Scheduling App

A multi-tenant appointment scheduling platform (Acuity-style) built with modern TypeScript tooling.

## Architecture

```
apps/
  api/          → Hono + oRPC backend, BetterAuth for sessions
  admin-ui/     → React 19 + TanStack Router/Query frontend
packages/
  db/           → Drizzle ORM schema + Bun SQL
  dto/          → Shared Zod schemas for validation
```

### Tech Stack

- **Runtime:** Bun
- **API:** Hono 4.x + oRPC (REST + OpenAPI)
- **Auth:** BetterAuth with Drizzle adapter, API tokens for server-to-server access
- **Database:** Drizzle ORM + Bun SQL, Postgres 18 with native `uuidv7()`
- **Job Queue:** BullMQ with Valkey/Redis for webhook delivery and event processing
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
- **API Tokens:** Server-to-server authentication with scoped access
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

## Development

### Commands

```bash
# Development
pnpm dev              # Run all apps in parallel (API + admin UI)
pnpm dev:api          # Run API only with hot reload
pnpm dev:admin        # Run admin UI only

# Testing
pnpm test             # Run all tests
pnpm --filter @scheduling/api run test           # Run API tests only
pnpm --filter @scheduling/db run test            # Run DB tests only

# Code Quality
pnpm lint             # Run oxlint
pnpm format           # Auto-format with oxfmt
pnpm typecheck        # Type-check all packages

# Database (from packages/db)
pnpm --filter @scheduling/db run generate   # Generate migration from schema changes
pnpm --filter @scheduling/db run migrate    # Run pending migrations
pnpm --filter @scheduling/db run push       # Push schema to dev database
```

### Task Tracking with Beads

This project uses [Beads](https://github.com/steveyegge/beads) for task tracking during development.

```bash
# View available tasks
bd ready              # Show unblocked tasks ready for work
bd list               # Show all tasks
bd show <id>          # Get task details

# Work on tasks
bd close <id>         # Mark task complete
bd create "Title" --description "Details"  # Create new task
bd dep add <id> <blocker-id>               # Add dependency
```

**Execution loop** (for automated task processing):

```bash
while bd ready | grep -q "scheduling-app-"; do
  claude "@PROMPT.md"
done
```

### API Endpoints

The API uses oRPC with automatic OpenAPI generation. Key endpoint groups:

| Group                  | Description                              |
| ---------------------- | ---------------------------------------- |
| `/v1/health`           | Health check                             |
| `/v1/locations`        | Location CRUD                            |
| `/v1/calendars`        | Calendar CRUD with availability rules    |
| `/v1/resources`        | Resource CRUD                            |
| `/v1/appointmentTypes` | Appointment type CRUD                    |
| `/v1/availability`     | Availability queries (dates/times/check) |
| `/v1/appointments`     | Appointment booking, reschedule, cancel  |
| `/v1/apiTokens`        | API token management (admin only)        |
| `/v1/audit`            | Audit log queries (admin only)           |

### Authentication

Two authentication methods are supported:

1. **Session Auth:** Cookie-based sessions via BetterAuth for browser clients
2. **API Token Auth:** Bearer tokens for server-to-server integration

API tokens are scoped (`admin` or `staff`) and include rate limiting.

### Multi-tenancy

All org-scoped data is protected by PostgreSQL row-level security (RLS). The `X-Org-Id` header specifies the organization context for authenticated requests.

### Event System

Domain events are emitted on mutations:

- Written to `event_outbox` table for reliable delivery
- Processed by BullMQ workers for webhook delivery
- Audit events recorded for compliance tracking

## Environment Variables

| Variable       | Description                              | Default                                                      |
| -------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `DATABASE_URL` | Postgres connection string               | `postgres://scheduling:scheduling@localhost:5433/scheduling` |
| `VALKEY_HOST`  | Valkey/Redis host                        | `localhost`                                                  |
| `VALKEY_PORT`  | Valkey/Redis port                        | `6380`                                                       |
| `AUTH_SECRET`  | BetterAuth secret (change in production) | `dev-secret-change-in-production`                            |
| `PORT`         | API server port                          | `3000`                                                       |

## License

Private - All rights reserved.
