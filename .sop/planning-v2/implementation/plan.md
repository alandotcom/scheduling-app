# Implementation Plan — v2 Hardening & Improvements

> **Reference:** See `design/detailed-design.md` for architecture details and code patterns.

## Checklist

- [ ] Step 1: Set up test infrastructure and helpers
- [ ] Step 2: Add integration tests for simple CRUD routes (locations, resources, clients)
- [ ] Step 3: Extract Repository layer for core entities
- [ ] Step 4: Extract Service layer for core entities
- [ ] Step 5: Add integration tests for calendars and appointment-types
- [ ] Step 6: Add exclusion constraint migration
- [ ] Step 7: Refactor appointments route to Repository + Service
- [ ] Step 8: Add appointments integration tests (including concurrent booking)
- [ ] Step 9: Optimize availability engine queries
- [ ] Step 10: Add availability route integration tests
- [ ] Step 11: Update oxlint configuration
- [ ] Step 12: Fix linting violations
- [ ] Step 13: Add RLS for org_memberships
- [ ] Step 14: Harden Better Auth configuration
- [ ] Step 15: Add api-tokens and audit route tests

## Steps

### Step 1: Set up test infrastructure and helpers

**Objective:** Create reusable test utilities for route integration testing.

**Guidance:**
- Create `apps/api/src/test-utils/context.ts` with `createTestContext()` helper
- Create `apps/api/src/test-utils/factories.ts` with test data factories
- Create `apps/api/src/test-utils/setup.ts` for global test configuration
- Extend existing `@scheduling/db/test-utils` if needed
- Ensure test context can be injected into route handlers

**Files to create:**
```
apps/api/src/test-utils/
├── context.ts      # createTestContext(orgId, userId, role)
├── factories.ts    # org, user, appointment, calendar, etc.
├── setup.ts        # vitest setup, db initialization
└── index.ts        # barrel export
```

**Tests:** Verify test helpers work by writing a simple test that creates context and seeds data.

**Integration:** Provides foundation for all subsequent route tests.

**Demo:** Run a sample test that uses `createTestContext()` and `seedTestOrg()`.

---

### Step 2: Add integration tests for simple CRUD routes

**Objective:** Test locations, resources, and clients routes with full coverage.

**Guidance:**
- Create `locations.test.ts`, `resources.test.ts`, `clients.test.ts`
- Test cases for each route:
  - List (empty, with data, pagination)
  - Create (valid, validation errors)
  - Get (found, not found)
  - Update (valid, not found)
  - Delete (success, not found)
- Use test context to bypass auth
- Use PGLite for database

**Tests:**
- ~15-20 test cases per route file
- Verify RLS isolation (can't see other org's data)

**Integration:** Validates test infrastructure works end-to-end.

**Demo:** Run `pnpm --filter @scheduling/api test` and see all location/resource/client tests pass.

---

### Step 3: Extract Repository layer for core entities

**Objective:** Create data access layer for locations, resources, clients.

**Guidance:**
- Create `apps/api/src/repositories/` directory
- Create `base.ts` with shared query helpers (pagination, withOrg wrapper)
- Create `locations.ts`, `resources.ts`, `clients.ts` repositories
- Each repository has: `findById`, `findMany`, `create`, `update`, `delete`
- Repositories accept `db` or transaction as parameter for flexibility

**Pattern:**
```typescript
export class LocationRepository {
  constructor(private db: Database) {}

  async findById(orgId: string, id: string): Promise<Location | null> {
    return withOrg(orgId, async (tx) => {
      const [result] = await tx.select()...
      return result ?? null
    })
  }
}
```

**Tests:** Unit tests for repository methods (can use existing route tests as validation).

**Integration:** Routes can be updated to use repositories.

**Demo:** Import repository in a test, call methods directly.

---

### Step 4: Extract Service layer for core entities

**Objective:** Create business logic layer for locations, resources, clients.

**Guidance:**
- Create `apps/api/src/services/` directory (note: availability-engine already exists here)
- Create `locations.ts`, `resources.ts`, `clients.ts` services
- Services handle: validation, business rules, audit logging, event emission
- Services call repositories for data access
- Refactor routes to call services (thin handlers)

**Files:**
```
apps/api/src/services/
├── locations.ts
├── resources.ts
├── clients.ts
└── availability-engine/  # existing
```

**Refactored route example:**
```typescript
// routes/locations.ts (after refactor)
export const create = authed
  .input(createLocationSchema)
  .handler(async ({ input, context }) => {
    return locationService.create(input, context)
  })
```

**Tests:** Existing route tests should still pass after refactor.

**Integration:** Establishes pattern for remaining routes.

**Demo:** Verify routes still work after refactor; code is cleaner.

---

### Step 5: Add integration tests for calendars and appointment-types

**Objective:** Test more complex CRUD routes with relationships.

**Guidance:**
- Create `calendars.test.ts`, `appointment-types.test.ts`
- Test relationship management (calendar → location, appointment-type → calendars)
- Test cascade behaviors
- Expand test factories to handle related entities

**Tests:**
- Calendar CRUD with location reference
- Appointment type CRUD with calendar and resource assignments
- Join table operations (link/unlink calendars, resources)

**Integration:** Prepares for appointments testing which depends on these entities.

**Demo:** Full test run shows calendars and appointment-types tests passing.

---

### Step 6: Add exclusion constraint migration

**Objective:** Enable database-enforced non-overlapping appointments.

**Guidance:**
- Create migration `0003_exclusion_constraint.sql`
- Enable `btree_gist` extension
- Add exclusion constraint on appointments table
- Add index for availability queries
- Update migration runner if needed

**Migration:**
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING gist (
    calendar_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status != 'cancelled');

CREATE INDEX idx_appointments_calendar_time
  ON appointments (calendar_id, start_at, end_at)
  WHERE status != 'cancelled';
```

**Tests:**
- Verify constraint prevents overlapping inserts
- Verify cancelled appointments don't block slots

**Integration:** Required before refactoring appointments route.

**Demo:** Run migration; manually test constraint in psql.

---

### Step 7: Refactor appointments route to Repository + Service

**Objective:** Refactor the largest route file (784 lines) to clean architecture.

**Guidance:**
- Create `repositories/appointments.ts`
- Create `services/appointments.ts`
- Move business logic from route to service
- Remove `SELECT FOR UPDATE` and serializable isolation
- Add exclusion constraint error handling (catch 23P01)
- Remove retry logic for serialization failures
- Keep route handlers thin (~150 lines total)

**Key changes:**
```typescript
// services/appointments.ts
async create(input, context) {
  try {
    // No locking needed - DB constraint handles it
    return await this.appointmentRepo.create({...})
  } catch (error) {
    if (error.code === '23P01') {
      throw new ORPCError('CONFLICT', { message: 'SLOT_UNAVAILABLE' })
    }
    throw error
  }
}
```

**Tests:** Existing availability and health tests should still pass.

**Integration:** Major simplification of booking code.

**Demo:** Create appointment via API; verify route still works.

---

### Step 8: Add appointments integration tests

**Objective:** Comprehensive testing of appointment lifecycle and concurrency.

**Guidance:**
- Create `appointments.test.ts`
- Test full CRUD lifecycle
- Test status transitions (scheduled → cancelled, no_show)
- Test reschedule flow
- **Critical:** Test concurrent booking
  - Two parallel requests for same slot
  - Verify exactly one succeeds
  - Verify other gets SLOT_UNAVAILABLE (409)

**Concurrent test pattern:**
```typescript
it('handles concurrent bookings correctly', async () => {
  const [result1, result2] = await Promise.all([
    appointmentService.create(sameSlotInput, ctx),
    appointmentService.create(sameSlotInput, ctx),
  ])

  const successes = [result1, result2].filter(r => !r.error)
  const conflicts = [result1, result2].filter(r => r.error?.code === 'CONFLICT')

  expect(successes).toHaveLength(1)
  expect(conflicts).toHaveLength(1)
})
```

**Tests:** ~25-30 test cases including edge cases.

**Integration:** Validates optimistic locking works correctly.

**Demo:** Run concurrent test; see exactly one booking succeed.

---

### Step 9: Optimize availability engine queries

**Objective:** Reduce database round trips from 7+ to 2.

**Guidance:**
- Modify `loadAllConfigData()` to use single query with JOINs
- Load: appointment type + calendars + rules + overrides + limits in one query
- Keep separate query for existing appointments (different date filtering)
- Update types to match new data shape
- Keep slot generation logic in JavaScript

**Query structure:**
```sql
SELECT
  at.*,
  array_agg(DISTINCT c.*) as calendars,
  array_agg(DISTINCT ar.*) as rules,
  array_agg(DISTINCT ao.*) as overrides,
  sl.*
FROM appointment_types at
LEFT JOIN appointment_type_calendars atc ON ...
LEFT JOIN calendars c ON ...
LEFT JOIN availability_rules ar ON ...
LEFT JOIN availability_overrides ao ON ...
LEFT JOIN scheduling_limits sl ON ...
WHERE at.id = $1
GROUP BY at.id, sl.id
```

**Tests:** Existing availability engine tests should pass.

**Integration:** Performance improvement for slot queries.

**Demo:** Log query count before/after; verify reduction.

---

### Step 10: Add availability route integration tests

**Objective:** Test availability query and check endpoints.

**Guidance:**
- Create/expand `availability.test.ts`
- Test weekly rules CRUD
- Test override CRUD
- Test blocked time CRUD (including RRULE)
- Test scheduling limits
- Test `getAvailableDates` and `getAvailableSlots` endpoints
- Test `checkSlot` endpoint

**Tests:**
- Rules correctly affect slot availability
- Overrides replace weekly rules
- Blocked time removes slots
- Min/max notice filtering works
- Capacity limits work

**Integration:** Full coverage of availability system.

**Demo:** All availability tests pass.

---

### Step 11: Update oxlint configuration

**Objective:** Enable stricter linting with plugins.

**Guidance:**
- Update `oxlintrc.json` with plugins and categories
- Enable as warnings first to assess impact
- Add typescript, react, import, unicorn plugins

**New config:**
```json
{
  "plugins": ["typescript", "react", "import", "unicorn"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn"
  }
}
```

**Tests:** Run `pnpm lint` to see violations.

**Integration:** Identifies code quality issues.

**Demo:** Run linter; review warning count.

---

### Step 12: Fix linting violations

**Objective:** Address all linting errors and reduce warnings.

**Guidance:**
- Fix all errors first (correctness category)
- Review and fix suspicious warnings
- Review and fix perf warnings
- Some may require refactoring
- Document any intentional suppressions

**Tests:** `pnpm lint` exits with 0.

**Integration:** Codebase meets quality standards.

**Demo:** Clean lint run with no errors.

---

### Step 13: Add RLS for org_memberships

**Objective:** Defense-in-depth for membership queries.

**Guidance:**
- Create migration `0004_user_rls.sql`
- Add `current_user_id()` function
- Add RLS policy to org_memberships
- Update `rls.ts` middleware to set user context
- Keep explicit membership check in auth middleware (hybrid approach)

**Migration:**
```sql
CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_memberships ON org_memberships
  FOR ALL USING (user_id = current_user_id());
```

**Tests:** Add RLS test for org_memberships in `rls.test.ts`.

**Integration:** Strengthens security posture.

**Demo:** Verify user can only see their own memberships via direct query.

---

### Step 14: Harden Better Auth configuration

**Objective:** Add secure cookie settings.

**Guidance:**
- Update `apps/api/src/lib/auth.ts`
- Add `advanced` configuration block
- Set secure cookies for production
- Keep CSRF protection enabled

**Tests:** Verify cookies have correct attributes in production mode.

**Integration:** Basic security hardening complete.

**Demo:** Inspect cookie in browser dev tools; verify httpOnly, secure flags.

---

### Step 15: Add api-tokens and audit route tests

**Objective:** Complete route test coverage.

**Guidance:**
- Create `api-tokens.test.ts`
  - Token creation, listing, revocation
  - Token auth flow
  - Expired token handling
- Create `audit.test.ts`
  - Audit log queries
  - Verify audit entries created on mutations

**Tests:** Full coverage of remaining routes.

**Integration:** 100% route test coverage achieved.

**Demo:** All tests pass; coverage report shows full route coverage.

---

## Summary

| Phase | Steps | Focus |
|-------|-------|-------|
| Testing Foundation | 1-2 | Infrastructure + simple routes |
| Refactor | 3-5 | Repository + Service for simple entities |
| Performance | 6-9 | Exclusion constraint + appointments refactor |
| Availability | 9-10 | Query optimization + tests |
| Quality | 11-12 | Linting enforcement |
| Security | 13-14 | RLS + auth hardening |
| Completion | 15 | Remaining test coverage |

**Estimated test files when complete:**
- `locations.test.ts`
- `resources.test.ts`
- `clients.test.ts`
- `calendars.test.ts`
- `appointment-types.test.ts`
- `appointments.test.ts`
- `availability.test.ts` (expanded)
- `api-tokens.test.ts`
- `audit.test.ts`

Plus existing: `health.test.ts`, `rls.test.ts`, `engine.test.ts`, `schemas.test.ts`
