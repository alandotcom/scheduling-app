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
- `VALKEY_HOST=localhost`, `VALKEY_PORT=6380`
- `AUTH_SECRET`, `PORT=3000`

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Planning Workflow

When planning large tasks:
1. Enter plan mode
2. Ask clarifying questions (like idea-honing.md Q&A)
3. Explore codebase thoroughly
4. Create detailed plan with steps
5. On approval, create Beads tasks for each step

## Task Execution with Beads

Use Beads for task tracking during execution:

```bash
bd ready              # Find next unblocked task
bd show <id>          # Get task details
bd close <id>         # Mark complete after all checks pass
bd create "..." --blocks <id>  # Report blockers
bd list               # See all tasks
```

After completing each task:
1. Run backpressure: `pnpm typecheck && pnpm lint && pnpm test`
2. Run code review using the code-reviewer agent
3. Fix any issues found, re-run checks if needed
4. Close task and commit when all checks pass

## Execution Loop

```bash
# Run tasks until none remain
while bd ready | grep -q "scheduling-app-"; do
  claude "@PROMPT.md"
done
```
