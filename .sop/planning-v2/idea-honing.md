# Idea Honing - v2 Improvements

This document captures the requirements clarification process for the v2 hardening phase.

---

## Q1: Priority Ordering

Of the six focus areas identified, which order of priority makes sense for your needs?

1. Testing (route integration tests, concurrent booking tests)
2. Code Refactor (service layer extraction from heavy route files)
3. Auth/RLS (lean on RLS, remove redundant checks)
4. Better Auth Hardening (security config, cookies, rate limiting)
5. Stricter Linting (oxlint plugins and categories)
6. Performance (optimistic locking, DB-side availability calculation)

**A1:**

1. Testing
2. Code Refactor
3. Linting
4. Performance
5. Auth (combining RLS simplification + Better Auth hardening)

---

## Q2: Testing Scope

For the testing focus area, what level of coverage are you aiming for?

**A2:** Full route coverage - Integration tests for all API routes plus critical path unit tests.

This includes:

- Integration tests for all CRUD routes (appointments, calendars, locations, resources, appointment-types, availability, clients, api-tokens, audit)
- Unit tests for availability engine (already exists, may need expansion)
- Concurrent booking scenario tests
- Does NOT include Playwright e2e for admin UI

---

## Q3: Code Refactor - Service Layer Pattern

For extracting business logic from route files, what pattern do you prefer?

**A3:** Repository + Service pattern

Structure:

- `repositories/` - Data access layer (queries, mutations, no business logic)
- `services/` - Business logic layer (validation, orchestration, calls repositories)
- `routes/` - Thin handlers that call services and handle HTTP concerns

Example:

```
src/
  repositories/
    appointments.ts    # findById, create, updateStatus, listWithFilters
  services/
    appointments.ts    # createAppointment (validates, checks availability, calls repo)
  routes/
    appointments.ts    # HTTP handlers, input parsing, calls service
```

---

## Q4: Linting Strictness

How strict should the oxlint configuration be?

**A4:** Strict

Configuration:

- Categories: `correctness` (error), `suspicious` (warn), `perf` (warn)
- Plugins: `typescript`, `react`, `import`, `unicorn`
- Fix existing violations before enabling as errors

---

## Q5: Performance - Locking Strategy

For appointment booking, should we switch from pessimistic to optimistic locking?

**A5:** Optimistic with exclusion constraint

Implementation:

- Add Postgres exclusion constraint on appointments table preventing overlapping (calendar_id, tstzrange(start_at, end_at))
- Remove `SELECT FOR UPDATE` on calendar row
- Use READ COMMITTED isolation (default)
- Catch exclusion violation (23P01) and return SLOT_UNAVAILABLE error
- Remove retry logic for serialization failures (no longer needed)

---

## Q6: Performance - Availability Engine

Should we push availability slot calculation to the database?

**A6:** Optimize queries only

Approach:

- Keep slot generation logic in JavaScript (easier to maintain/test)
- Reduce database round trips from 7+ to 1-2 queries
- Use single query with JOINs to load appointment type + rules + overrides + limits
- Separate query for existing appointments (needed for conflict checking)
- Add database indexes for common query patterns

---

## Q7: Auth - RLS Simplification

Should we add RLS to org_memberships and remove the explicit membership check in auth middleware?

**A7:** Hybrid approach

Implementation:

- Add RLS to org_memberships with policy: `USING (user_id = current_user_id())`
- Add `current_user_id()` SQL function similar to `current_org_id()`
- Keep lightweight membership check in auth middleware for clear error messages ("Not a member of this org")
- RLS serves as defense-in-depth, not sole enforcement

---

## Q8: Better Auth Hardening

What level of Better Auth security hardening do you need?

**A8:** Basic hardening

Configuration:

- Secure cookies: `httpOnly: true`, `secure: true` (production), `sameSite: 'lax'`
- CSRF protection: Keep enabled (default)
- Skip for now: Auth rate limiting, password policy, IP tracking, email verification

Can add more hardening in future iteration.

---

## Q9: Test Infrastructure

How should tests authenticate for API route testing?

**A9:** Test helpers that bypass auth

Implementation:

- Create `createTestContext(orgId, userId, role)` helper
- Inject context directly into route handlers
- No session/token management in tests
- Faster test execution
- Already have `seedTestOrg()` for creating test org/user/membership

---

## Q10: Anything else to consider?

Are there any other constraints, requirements, or considerations we should capture before moving to research/design?

**A10:** No additional requirements. Ready to proceed.

---

## Requirements Summary

### Priority Order

1. Testing
2. Code Refactor
3. Linting
4. Performance
5. Auth

### Key Decisions

| Area           | Decision                                                   |
| -------------- | ---------------------------------------------------------- |
| Test coverage  | Full route coverage + critical path unit tests             |
| Code pattern   | Repository + Service layer separation                      |
| Linting        | Strict (correctness error, suspicious/perf warn) + plugins |
| Locking        | Optimistic with exclusion constraint                       |
| Availability   | Optimize queries, keep JS logic                            |
| RLS            | Hybrid - add RLS + keep explicit check for error messages  |
| Auth hardening | Basic (secure cookies, CSRF)                               |
| Test auth      | Test helpers that bypass auth                              |
