# Objective

Implement the v1 scheduling platform as a pnpm monorepo with type-safe end-to-end architecture.

# Key Requirements

**Architecture:**
- pnpm monorepo: `apps/api`, `apps/admin-ui`, `packages/db`, `packages/dto`
- Scoped package names: `@scheduling/db`, `@scheduling/dto`
- Bun runtime for API server

**API (apps/api):**
- Hono + oRPC (not tRPC) for type-safe REST with OpenAPI generation
- BetterAuth with Drizzle adapter for session auth
- API tokens for server-to-server access (v1 extension)
- Postgres 18 with RLS for multi-tenant isolation
- BullMQ + Valkey for background jobs

**Database (packages/db):**
- Drizzle v1 for schema and migrations
- Postgres 18 native UUID7 for all IDs (`uuidv7()`)
- PGLite for testing (no Postgres server needed in tests)

**Frontend (apps/admin-ui):**
- React + TanStack Router
- shadcn/ui nova style with Base UI
- `@orpc/tanstack-query` for data fetching
- Tailwind CSS

**Tooling:**
- Vitest for testing
- oxlint + oxfmt (strict rules, native TS parser)
- standard-env for configuration
- Docker Compose for Postgres 18 + Valkey

**Core Entities:**
- Orgs, users, org memberships (admin/staff roles)
- Locations, calendars (with timezones)
- Appointment types (duration, padding, capacity)
- Resources (quantity-based)
- Clients, appointments
- Availability rules, overrides, blocked time, scheduling limits

**Availability Engine:**
- Weekly hours, date overrides, blocked time (with RRULE)
- Min/max notice, per-slot/day/week caps
- Resource capacity constraints
- Padding between appointments

# Acceptance Criteria

- [ ] Monorepo structure with working `pnpm dev` command
- [ ] Docker Compose starts Postgres 18 + Valkey without port conflicts
- [ ] CRUD endpoints for all entities via oRPC
- [ ] RLS enforces org isolation (verified by tests)
- [ ] Availability endpoints: dates/times/check with full rule enforcement
- [ ] Appointment lifecycle with race condition handling
- [ ] Admin UI for managing all entities
- [ ] Tests pass using PGLite

# Design Reference

- `.sop/planning/design/detailed-design.md` - Architecture, schema, tech stack
- `.sop/planning/design/implementation-details.md` - Code patterns for oRPC, auth, RLS, availability engine, testing
- `.sop/planning/implementation/plan.md` - 15-step implementation checklist

---

# Phase 2: v2 Hardening & Improvements

## Objective

Implement phase 2 improvements: testing, code refactoring, linting, performance optimization, and auth hardening. Follow the 15-step implementation plan.

## Key Requirements

- **Testing:** Full route integration test coverage using PGLite and test helpers that bypass auth
- **Refactor:** Extract Repository + Service layers from heavy route files (appointments, availability, appointment-types)
- **Linting:** Enable oxlint plugins (typescript, react, import, unicorn) with strict categories
- **Performance:** Add Postgres exclusion constraint for appointments; optimize availability engine to 2 queries
- **Auth:** Add RLS to org_memberships; harden Better Auth with secure cookie settings

## Priority Order

1. Testing
2. Code Refactor
3. Linting
4. Performance
5. Auth

## v2 Acceptance Criteria

- [ ] All API routes have integration tests
- [ ] Route files are thin (<200 lines), business logic in services
- [ ] `pnpm lint` passes with no errors
- [ ] Concurrent booking test verifies exactly one booking succeeds
- [ ] Availability engine makes ≤2 database round trips
- [ ] Cookies have httpOnly, secure (production), sameSite attributes

## v2 Design Reference

- **Design:** `.sop/planning-v2/design/detailed-design.md`
- **Plan:** `.sop/planning-v2/implementation/plan.md`
- **Requirements:** `.sop/planning-v2/idea-honing.md`

## Quick Reference

### Test Infrastructure Pattern
```typescript
// apps/api/src/test-utils/context.ts
export function createTestContext(orgId: string, userId: string, role = 'admin'): Context
```

### Repository Pattern
```typescript
// apps/api/src/repositories/appointments.ts
export class AppointmentRepository {
  findById(orgId: string, id: string): Promise<Appointment | null>
  create(input: CreateAppointmentInput): Promise<Appointment>
}
```

### Service Pattern
```typescript
// apps/api/src/services/appointments.ts
export class AppointmentService {
  constructor(repo: AppointmentRepository, engine: AvailabilityEngine, ...)
  create(input, context): Promise<Appointment>  // catches 23P01 exclusion violation
}
```

### Exclusion Constraint
```sql
ALTER TABLE appointments ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING gist (calendar_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
  WHERE (status != 'cancelled');
```
