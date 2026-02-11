# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Active Development

This app is in active development — there are no production users yet. This means:

- **No backwards compatibility needed.** Don't add migration shims, deprecation layers, or feature flags to preserve old behavior. Just change the code directly.
- **No new database migrations.** Instead of creating incremental migrations, update the initial SQL migration file and reset the dev database (`pnpm --filter @scheduling/db run push`). We'll create proper migrations when we approach production.
- **Consistency over configurability.** When changing UI behavior (e.g., how modals work, how forms validate), pick one approach and apply it everywhere. Don't add props/options to make behavior configurable unless there's a concrete need — that just adds complexity. The goal is a uniform, predictable UI.
- **Schema changes are free.** Rename columns, change types, drop tables — there's no real data to preserve. But remember to update the seed script (`pnpm db:seed`) if it references changed schema.
- **API contracts can break freely.** No external consumers exist, so change endpoint paths, request/response shapes, etc. without versioning or deprecation.
- **Delete dead code, don't comment it out.** Git has the history. No commented-out blocks or `// TODO: remove` markers for old behavior — just delete it.
- **Don't abstract prematurely.** Wait until a pattern appears 3+ times before extracting a shared util/hook/component. Two similar blocks of code are fine.
- **Match existing patterns before inventing new ones.** Before building a new page, route, or component, look at how a similar one is already built and follow the same structure.
- **Prefer inline/co-located code.** Keep related code together. Don't split into separate files prematurely. A 200-line component file is fine.

## Commands

```bash
# Development
pnpm dev              # Run API + admin UI in parallel
pnpm dev:api          # Run API only with hot reload
pnpm dev:inngest      # Run Inngest Dev Server and sync with /api/inngest
pnpm dev:admin        # Run admin UI only
pnpm bootstrap:dev    # Push DB schema and seed demo data
pnpm --filter @scheduling/api run sync:svix-event-catalog  # Manual Svix schema sync

# Testing
pnpm test             # Run all tests
pnpm --filter @scheduling/api run test           # Run API tests only
pnpm --filter @scheduling/db run test            # Run DB tests only

# Code Quality
pnpm lint             # Run oxlint
pnpm format           # Auto-format with Biome (spaces, no tabs)
pnpm build            # Build via Turborepo graph (dependency-aware + cached)
pnpm build:changed    # Build only changed packages since origin/main (+ dependents)
pnpm build:all        # Force full uncached build across all packages
pnpm typecheck        # Type-check via Turborepo graph (dependency-aware + cached)
pnpm typecheck:changed # Type-check only changed packages since origin/main (+ dependents)
pnpm typecheck:all    # Force full uncached type-check across all packages
pnpm knip             # Run full Knip analysis (cached)
pnpm knip:deps        # Run strict dependency-focused Knip checks
pnpm knip:deps:ci     # CI dependency gate (strict, zero issues)
pnpm knip:audit       # Run full Knip audit without failing the command

# After updating code
pnpm format           # Always run formatting after code changes

# Database (from packages/db)
pnpm --filter @scheduling/db run generate   # Generate migration from schema changes
pnpm --filter @scheduling/db run migrate    # Run pending migrations
pnpm --filter @scheduling/db run push       # Push schema to dev database
```

## App-Level Guidance

- API-specific testing guidance lives in `apps/api/AGENTS.md`.
- Use it for `bun:test` conventions, `@inngest/test` patterns, and API test command examples.

### Typecheck Usage (Turbo)

- **IMPORTANT:** Never run typecheck in individual projects/packages. Only run typecheck from the repo top level.
- Use `pnpm typecheck` for normal local development (fast reruns with task cache).
- Use `pnpm typecheck:changed` for PR validation and focused local checks against `origin/main`.
- Use `pnpm typecheck:all` when you need a clean full pass that bypasses cache.
- If `origin/main` is missing locally, run `git fetch origin main` before `pnpm typecheck:changed`.
- For every workspace package, keep the `typecheck` script on the fast pattern:
  `tsc -p tsconfig.typecheck.json --noEmit --incremental --tsBuildInfoFile node_modules/.cache.typecheck.tsbuildinfo --pretty false`
- For every workspace package, include a `tsconfig.typecheck.json` that extends the package `tsconfig.json` and sets:
  `"declaration": false`, `"declarationMap": false`, `"sourceMap": false`
- When creating a new package, add both the `typecheck` script and `tsconfig.typecheck.json` immediately so Turbo and local reruns stay fast.

### Build Usage (Turbo)

- Use `pnpm build` for normal local development and packaging (fast reruns with task cache).
- Use `pnpm build:all` for a clean full pass that bypasses cache.
- Use `pnpm build:changed` for focused local checks against `origin/main`.
- `admin-ui` build uses `vite build`; TypeScript validation is enforced via root `pnpm typecheck`.
- If `origin/main` is missing locally, run `git fetch origin main` before `pnpm build:changed`.

## Starting Dev Servers

**IMPORTANT:** Before starting a dev server, ALWAYS check if one is already running:

```bash
# Check for running Vite (admin-ui), API, or Inngest dev server processes
ps aux | grep -E "(vite|bun.*src/index|inngest dev)" | grep -v grep

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

**Path aliases:** `@scheduling/db`, `@scheduling/db/*`, `@scheduling/dto`, `@scheduling/dto/*`, `@integrations/core`, `@integrations/logger` are configured in root tsconfig.json.

## Tech Stack

- **Runtime:** Bun (use `bun` not `node`, `bun test` not `jest`)
- **API:** Hono 4.x + oRPC (generates REST + OpenAPI, not tRPC)
- **Auth:** BetterAuth with Drizzle adapter
- **Database:** Drizzle ORM + Bun SQL, Postgres 18 with native `uuidv7()`
- **Webhooks:** Svix (self-hosted OSS or hosted cloud)
- **Async runtime:** Inngest (event fanout + workflow orchestration)
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
| `/drizzle` | Drizzle ORM schemas, relations v2, queries, migrations |


## Dependencies

Always use the latest versions of dependencies when adding new packages or updating existing ones. Check current versions before installing and prefer `pnpm add <package>@latest` to ensure you're not using outdated APIs or patterns.

Dependency classification rule:
- Runtime imports must be listed in `dependencies`.
- Test-only/dev-only/tooling usage must be listed in `devDependencies`.
- Validate dependency hygiene with `pnpm knip:deps` before pushing.

## TypeScript + Bun Types

- Root `tsconfig.json` intentionally does **not** define Bun global types.
- Bun runtime packages (`apps/api`, `packages/db`, `packages/dto`) declare `@types/bun` in their own workspace `tsconfig.json` and `package.json`.

## TypeScript Event Typing

- For event models with a discriminator (`type`) and type-dependent payload, avoid using a generic over a union for the "any event" shape (for example `Event<EventType>`). This weakens narrowing and produces noisy IDE hovers.
- Prefer a mapped discriminated union:
  - `type EventByType = { [T in EventType]: BaseEvent & { type: T; payload: Payload<T> } }`
  - `type AnyEvent = EventByType[EventType]`
- Keep shared fields (`id`, `orgId`, `timestamp`) in a non-generic base type so hover info stays readable.
- When converting unknown input into a discriminated union, prefer a type guard with `safeParse` over unsafe `as` assertions.

## Collection Utilities

- Prefer `es-toolkit` helpers for non-trivial collection transforms instead of custom async loops/reducers/object-mapping logic.
- For async arrays, default to `forEachAsync` / `mapAsync` / `reduceAsync` from `es-toolkit/array`, and set `concurrency` intentionally (`1` when order/transactional sequencing matters).
- Avoid `await` inside `for`/`while` loops (`eslint/no-await-in-loop`). If sequential execution is required, precompute an ordered list and run it via `forEachAsync(..., { concurrency: 1 })` or `reduceAsync`.
- For object value transforms, prefer `mapValues` from `es-toolkit/object`; use `es-toolkit/compat` only when lodash-compatible behavior is specifically needed.

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

## Webhook Delivery (Svix + Inngest)

- Canonical webhook event types and payload schemas live in `packages/dto/src/schemas/webhook.ts`.
- API event payload validation is sourced from DTO (`apps/api/src/services/jobs/emitter.ts`) to prevent drift.
- Event catalog sync logic lives in `apps/api/src/services/svix-event-catalog.ts`.
- Catalog sync is idempotent (`create`, then `update` on 409) and runs on API startup.
- Manual sync command: `pnpm --filter @scheduling/api run sync:svix-event-catalog`.
- For self-hosted Svix OSS, the admin UI does not use hosted App Portal; it uses `svix-react` hooks with a short-lived session from `GET /v1/webhooks/session`.

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

### UI Modal Memory

- When a modal's open state is derived from TanStack Router search params (`selected`, `tab`), pressing `Escape` can briefly flash fallback modal content while URL state updates.
- Preferred fix pattern: keep local modal open state and do **immediate local close first**, then clear search params.
- Example approach:
  - Local state: `const [isModalOpen, setIsModalOpen] = useState(false)`
  - Open when selected entity is present (effect on `selectedId` + resolved entity)
  - On dismiss (`Escape`, backdrop, close button): `setIsModalOpen(false)` first, then navigate to clear `selected`/`tab`
- This prevents the transient "empty details modal" flash caused by URL update timing.
- For URL-driven detail modals, also keep a `displayEntity` snapshot (`selected ? selectedEntity : closingSnapshot`) and use it for modal title/description/body. This avoids blank fallback headers/content when the selected entity is briefly unresolved during close/refetch.
- Do not use generic fallback titles like `"Client details"` for URL-driven entity detail modals; prefer `""` and gate `open` with actual `displayEntity` presence (`open={isModalOpen && !!displayEntity}`) to avoid visible empty-shell flashes.

### Keyboard Shortcuts

The admin-ui has a custom keyboard shortcuts system (single global listener, registration-based, scoped). See `apps/admin-ui/CLAUDE.md` "Keyboard Shortcuts" section for full details. When adding shortcuts: (1) register with `useKeyboardShortcuts()`, (2) add to `SHORTCUT_SECTIONS` in `shortcuts-help-dialog.tsx`, (3) optionally add to `command-palette.tsx`.

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

**RLS-Protected Tables:** `locations`, `calendars`, `appointment_types`, `resources`, `clients`, `appointments`, `api_tokens`

Factory functions in `apps/api/src/test-utils/factories.ts` automatically set org context.

## Infrastructure

Docker Compose provides:
- Postgres 18 (port 5433)
- Scheduling Valkey/Redis (port 6380)
- Svix server (port 8071)
- Dedicated Svix Valkey container (internal)

Start with `docker compose up -d`.

Environment variables in `.env`:

- `DATABASE_URL=postgres://scheduling:scheduling@localhost:5433/scheduling`
- `DB_PUSH_DATABASE_URL=postgres://scheduling:scheduling@localhost:5433/scheduling` (optional; used by `pnpm bootstrap:dev`)
- `AUTH_SECRET`, `API_PORT=3000` (optional), `PORT=3000`
- `INNGEST_BASE_URL=http://localhost:8288` (local default), `INNGEST_EVENT_KEY=dev` (local default)
- `INNGEST_SIGNING_KEY=<required outside local dev>`
- `SVIX_WEBHOOKS_ENABLED=true|false`
- `SVIX_BASE_URL=http://localhost:8071` (self-hosted) or hosted Svix base URL
- `SVIX_AUTH_TOKEN=<svix-token>`
- `SVIX_JWT_SECRET=<self-hosted svix jwt secret>`

## Test User & Seed Data

Run `pnpm db:seed` to populate the database with demo data. This is idempotent and safe to run multiple times.

**Test credentials:**
- Email: `admin@example.com`
- Password: `password123`

**Seeded data:**
- Orgs: "Acme Scheduling" and "Northwind Therapy Group" (same admin user in both)
- Locations: 2 per org (including in-person and virtual locations)
- Calendars: 3 per org (2 providers + 1 support calendar)
- Appointment types: 5 per org (Initial Consultation, Follow-up Visit, Annual Wellness Exam, Procedure Visit, Quick Check-in)
- Clients: 12 per org with mixed contact completeness
- Appointments: 20 per org with mixed statuses (`scheduled`, `confirmed`, `cancelled`, `no_show`)
- Availability: weekly rules, date-specific overrides, and blocked-time entries per org


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
