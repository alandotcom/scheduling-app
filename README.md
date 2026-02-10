# Scheduling App

A multi-tenant appointment scheduling platform (Acuity-style) built with modern TypeScript tooling.

## Documentation

- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Event bus/workflow runtime RFC (accepted): [`docs/event-bus-workflow-runtime-rfc.md`](docs/event-bus-workflow-runtime-rfc.md)
- Integration authoring guide: [`integrations/README.md`](integrations/README.md)
- API docs (Scalar): [`http://localhost:3000/api/v1/docs`](http://localhost:3000/api/v1/docs)
- OpenAPI spec JSON: [`http://localhost:3000/api/v1/openapi.json`](http://localhost:3000/api/v1/openapi.json)

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

5. Bootstrap local database and workflow runtime tables:

   ```bash
   pnpm bootstrap:dev
   ```

   This command does not start Docker services; run `docker compose up -d` first.

6. Start development servers:

   ```bash
   pnpm dev
   ```

   - API: http://localhost:3000
   - Admin UI: http://localhost:5173
   - Workflow Worker health: http://127.0.0.1:3020/health
   - Bull Board: http://127.0.0.1:3010/

## Development

### Commands

```bash
# Development
pnpm dev              # Run API + admin UI + worker + workflow-worker + Bull Board in parallel
pnpm dev:api          # Run API only with hot reload
pnpm dev:worker       # Run worker only with hot reload
pnpm dev:workflow-worker # Run workflow runtime worker only
pnpm dev:admin        # Run admin UI only
pnpm dev:bull-board   # Run only Bull Board as a separate server
pnpm bootstrap:dev    # Push DB schema, seed data, and setup Workflow Postgres tables
pnpm --filter @scheduling/api run sync:svix-event-catalog  # Manual Svix event schema sync

# Testing
pnpm test             # Run all tests
pnpm --filter @scheduling/api run test           # Run API tests only
pnpm --filter @scheduling/db run test            # Run DB tests only

# Code Quality
pnpm lint             # Run oxlint
pnpm format           # Auto-format with Biome
pnpm build            # Build via Turborepo graph (dependency-aware + cached)
pnpm build:changed    # Build only changed packages since origin/main (+ dependents)
pnpm build:all        # Force full uncached build across all packages
pnpm typecheck        # Type-check via Turborepo graph (dependency-aware + cached)
pnpm typecheck:changed # Type-check only changed packages since origin/main (+ dependents)
pnpm typecheck:all    # Force full uncached type-check across all packages

# Database (from packages/db)
pnpm --filter @scheduling/db run generate   # Generate migration from schema changes
pnpm --filter @scheduling/db run migrate    # Run pending migrations
pnpm --filter @scheduling/db run push       # Push schema to dev database
```

### Build Usage (Turbo)

- Use `pnpm build` for normal local development and packaging.
- Use `pnpm build:all` for a clean full pass that bypasses cache.
- Use `pnpm build:changed` for focused local checks against `origin/main`.
- `admin-ui` build uses `vite build`; TypeScript validation is enforced via root `pnpm typecheck`.
- If `origin/main` is missing locally, run `git fetch origin main` before `pnpm build:changed`.

## Environment Variables

See [`.env.example`](.env.example) for the full list.

Commonly used variables:

| Variable               | Description                              | Default                                                      |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`         | Postgres connection string               | `postgres://scheduling:scheduling@localhost:5433/scheduling` |
| `DB_PUSH_DATABASE_URL` | Optional override for `bootstrap:dev` push/setup steps | `postgres://scheduling:scheduling@localhost:5433/scheduling` |
| `REDIS_URL`            | Redis/Valkey URL (overrides host/port)   | _(unset)_                                                    |
| `VALKEY_HOST`          | Valkey/Redis host                        | `localhost`                                                  |
| `VALKEY_PORT`          | Valkey/Redis port                        | `6380`                                                       |
| `AUTH_SECRET`          | BetterAuth secret (change in production) | `dev-secret-change-in-production`                            |
| `API_PORT`             | API server port alias for scripts         | `3000`                                                       |
| `PORT`                 | API server port                          | `3000`                                                       |
| `BULL_BOARD_HOST`      | Bull Board bind host                     | `127.0.0.1`                                                  |
| `BULL_BOARD_PORT`      | Bull Board server port                   | `3010`                                                       |
| `BULL_BOARD_BASE_PATH` | Bull Board UI base path                  | `/`                                                          |
| `WORKFLOW_WORKER_HOST` | Workflow worker bind host                | `127.0.0.1`                                                  |
| `WORKFLOW_WORKER_PORT` | Workflow worker port                     | `3020`                                                       |
| `WORKFLOW_TARGET_WORLD` | Workflow world target                   | `@workflow/world-postgres` (via workflow-worker scripts)    |
| `WORKFLOW_POSTGRES_URL` | Workflow Postgres world connection URL  | Falls back to `DB_PUSH_DATABASE_URL` in `bootstrap:dev` and `DATABASE_URL` in workflow-worker scripts |
| `INTEGRATIONS_ENABLED` | Comma-separated enabled integrations     | `svix`                                                       |
| `SVIX_WEBHOOKS_ENABLED` | Enable Svix API usage for `svix` integration | `false`                                                    |
| `SVIX_BASE_URL`        | Svix API base URL                        | _(unset)_                                                    |
| `SVIX_AUTH_TOKEN`      | Svix auth token for API access           | _(unset)_                                                    |
| `SVIX_JWT_SECRET`      | Svix server JWT secret (self-hosted only)| _(unset)_                                                    |

## License

Private - All rights reserved.
