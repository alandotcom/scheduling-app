# Implementation Plan

> **Reference:** See `design/implementation-details.md` for detailed code examples and patterns for each section.

## Checklist
- [ ] Step 1: Initialize pnpm monorepo with packages and apps structure
- [ ] Step 2: Set up infrastructure (docker-compose, environment config)
- [ ] Step 3: Configure @scheduling/db with Drizzle v1 and core schema
- [ ] Step 4: Set up @scheduling/dto with Zod schemas and oRPC contracts
- [ ] Step 5: Bootstrap apps/api with Hono + oRPC + BetterAuth
- [ ] Step 6: Bootstrap apps/admin-ui with TanStack Router + shadcn/ui
- [ ] Step 7: Implement RLS policies and tenant context middleware
- [ ] Step 8: Implement CRUD for locations, calendars, resources, appointment types
- [ ] Step 9: Implement availability rule storage and admin endpoints
- [ ] Step 10: Build availability engine (dates/times/check)
- [ ] Step 11: Implement appointments CRUD with rule enforcement
- [ ] Step 12: Build admin UI CRUD flows
- [ ] Step 13: Add webhook/event outbox + BullMQ job processing
- [ ] Step 14: Add API tokens + external REST hardening
- [ ] Step 15: Add audit logging and finalize

## Steps

### Step 1: Initialize pnpm monorepo with packages and apps structure

**Objective:** Create the monorepo skeleton with proper workspace configuration and shared tooling.

**Guidance:**
- Initialize pnpm workspace with `pnpm-workspace.yaml`
- Create directory structure:
  ```
  apps/api/
  apps/admin-ui/
  packages/db/
  packages/dto/
  ```
- Set up root `package.json` with workspace scripts (`dev`, `test`, `lint`, `format`)
- Configure shared `tsconfig.json` with path aliases for `@scheduling/*`
- Set up oxlint config (`oxlintrc.json`) with strict rules and native TS parser
- Set up oxfmt for formatting
- Add `.gitignore` for node_modules, dist, .env

**Tests:** Verify `pnpm install` works and workspace dependencies resolve.

**Integration:** Provides the foundation for all packages and apps.

**Demo:** Run `pnpm install` successfully; confirm workspace structure.

---

### Step 2: Set up infrastructure (docker-compose, environment config)

**Objective:** Configure local development infrastructure and environment management.

**Guidance:**
- Create `docker-compose.yml` with:
  - Postgres 18 (port 5433 to avoid conflicts)
  - Valkey (port 6380 to avoid conflicts)
- Create root `.env` with:
  ```
  DATABASE_URL=postgres://scheduling:scheduling@localhost:5433/scheduling
  VALKEY_HOST=localhost
  VALKEY_PORT=6380
  AUTH_SECRET=dev-secret-change-in-production
  PORT=3000
  ```
- Create `.env.example` as template
- Add `standard-env` to packages/dto or create shared config package

**Tests:** `docker compose up -d` starts both services; `docker compose ps` shows healthy.

**Integration:** All apps and packages use shared .env via standard-env.

**Demo:** Start Postgres and Valkey via docker compose; connect with psql/valkey-cli.

---

### Step 3: Configure @scheduling/db with Drizzle v1 and core schema

> See `implementation-details.md` sections 2 (BetterAuth tables), 7 (Testing Setup)

**Objective:** Set up Drizzle ORM with Postgres 18, UUID7, and core entity tables.

**Guidance:**
- Initialize `packages/db` with Drizzle v1
- Configure `drizzle.config.ts` for Postgres with Bun SQL adapter
- Create schema files:
  - `schema/orgs.ts` - orgs table
  - `schema/users.ts` - users table (BetterAuth compatible)
  - `schema/sessions.ts` - sessions table (BetterAuth)
  - `schema/accounts.ts` - accounts table (BetterAuth OAuth)
  - `schema/verifications.ts` - verifications table (BetterAuth)
  - `schema/org-memberships.ts` - org_memberships with role
  - `schema/locations.ts` - locations with timezone
  - `schema/calendars.ts` - calendars with location ref
  - `schema/appointment-types.ts` - appointment_types with duration, padding, capacity
  - `schema/resources.ts` - resources with quantity
  - `schema/appointment-type-calendars.ts` - join table
  - `schema/appointment-type-resources.ts` - join table with quantity_required
  - `schema/clients.ts` - clients for booking
  - `schema/appointments.ts` - appointments with status, times, timezone
  - `schema/appointment-resources.ts` - resource allocations per appointment
  - `schema/availability-rules.ts` - weekly recurring hours
  - `schema/availability-overrides.ts` - date-specific changes
  - `schema/blocked-time.ts` - blocked periods with optional RRULE
  - `schema/scheduling-limits.ts` - min/max notice, caps
  - `schema/event-outbox.ts` - for webhook delivery
- All IDs use `uuid('id').primaryKey().default(sql\`uuidv7()\`)`
- Export shared helpers:
  - `id` column helper
  - `orgId` column helper with reference
  - `timestamps` object with createdAt/updatedAt
- Create initial migration
- Set up Vitest + PGLite test utilities in `test-utils.ts`:
  - `createTestDb()` - creates in-memory PGLite with schema
  - `resetTestDb()` - truncates all tables
  - `closeTestDb()` - cleanup
  - `seedTestOrg()` - creates test org/user/membership

**Tests:**
- Run migrations against PGLite
- Verify tables created with correct columns and constraints
- Test foreign key relationships

**Integration:** Provides typed database access for apps/api.

**Demo:** Run `pnpm --filter @scheduling/db migrate`; inspect schema in Postgres.

---

### Step 4: Set up @scheduling/dto with Zod schemas and oRPC contracts

**Objective:** Create shared validation schemas and oRPC type contracts.

**Guidance:**
- Initialize `packages/dto`
- Create Zod schemas for all entities:
  - `schemas/org.ts`
  - `schemas/user.ts`
  - `schemas/location.ts`
  - `schemas/calendar.ts`
  - `schemas/appointment-type.ts`
  - `schemas/resource.ts`
  - `schemas/client.ts`
  - `schemas/appointment.ts`
  - `schemas/availability.ts`
- Include create/update/response variants for each
- Export types inferred from Zod schemas
- Create placeholder for oRPC contract types (populated when routes defined)

**Tests:** Unit tests for Zod schema parsing with valid/invalid inputs.

**Integration:** Used by both apps/api (validation) and apps/admin-ui (types).

**Demo:** Import schemas in a test file; validate sample data.

---

### Step 5: Bootstrap apps/api with Hono + oRPC + BetterAuth

> See `implementation-details.md` sections 1 (oRPC), 2 (BetterAuth), 3 (RLS), 5 (Errors)

**Objective:** Set up the API server with auth, tenant context, and oRPC routing.

**Guidance:**

**oRPC Setup (`src/lib/orpc.ts`):**
```typescript
import { os, ORPCError } from '@orpc/server'

export interface Context {
  userId: string | null
  orgId: string | null
  sessionId: string | null
  role: 'admin' | 'staff' | null
}

export const os = os.context<Context>()
export { ORPCError }
```

**BetterAuth Setup (`src/lib/auth.ts`):**
- Configure with Drizzle adapter pointing to @scheduling/db schema
- Enable email/password auth
- Set session expiry to 7 days

**Auth Middleware (`middleware/auth.ts`):**
- Check for session via `auth.api.getSession()`
- Get org context from `X-Org-Id` header
- Verify user membership in requested org
- Populate Hono context with userId, orgId, role

**RLS Middleware (`middleware/rls.ts`):**
- Use `SET LOCAL app.current_org_id` within transaction for pooling safety
- Or use `set_config('app.current_org_id', orgId, false)` with reset after request

**Hono App (`src/index.ts`):**
- Mount `/v1/health` without auth
- Apply auth + RLS middleware to `/v1/*`
- Mount oRPC handler with RPCHandler
- Export as Bun server

**Error Handler:**
- Map ORPCError codes to HTTP status codes
- Handle ZodError for validation failures
- Log unexpected errors

**Tests:**
- Auth middleware rejects missing session
- Auth middleware validates org membership
- Health endpoint returns 200
- RLS context is set correctly

**Integration:** Provides authenticated API foundation for all routes.

**Demo:** Start API server; hit `/v1/health`; verify auth rejects unauthenticated requests.

---

### Step 6: Bootstrap apps/admin-ui with TanStack Router + shadcn/ui

**Objective:** Set up the frontend with routing, UI components, and oRPC client.

**Guidance:**
- Initialize with shadcn preset:
  ```
  pnpm dlx shadcn@latest create --preset "https://ui.shadcn.com/init?base=base&style=nova&baseColor=neutral&theme=neutral&iconLibrary=hugeicons&font=inter&menuAccent=subtle&menuColor=default&radius=default&template=vite" --template vite
  ```
- Configure TanStack Router with file-based routing
- Set up `src/lib/api.ts` with oRPC client using `@orpc/client`
- Set up `src/lib/query.ts` with `@orpc/tanstack-query` integration
- Create root layout with navigation shell
- Add auth context and login stub
- Configure Tailwind with shadcn theme

**Tests:** Smoke test that app renders without errors.

**Integration:** Uses @scheduling/dto types; connects to apps/api.

**Demo:** Start admin-ui; see navigation shell with stubbed auth.

---

### Step 7: Implement RLS policies and tenant context middleware

> See `implementation-details.md` section 3 (RLS with Connection Pooling)

**Objective:** Enforce org isolation at the database level.

**Guidance:**

**Helper Function:**
```sql
CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.current_org_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;
```

**Enable RLS on all org-scoped tables:**
- locations, calendars, appointment_types, resources
- clients, appointments, availability_rules
- availability_overrides, blocked_time, scheduling_limits
- event_outbox

**Policy Pattern:**
```sql
CREATE POLICY org_isolation ON <table>
  FOR ALL
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());
```

**Connection Pooling Safety:**
- Option A: Wrap all DB operations in transactions with `SET LOCAL`
- Option B: Use `set_config()` with reset in finally block
- Create `withOrg(orgId, fn)` helper for safe execution

**Admin Bypass:**
- Create `app_admin` role with `BYPASSRLS`
- Use for migrations and seeding

**Seed Script:**
- Create demo org "Acme Scheduling"
- Create admin user with email/password
- Create org membership

**Tests:**
- User in Org A cannot see Org B data
- User in Org A can CRUD their own data
- Unauthenticated requests see no data
- RLS context is properly reset between requests

**Integration:** Secures all subsequent CRUD operations.

**Demo:** Query database as different org contexts; verify data isolation.

---

### Step 8: Implement CRUD for locations, calendars, resources, appointment types

**Objective:** Build core admin entity endpoints with oRPC.

**Guidance:**
- Create oRPC routes in `apps/api/src/routes/`:
  - `locations.ts` - CRUD with timezone validation
  - `calendars.ts` - CRUD with location reference
  - `resources.ts` - CRUD with location/quantity
  - `appointment-types.ts` - CRUD with duration, padding, capacity
- Each route uses Zod schemas from @scheduling/dto
- Implement list with filters and pagination
- Create join table routes for appointment-type-calendars and appointment-type-resources

**Tests:** API tests for CRUD operations; RLS enforcement tests.

**Integration:** These entities feed availability and appointments.

**Demo:** Create a location, calendar, resources, and appointment type via API.

---

### Step 9: Implement availability rule storage and admin endpoints

**Objective:** Support weekly hours, overrides, blocked time, and scheduling limits.

**Guidance:**
- Create oRPC routes for:
  - Weekly availability rules (per weekday, start/end time, interval)
  - Date overrides (specific dates, blocked or custom hours)
  - Blocked time ranges (single or recurring via RRULE)
  - Scheduling limits (min/max notice, per-slot/day/week caps)
- Include appointment type group support
- Add validation for overlapping rules

**Tests:** API tests for rule CRUD; validation tests for conflicts.

**Integration:** These rules are inputs for availability engine.

**Demo:** Configure a calendar with weekly hours, a holiday override, and blocked lunch time.

---

### Step 10: Build availability engine (dates/times/check)

> See `implementation-details.md` sections 4 (Algorithm), 10 (Timezone Handling)

**Objective:** Generate available dates and time slots with full rule enforcement.

**Guidance:**

**Data Types:**
```typescript
interface AvailabilityQuery {
  appointmentTypeId: string
  calendarIds: string[]
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  timezone: string   // IANA timezone (e.g., 'America/New_York')
}

interface TimeSlot {
  start: Date        // UTC
  end: Date          // UTC
  available: boolean
  remainingCapacity: number
}
```

**Core Algorithm (`AvailabilityEngine` class):**

1. **Load data:**
   - Appointment type (duration, padding, capacity)
   - Scheduling limits (min/max notice, per-slot/day/week caps)
   - Availability rules (weekly hours per calendar)
   - Overrides (date-specific changes)
   - Blocked times (including recurring via RRULE)
   - Existing appointments
   - Resource constraints

2. **Generate candidate slots:**
   - For each date in range
   - Check for override (blocked = skip day; custom hours = use those)
   - Otherwise use weekly rule for that weekday
   - Generate slots at interval increments
   - Ensure slot end <= day end

3. **Filter slots:**
   - **Min notice:** `slot.start > now + minNoticeHours`
   - **Max notice:** `slot.start < now + maxNoticeDays`
   - **Blocked time:** Check both single and recurring (use rrule library)
   - **Existing appointments:** Count overlapping (with padding), check vs capacity
   - **Resources:** Sum allocated quantities, check vs resource quantity
   - **Daily/weekly limits:** Count appointments in period

**Timezone Handling:**
- All internal calculations use Luxon with specified timezone
- Store and return UTC timestamps
- Pass timezone through for display purposes

**oRPC Routes:**
- `GET /v1/availability/dates` - Returns array of YYYY-MM-DD strings
- `GET /v1/availability/times` - Returns array of TimeSlot objects
- `POST /v1/availability/check` - Returns `{ available: boolean, reason?: string }`

**Tests:**
- Basic slot generation with weekly rules
- Override replaces weekly hours
- Blocked day shows no slots
- Recurring blocked time (e.g., lunch every day)
- Min/max notice filtering
- Capacity enforcement
- Resource constraint enforcement
- Padding between appointments
- Timezone boundary handling (midnight crossings)

**Integration:** Used by appointment creation/reschedule endpoints.

**Demo:** Fetch available dates and times for an appointment type with resources.

---

### Step 11: Implement appointments CRUD with rule enforcement

> See `implementation-details.md` sections 6 (Pagination), 10 (Timezone), 11 (Race Conditions)

**Objective:** Enable creating, rescheduling, canceling appointments with validation.

**Guidance:**

**oRPC Routes:**

`GET /v1/appointments` - List with cursor pagination
- Filters: calendarId, appointmentTypeId, status, startDate, endDate, clientId
- Include related: calendar, appointmentType, client
- Use cursor-based pagination with UUID7 ordering

`POST /v1/appointments` - Create with availability check
- Input: calendarId, appointmentTypeId, startTime, timezone, clientId?, notes?
- Parse startTime to UTC using timezone
- Calculate endTime from appointment type duration
- Check availability via engine
- Create with transaction + locking (see below)
- Allocate resources
- Emit `appointment.created` event

`GET /v1/appointments/:id` - Get single
- Include related entities
- Return 404 if not found (RLS handles org isolation)

`PATCH /v1/appointments/:id` - Update details
- Only allow updating: notes, clientId
- Cannot change time (use reschedule)
- Emit `appointment.updated` event

`POST /v1/appointments/:id/cancel` - Cancel
- Input: reason?
- Set status to 'cancelled'
- Release resource allocations
- Emit `appointment.cancelled` event

`POST /v1/appointments/:id/reschedule` - Reschedule
- Input: newStartTime, timezone
- Check new slot availability
- Update times atomically
- Emit `appointment.rescheduled` event

`POST /v1/appointments/:id/no-show` - Mark no-show
- Set status to 'no_show'
- Emit `appointment.no_show` event

**Race Condition Prevention:**

```typescript
async function createBookingWithLocking(/* params */) {
  return db.transaction(async (tx) => {
    // 1. Lock calendar row: SELECT ... FOR UPDATE
    // 2. Check overlapping appointments with padding
    // 3. Verify capacity not exceeded
    // 4. Check resource availability
    // 5. Insert appointment
    // 6. Insert resource allocations
  }, { isolationLevel: 'serializable' })
}
```

**Retry Logic:**
- Retry on PostgreSQL serialization failure (error code 40001)
- Don't retry on business logic errors (SLOT_UNAVAILABLE)
- Exponential backoff (50ms, 100ms, 150ms)
- Max 3 retries

**Error Responses:**
- `SLOT_UNAVAILABLE` (409) - Time slot no longer available
- `RESOURCE_CONFLICT` (409) - Resource not available
- `BOOKING_IN_PAST` (422) - Cannot book in the past
- `OUTSIDE_NOTICE_WINDOW` (422) - Outside min/max notice
- `APPOINTMENT_ALREADY_CANCELLED` (422) - Already cancelled

**Tests:**
- Create appointment success
- Create fails when slot taken
- Create fails when resource exhausted
- Concurrent booking attempts - only one succeeds
- Reschedule to valid slot
- Reschedule fails to invalid slot
- Cancel releases resources
- List with various filters
- Pagination works correctly

**Integration:** Links availability engine, appointment types, and resources.

**Demo:** Create and reschedule an appointment; verify conflicts are enforced.

---

### Step 12: Build admin UI CRUD flows

**Objective:** Provide admin/staff screens for all entities.

**Guidance:**
- Create TanStack Router routes:
  - `/appointments` - list with filters, status badges
  - `/appointments/new` - booking form with availability picker
  - `/calendars` - list and detail with availability editor
  - `/appointment-types` - list and form with resource assignment
  - `/locations` - list and form
  - `/resources` - list and form with location assignment
- Use shadcn/ui components (tables, forms, dialogs)
- Integrate oRPC queries via `@orpc/tanstack-query`
- Add inline editing where appropriate

**Tests:** Playwright smoke tests for critical flows.

**Integration:** UI uses oRPC API with session auth.

**Demo:** Manage availability and create appointments through the UI.

---

### Step 13: Add webhook/event outbox + BullMQ job processing

**Objective:** Emit domain events and process them asynchronously.

**Guidance:**
- Set up BullMQ with Valkey connection in `apps/api/src/services/jobs.ts`
- Create abstract JobQueue interface for future swapability
- Implement event emission on:
  - Appointment create/update/cancel/reschedule
  - CRUD for calendars, appointment types, resources, locations
- Create event outbox processing worker
- Implement webhook delivery with retry logic
- Add subscription endpoint stub for future webhook registration

**Tests:** Event emission unit tests; worker integration tests.

**Integration:** Introduces asynchronous event pipeline.

**Demo:** Create appointment, verify event queued and logged.

---

### Step 14: Add API tokens + external REST hardening

**Objective:** Support server-to-server access and protect APIs.

**Guidance:**
- Implement API token model in @scheduling/db
- Add token issuance/revocation endpoints
- Create token auth middleware (parallel to session auth)
- Implement token scopes (admin/staff)
- Ensure RLS context works with token auth
- Add rate limiting middleware
- Standardize pagination across list endpoints

**Tests:** Token auth integration tests; rate limit tests.

**Integration:** Enables external API usage.

**Demo:** Generate API token; use it to access `/v1/appointments`.

---

### Step 15: Add audit logging and finalize

**Objective:** Capture change history and complete documentation.

**Guidance:**
- Add audit_events table to @scheduling/db
- Emit audit records on mutations (create/update/delete/cancel/reschedule)
- Store actor, action, entity, before/after snapshots
- Create audit log query endpoint
- Update README with:
  - Setup instructions
  - Architecture overview
  - API documentation or OpenAPI spec generation script

**Tests:** Verify audit entries on mutations.

**Integration:** Completes platform-level observability.

**Demo:** Show audit log entries for an appointment lifecycle.
