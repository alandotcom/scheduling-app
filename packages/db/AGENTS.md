# Database Package — CLAUDE.md

## Commands

```bash
pnpm --filter @scheduling/db run test        # RLS tests (Bun, real Postgres)
pnpm --filter @scheduling/db run typecheck   # Type-check
pnpm --filter @scheduling/db run generate    # Generate migration from schema changes
pnpm --filter @scheduling/db run migrate     # Run pending migrations
pnpm --filter @scheduling/db run push        # Push schema to dev DB
pnpm --filter @scheduling/db run reset       # Truncate all dev tables
pnpm format                                  # Biome (run from root)
```

## Package Exports

| Path | Entry | Contents |
|------|-------|----------|
| `.` | `src/index.ts` | DB instance, schema re-exports |
| `./schema` | `src/schema/index.ts` | All table definitions + enums |
| `./relations` | `src/relations.ts` | Drizzle v1 RQBv2 relations |
| `./test-utils` | `src/test-utils.ts` | Test DB lifecycle, seeding, RLS context |

## Directory Structure

```
src/
  index.ts              # DB instance + schema re-exports
  schema/
    index.ts            # All tables, enums, helpers
    auth.ts             # BetterAuth re-exports
  relations.ts          # defineRelations() for RQBv2
  test-utils.ts         # Test helpers (lifecycle, seeding, context)
  test-setup.ts         # Preload: creates test DB, runs migrations
  rls.test.ts           # RLS policy tests (~50 tests)
  reset.ts              # Dev DB truncation script
  seed.ts               # Redirects to apps/api/src/seed.ts
  migrations/
    20260208064434_init/         # Schema + RLS functions + policies
    20260208064456_triggers/     # Capacity check trigger
    20260208154419_.../          # Appointment index addition
drizzle.config.ts               # Dev DB config
drizzle.test.config.ts          # Test DB config
bunfig.toml                     # Preloads test-setup.ts
```

## Schema Conventions

**IDs:** Postgres 18 native UUIDv7
```typescript
uuid("id").primaryKey().default(sql`uuidv7()`)
```

**Timestamps:** All tables use a shared `timestamps` helper:
```typescript
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};
```

**Multi-tenancy:** Every user-data table has `orgId` FK to `orgs`.

**RLS:** Tables use `pgTable.withRLS()` + `pgPolicy("org_isolation_*")` with `current_org_id()`.

**Enums:**
- `appointmentStatusEnum` — `scheduled`, `confirmed`, `cancelled`, `no_show`
- `orgRoleEnum` — `owner`, `admin`, `member`
- `invitationStatusEnum` — `pending`, `accepted`, `rejected`, `canceled`

## Tables Overview

**Core (no RLS):**
`orgs`, `users`, `org_memberships`, `org_invitations`, `sessions`, `accounts`, `verifications`

**RLS-protected (org-scoped):**
`locations`, `calendars`, `appointment_types`, `resources`, `clients`, `appointments`, `audit_events`

**Join tables:**
`appointment_type_calendars`, `appointment_type_resources`

**Availability (no RLS, calendar-scoped):**
`availability_rules`, `availability_overrides`, `blocked_time`, `scheduling_limits`

**Notable columns:**
- `orgs` — `slug`, `default_timezone`, `default_business_hours_start/end`, `default_business_days` (JSONB)
- `appointments` — `start_at`/`end_at` (timestamptz), `timezone`, `status` (enum), GiST-indexed ranges
- `availability_overrides` — `time_ranges` (JSONB array of `{ startTime, endTime }`; empty = blocked)

## Relations (Drizzle v1 RQBv2)

Uses `defineRelations()` API:

```typescript
export const relations = defineRelations(schema, (r) => ({
  orgs: {
    memberships: r.many.orgMemberships(),
    calendars: r.many.calendars(),
    appointments: r.many.appointments(),
    // ...
  },
  appointments: {
    org: r.one.orgs({ from: r.appointments.orgId, to: r.orgs.id }),
    calendar: r.one.calendars({ from: r.appointments.calendarId, to: r.calendars.id }),
    client: r.one.clients({ from: r.appointments.clientId, to: r.clients.id }),
    // ...
  },
}));
```

Relational queries: `db.query.calendars.findFirst({ with: { appointments: true } })`

## Query Projection Patterns (Drizzle v1)

When building query shapes for API/repository code, prefer projection at query time over reshaping after fetch.

- Prefer `select({ ... })` with only the fields needed by the caller.
- Avoid `select().from(table)` followed by `results.map((row) => ({ ... }))` when the map only renames/drops fields.
- For join results, prefer nested select objects directly in Drizzle so nullability is inferred at object level.
- Keep post-query maps only when doing real post-processing (for example grouping, aggregation merges, or constructing lookup maps).

Examples:

```typescript
// Good: shape returned directly from DB
const rules = await tx
  .select({
    id: availabilityRules.id,
    calendarId: availabilityRules.calendarId,
    weekday: availabilityRules.weekday,
    startTime: availabilityRules.startTime,
    endTime: availabilityRules.endTime,
    intervalMin: availabilityRules.intervalMin,
    groupId: availabilityRules.groupId,
  })
  .from(availabilityRules)
  .where(inArray(availabilityRules.calendarId, calendarIds));
```

```typescript
// Avoid when map is only projection
const rows = await tx.select().from(availabilityRules);
return rows.map((r) => ({
  id: r.id,
  calendarId: r.calendarId,
  weekday: r.weekday,
  startTime: r.startTime,
  endTime: r.endTime,
  intervalMin: r.intervalMin,
  groupId: r.groupId,
}));
```

Note: in Drizzle v1, `getColumns` is preferred over deprecated `getTableColumns` when spreading full table columns.

## RLS Model

Three layers enforce tenant isolation:

1. **Schema** — `pgTable.withRLS()` + `pgPolicy()` in Drizzle schema
2. **SQL** — Postgres policies use `current_org_id()` / `current_user_id()` functions
3. **Runtime** — App sets `app.current_org_id` / `app.current_user_id` config vars before queries

`current_org_id()` and `current_user_id()` are SQL functions that read Postgres session-level config variables. Context **must** be set before querying any RLS-protected table.

## Test Utilities (`src/test-utils.ts`)

### DB Lifecycle

```typescript
createTestDb()   // → Promise<db> — creates/returns test DB connection
resetTestDb()    // → truncates all tables (CASCADE), use in beforeEach
closeTestDb()    // → closes connection, use in afterAll
getTestDb()      // → returns current db instance (throws if not initialized)
```

### Seeding

```typescript
seedTestOrg(db)        // → { org, user } — "Test Org" + "test@example.com" (owner)
seedSecondTestOrg(db)  // → { org, user } — "Second Test Org" + "second@example.com" (owner)
```

### RLS Context

```typescript
setTestOrgContext(db, orgId)              // Set app.current_org_id
setTestUserContext(db, userId)            // Set app.current_user_id
setTestContext(db, orgId, userId)         // Set both (parallel)
clearTestOrgContext(db)                   // Clear org context
clearTestUserContext(db)                  // Clear user context
clearTestContext(db)                      // Clear both (parallel)
withTestOrgContext(db, orgId, fn)         // Execute fn with org context, then clear
withTestContext(db, orgId, userId, fn)    // Execute fn with both contexts, then clear
```

### Typical Test Pattern

```typescript
const db = await createTestDb();
const { org, user } = await seedTestOrg(db);

beforeEach(async () => { await resetTestDb(db); });
afterAll(async () => { await closeTestDb(db); });

test("query with RLS", async () => {
  await setTestOrgContext(db, org.id);
  const rows = await db.query.calendars.findMany();
  // ...
});
```

## Test Setup (`src/test-setup.ts`)

Auto-runs via `bunfig.toml` preload before all tests:

1. Creates `scheduling_test` database if missing
2. Creates `scheduling_app` user **without BYPASSRLS** (enforces RLS in tests)
3. Pushes current schema against the test DB
4. Grants permissions to `scheduling_app`
5. Overrides `DATABASE_URL` to `postgres://scheduling_app:scheduling@localhost:5433/scheduling_test`

## Migrations

Located in `src/migrations/` with timestamped directories.

| Migration | Purpose |
|-----------|---------|
| `init` | All tables, enums, indexes, `btree_gist` extension, `current_org_id()`/`current_user_id()` functions, RLS policies |
| `triggers` | `check_appointment_capacity()` trigger + `idx_appointments_resource_check` index |
| `zippy_abomination` | `appointments_org_start_at_id_idx` composite index |

Generate new migrations: `pnpm --filter @scheduling/db run generate`

Two drizzle configs: `drizzle.config.ts` (dev) and `drizzle.test.config.ts` (test) target separate databases.

## Key Business Logic in SQL

### `check_appointment_capacity()` Trigger

Fires on INSERT and UPDATE of `appointments`. Prevents over-booking:

1. Skips cancelled appointments
2. Reads capacity from the appointment type (default: 1)
3. Resolves location for resource scoping
4. Acquires **advisory locks** on 15-minute time buckets (calendar-wide + per-resource)
5. Counts overlapping non-cancelled appointments on the calendar
6. Validates calendar capacity not exceeded
7. Validates resource capacity not exceeded (location-scoped)

Advisory lock key: `hashtext(calendar_id || '|' || bucket_epoch)` — locks auto-release at transaction end.
