# Database Package — CLAUDE.md

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/guides/journey-engine-domain-events.md`
- `docs/guides/journey-execution-lifecycle.md`
- `docs/plans/README.md`

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
  seed.ts               # Stub; real seed runs from apps/api
  migrations/
    20260208064434_init/         # Schema + RLS functions + policies
    20260208064456_triggers/     # Capacity check trigger
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

### Selective Reset Policy (apps/api)

- `apps/api` uses selective reset now: there is no global auto-reset in preload.
- DB test files opt in by calling `registerDbTestReset()` from `apps/api/src/test-utils/index.ts`.
- Keep `resetTestDb()` as the low-level primitive, but avoid reintroducing global reset hooks in test preload code.
- For new API DB test files:
  - prefer `registerDbTestReset("per-file")` when each test seeds isolated fixtures and does not require globally empty tables.
  - use `registerDbTestReset()` for stateful suites that are not safe under per-file isolation.

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

## Custom Attribute Slot Columns

The `client_custom_attribute_values` table uses a **slot column** pattern: fixed typed columns (`t0`–`t9`, `n0`–`n4`, `d0`–`d2`, `b0`–`b4`, `j0`–`j1`) store dynamically defined custom attribute values. Strong typing across the API layer depends on exact coordination between the schema and the slot config.

### Adding New Slot Columns — Checklist

When adding columns to `clientCustomAttributeValues` (e.g., expanding capacity for a type):

1. **Add the column(s) in `packages/db/src/schema/index.ts`** — follow the existing naming pattern (`{prefix}{index}`, e.g., `t10`, `n5`).

2. **Update `SLOT_COUNT_BY_PREFIX` in `apps/api/src/lib/slot-config.ts`** — increment the count for the affected prefix so the runtime set includes the new column.

3. **Verify `NonSlotColumn` in `slot-config.ts` still lists only non-slot columns** — the `SlotColumn` type is `Exclude<keyof Values, NonSlotColumn>`. New slot columns are automatically included in `SlotColumn` as long as they're NOT listed in `NonSlotColumn`. A compile-time assertion (`_AssertSlotShape`) will fail if a non-slot column is accidentally omitted from `NonSlotColumn`.

4. **Update the initial migration SQL** — since there are no production users, edit the existing `init` migration directly and run `pnpm --filter @scheduling/db run push`.

5. **Update the seed script** (`apps/api/src/scripts/seed.ts`) if it references custom attribute slots.

6. **Run verification:**
   ```bash
   pnpm typecheck:all   # Compile-time slot shape assertion catches mismatches
   pnpm lint            # No unsafe type assertions allowed
   pnpm --filter @scheduling/api run test
   ```

### How the Type Safety Works

```
packages/db/schema      →  SlotColumn = Exclude<keyof Values, NonSlotColumn>
                              (derived at compile time from the Drizzle table)

slot-config.ts          →  VALID_SLOT_COLUMN_STRINGS = runtime Set built from
                              SLOT_COUNT_BY_PREFIX (prefix → count)

                        →  _AssertSlotShape: compile-time check that every
                              SlotColumn matches `${SlotPrefix}${number}`

                        →  isSlotColumn(): runtime type guard validates
                              strings against VALID_SLOT_COLUMN_STRINGS

repositories/           →  validateDefinitions() narrows DB rows to
custom-attributes.ts       ValidatedDefinition (slotColumn: SlotColumn)
                              at the read boundary — all consumers get
                              typed slot columns without downstream guards

services/               →  Works exclusively with ValidatedDefinition;
client-custom-              no scattered isSlotColumn checks needed
  attributes.ts
```

### Column Naming Conventions

| Prefix | Postgres type | Custom attribute types | Current count |
|--------|--------------|----------------------|---------------|
| `t` | `text` | TEXT, SELECT | 10 (`t0`–`t9`) |
| `n` | `numeric(18,4)` | NUMBER | 5 (`n0`–`n4`) |
| `d` | `timestamptz` | DATE | 3 (`d0`–`d2`) |
| `b` | `boolean` | BOOLEAN | 5 (`b0`–`b4`) |
| `j` | `jsonb` | MULTI_SELECT | 2 (`j0`–`j1`) |

### Adding a Non-Slot Column

If you add a column to `clientCustomAttributeValues` that is NOT a slot (e.g., a metadata column), you MUST add its camelCase property name to the `NonSlotColumn` type in `apps/api/src/lib/slot-config.ts`. The compile-time assertion will catch this — the build will fail because the new column won't match `${SlotPrefix}${number}`.

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
