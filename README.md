# Scheduling App

A multi-tenant appointment scheduling platform (Acuity-style) built with modern TypeScript tooling.

## Documentation

- Implementation plans index: [`docs/plans/README.md`](docs/plans/README.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Workflow engine guide: [`docs/guides/workflow-engine-domain-events.md`](docs/guides/workflow-engine-domain-events.md)
- Event bus/workflow runtime RFC (accepted): [`docs/plans/workflow-runtime-rfc.md`](docs/plans/workflow-runtime-rfc.md)
- Integration authoring guide: [`integrations/README.md`](integrations/README.md)
- API docs (Scalar): [`http://localhost:3000/api/v1/docs`](http://localhost:3000/api/v1/docs)
- OpenAPI spec JSON: [`http://localhost:3000/api/v1/openapi.json`](http://localhost:3000/api/v1/openapi.json)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [pnpm](https://pnpm.io/) >= 8.0
- [Docker](https://www.docker.com/) (for Postgres and optional local Svix)

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

5. Bootstrap local database and seed demo data:

   ```bash
   pnpm bootstrap:dev
   ```

   This command does not start Docker services; run `docker compose up -d` first.

6. Start development servers:

   ```bash
   pnpm dev
   ```

   In a separate terminal, start the Inngest Dev Server:

   ```bash
   pnpm dev:inngest
   ```

   - API: http://localhost:3000
   - Admin UI: http://localhost:5173
   - Inngest Dev Server UI: http://localhost:8288

## Development

### Commands

```bash
# Development
pnpm dev              # Run API + admin UI in parallel
pnpm dev:inngest      # Run Inngest Dev Server and sync with /api/inngest
pnpm dev:api          # Run API only with hot reload
pnpm dev:admin        # Run admin UI only
pnpm bootstrap:dev    # Push DB schema and seed demo data
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
| `AUTH_SECRET`          | BetterAuth secret (change in production) | `dev-secret-change-in-production`                            |
| `API_PORT`             | API server port alias for scripts         | `3000`                                                       |
| `PORT`                 | API server port                          | `3000`                                                       |
| `INNGEST_BASE_URL`     | Inngest runtime base URL                  | `http://127.0.0.1:8288` in non-production; _(unset)_ in production |
| `INNGEST_EVENT_KEY`    | Inngest event key                         | `dev` in non-production; _(unset)_ in production            |
| `INNGEST_SIGNING_KEY`  | Inngest signing key                       | _(unset)_                                                    |
| `INNGEST_SERVE_PATH`   | Inngest serve endpoint path               | `/api/inngest`                                               |
| `INNGEST_SERVE_HOST`   | Explicit host for Inngest serve endpoint  | _(unset)_                                                    |
| `INTEGRATIONS_ENABLED` | Comma-separated enabled integrations     | `svix`                                                       |
| `INTEGRATIONS_ENCRYPTION_KEY` | Encrypts integration secrets (API keys/OAuth tokens) | _(unset)_                                       |
| `INTEGRATIONS_OAUTH_STATE_SIGNING_KEY` | Signs OAuth state for org-level integrations | _(unset)_                                      |
| `INTEGRATIONS_SLACK_CLIENT_ID` | Slack OAuth app client ID          | _(unset)_                                                    |
| `INTEGRATIONS_SLACK_CLIENT_SECRET` | Slack OAuth app client secret  | _(unset)_                                                    |
| `INTEGRATIONS_SLACK_REDIRECT_URI` | Slack OAuth callback URL        | _(unset)_                                                    |
| `INTEGRATIONS_SLACK_SCOPES` | Slack bot scopes for OAuth installs   | `chat:write`                                                 |
| `SVIX_WEBHOOKS_ENABLED` | Enable Svix API usage for `svix` integration | `false`                                                    |
| `SVIX_BASE_URL`        | Svix API base URL                        | _(unset)_                                                    |
| `SVIX_AUTH_TOKEN`      | Svix auth token for API access           | _(unset)_                                                    |
| `SVIX_JWT_SECRET`      | Svix server JWT secret (self-hosted only)| _(unset)_                                                    |

### Org-Level OAuth Integrations

The app supports org-scoped OAuth integrations in Settings > Integrations.

- Slack is implemented as the first OAuth provider.
- OAuth credentials are stored per-org in the `integrations` table, with secrets encrypted using `INTEGRATIONS_ENCRYPTION_KEY`.
- OAuth connect flow uses signed state tokens via `INTEGRATIONS_OAUTH_STATE_SIGNING_KEY`.
- OAuth routes:
  - `GET /api/integrations/oauth/:provider/start`
  - `GET /api/integrations/oauth/:provider/callback`

## License

Private - All rights reserved.
