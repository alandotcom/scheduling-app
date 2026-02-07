# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

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
pnpm format           # Auto-format with Biome (spaces, no tabs)
pnpm typecheck        # Type-check all packages

# After updating code
pnpm format           # Always run formatting after code changes

# Database (from packages/db)
pnpm --filter @scheduling/db run generate   # Generate migration from schema changes
pnpm --filter @scheduling/db run migrate    # Run pending migrations
pnpm --filter @scheduling/db run push       # Push schema to dev database
```

## Starting Dev Servers

**IMPORTANT:** Before starting a dev server, ALWAYS check if one is already running:

```bash
# Check for running Vite (admin-ui) or Bun (api) processes
ps aux | grep -E "(vite|bun.*src/index)" | grep -v grep

# If stale processes exist, kill them first
kill <pid>   # or: pkill -f "vite.*admin-ui"
```

Multiple dev server instances cause race conditions (e.g., TanStack Router's `routeTree.gen.ts` gets corrupted when multiple Vite instances try to regenerate it simultaneously).

## Architecture

This is a pnpm monorepo for an appointment scheduling platform (Acuity-style).

```
apps/
  api/          → Hono + oRPC backend, BetterAuth for sessions
  admin-ui/     → React 19 + TanStack Router/Query frontend
packages/
  db/           → Drizzle ORM schema + test utilities
  dto/          → Shared Zod schemas for validation
```

**Package dependencies:** `@scheduling/api` → `@scheduling/db`, `@scheduling/dto`. Frontend uses `@scheduling/dto` for type-safe validation.

**Path aliases:** `@scheduling/db`, `@scheduling/db/*`, `@scheduling/dto`, `@scheduling/dto/*` are configured in root tsconfig.json.

## Tech Stack

- **Runtime:** Bun (use `bun` not `node`, `bun test` not `jest`)
- **API:** Hono 4.x + oRPC (generates REST + OpenAPI, not tRPC)
- **Auth:** BetterAuth with Drizzle adapter
- **Database:** Drizzle ORM + Bun SQL, Postgres 18 with native `uuidv7()`
- **Testing:** Real Postgres via Docker (test database auto-created on first test run)
- **Linting:** oxlint (Rust-based, strict rules)
- **Formatting:** Biome (spaces, no tabs)

## Claude Code Skills

Use these skills (`/skill-name`) when working in relevant areas:

| Skill | Trigger |
|-------|---------|
| `/tanstack-start` | TanStack Router, Query, loaders, actions |
| `/vercel-react-best-practices` | React components, performance, Next.js patterns |
| `/better-auth-best-practices` | Authentication, sessions, auth routes |
| `/supabase-postgres-best-practices` | SQL queries, schema design, migrations |
| `/base-ui` | Adding accessible, unstyled UI components |
| `/frontend-design` | Building pages, layouts, visual design |
| `/web-design-guidelines` | UI reviews, accessibility audits, UX checks |

**UI/UX Reference Docs:** Before making UI changes to admin-ui, review:
- `apps/admin-ui/UI-UX-DIRECTIVES.md` — Component standards, interaction patterns, page requirements
- `apps/admin-ui/UX-NAV-REDESIGN.md` — Split-pane layout spec, journey maps, keyboard model

## Dependencies

Always use the latest versions of dependencies when adding new packages or updating existing ones. Check current versions before installing and prefer `pnpm add <package>@latest` to ensure you're not using outdated APIs or patterns.

## Database Schema Patterns

- All tables have `org_id` for multi-tenancy
- IDs use Postgres 18 native `uuidv7()` for sortable UUIDs
- Timestamps: `created_at`, `updated_at` with defaults
- Relations defined with Drizzle's `relations()` API

Key tables: `orgs`, `users`, `org_memberships`, `calendars`, `appointment_types`, `appointments`, `availability_rules`, `availability_overrides`, `blocked_time`

## DTO/Schema Patterns

Zod schemas follow create/update/response pattern:

```typescript
// packages/dto/src/org.ts
export const createOrgSchema = z.object({ name: z.string().min(1).max(255) });
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
```

Common validators in `packages/dto/src/common.ts`: UUID, timestamp, timezone, time (HH:MM), date (YYYY-MM-DD), weekday (0-6).

## Agent Memories

Accumulated knowledge from development sessions is stored in `.agents/memories/`.

Structure:
```
.agents/memories/
  drizzle/           → ORM patterns, migrations, gotchas
  better-auth/       → Auth integration learnings
  hono/              → API framework patterns
  tanstack-router/   → Router/query patterns
  postgres/          → Database optimizations, RLS notes
  testing/           → Test patterns, mocking strategies
```

Check these files for relevant context before implementing features in that area.

## Testing with Real Postgres

Tests use a real Postgres database (`scheduling_test`) with RLS enforced. The test database is automatically created on first test run via the preload script.

```typescript
import {
  createTestDb,
  resetTestDb,
  closeTestDb,
  seedTestOrg,
  setTestOrgContext,
} from "@scheduling/db/test-utils";

// In test setup
const db = await createTestDb();
const { org, user } = await seedTestOrg(db);

// Set org context before inserting/querying RLS-protected tables
await setTestOrgContext(db, org.id);

// Between tests
await resetTestDb();

// Cleanup
await closeTestDb();
```

**RLS-Protected Tables:** `locations`, `calendars`, `appointment_types`, `resources`, `clients`, `appointments`, `event_outbox`, `api_tokens`

Factory functions in `apps/api/src/test-utils/factories.ts` automatically set org context.

## Infrastructure

Docker Compose provides Postgres 18 (port 5433) and Valkey/Redis (port 6380). Start with `docker compose up -d`.

Environment variables in `.env`:

- `DATABASE_URL=postgres://scheduling:scheduling@localhost:5433/scheduling`
- `REDIS_URL=redis://localhost:6380` (optional, overrides host/port)
- `VALKEY_HOST=localhost`, `VALKEY_PORT=6380`
- `AUTH_SECRET`, `PORT=3000`

## Test User & Seed Data

Run `pnpm db:seed` to populate the database with demo data. This is idempotent and safe to run multiple times.

**Test credentials:**
- Email: `admin@example.com`
- Password: `password123`

**Seeded data:**
- Org: "Acme Scheduling"
- Location: "Main Office" (America/New_York)
- Calendar: "Dr. Smith"
- Appointment types: Initial Consultation (60 min), Follow-up Visit (30 min), Quick Check-in (15 min)


## Agent-Browser QA

Use agent-browser for one-off UI verification during development. This is useful for testing login flows, form submissions, and verifying UI changes work correctly.

### Basic Workflow

```bash
# Start the dev server first
pnpm dev

# Open the app and verify UI
agent-browser open http://localhost:5173
agent-browser snapshot -i        # Get interactive elements with refs
agent-browser click @e1          # Click element by ref
agent-browser fill @e2 "text"    # Fill input field
agent-browser screenshot         # Capture current state
agent-browser close              # Close when done
```

### Common Commands

| Command | Description |
|---------|-------------|
| `open <url>` | Open a URL in the browser |
| `snapshot -i` | Capture page with interactive element refs |
| `click @ref` | Click an element by its ref |
| `fill @ref "text"` | Type text into an input field |
| `screenshot` | Take a screenshot of current state |
| `close` | Close the browser session |

### Login Flow Example

```bash
agent-browser open http://localhost:5173/login
agent-browser snapshot -i
agent-browser fill @e1 "test@example.com"   # Email field
agent-browser fill @e2 "password123"         # Password field
agent-browser click @e3                      # Login button
agent-browser snapshot -i                    # Verify redirect/dashboard
agent-browser close
```

### Tips

- Always run `snapshot -i` after DOM changes to get fresh element refs
- Use refs (`@e1`, `@e2`) instead of CSS selectors for reliability
- Take screenshots at key steps for verification
- Close the browser when done to free resources



