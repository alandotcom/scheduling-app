# Scheduling App

A multi-tenant appointment scheduling platform (Acuity-style) built with modern TypeScript tooling.

## Documentation

- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Integration authoring guide: [`integrations/README.md`](integrations/README.md)

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

## Environment Variables

See [`.env.example`](.env.example) for the full list.

Commonly used variables:

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
| `INTEGRATIONS_ENABLED` | Comma-separated enabled integrations     | `svix`                                                       |
| `SVIX_WEBHOOKS_ENABLED` | Enable Svix API usage for `svix` integration | `false`                                                    |
| `SVIX_BASE_URL`        | Svix API base URL                        | _(unset)_                                                    |
| `SVIX_AUTH_TOKEN`      | Svix auth token for API access           | _(unset)_                                                    |
| `SVIX_JWT_SECRET`      | Svix server JWT secret (self-hosted only)| _(unset)_                                                    |

## License

Private - All rights reserved.
