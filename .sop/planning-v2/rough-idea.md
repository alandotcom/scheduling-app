# Scheduling App v2 - Hardening & Improvements

## Overview

Phase 2 improvements for the scheduling platform focusing on quality, security, performance, and maintainability. The core v1 functionality is complete (14/15 steps). This phase addresses gaps identified during review.

## Focus Areas

### 1. Testing

- Backend is very light on tests (only 6 test files)
- No integration tests for CRUD routes
- No concurrent booking scenario tests
- No Playwright e2e tests for admin UI

### 2. Code Refactor

- Heavy route files (appointments.ts 784L, availability.ts 887L, appointment-types.ts 579L)
- Business logic mixed with route definitions
- Duplicate helper functions across files (e.g., `verifyCalendarAccess`)
- Need service layer extraction

### 3. Auth - RLS Simplification

- Currently validating org membership on every request in auth middleware
- RLS already enforces org isolation at database level
- Redundant check - should lean on RLS to enforce policies
- Need to add RLS to `org_memberships` table

### 4. Better Auth Best Practices

- Missing `advanced` security config (secure cookies, CSRF, IP tracking)
- `requireEmailVerification: false` in production
- No rate limiting on auth endpoints
- No password policy (min length)
- Missing cookie attributes (httpOnly, secure, sameSite)

### 5. Stricter Linting

- oxlint config only has 6 basic rules
- Not using built-in plugins (typescript, react, unicorn, import)
- Not using category system (correctness, suspicious, perf)

### 6. Performance

- **Locking**: Currently using pessimistic locking (`SELECT FOR UPDATE` on calendar) + serializable isolation
  - Blocks ALL concurrent bookings for same calendar
  - Should use optimistic locking with database exclusion constraint
- **Availability Engine**: Makes 7+ database round trips
  - Should push slot calculation to database
  - Use `generate_series()` and single query with JOINs
- **Missing indexes**: No exclusion constraint for non-overlapping appointments

## Current State Reference

- Implementation plan: `.sop/planning/implementation/plan.md` (14/15 complete)
- Detailed design: `.sop/planning/design/detailed-design.md`
- Route files: `apps/api/src/routes/`
- Auth config: `apps/api/src/lib/auth.ts`
- Linting config: `oxlintrc.json`
