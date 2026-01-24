# Project Summary — v2 Hardening & Improvements

## Overview

Phase 2 improvements for the scheduling platform, building on the complete v1 implementation. Focus areas: testing, code quality, performance, and security.

## Artifacts Created

```
.sop/planning-v2/
├── rough-idea.md              # Initial improvement areas
├── idea-honing.md             # 10 Q&A requirements clarifications
├── research/                  # (empty - skipped to design)
├── design/
│   └── detailed-design.md     # Architecture, patterns, migrations
├── implementation/
│   └── plan.md                # 15-step implementation plan
└── summary.md                 # This document
```

## Key Decisions

| Area          | Decision                                                   |
| ------------- | ---------------------------------------------------------- |
| Priority      | Testing → Refactor → Linting → Performance → Auth          |
| Test coverage | Full route coverage + critical path unit tests             |
| Code pattern  | Repository + Service layer separation                      |
| Linting       | Strict (correctness error, suspicious/perf warn) + plugins |
| Locking       | Optimistic with Postgres exclusion constraint              |
| Availability  | Optimize queries (2 round trips), keep JS logic            |
| RLS           | Hybrid - add to org_memberships + keep explicit check      |
| Auth          | Basic hardening (secure cookies, CSRF)                     |

## Implementation Plan

15 steps organized for incremental, demoable progress:

### Phase 1: Testing Foundation (Steps 1-2)

1. Set up test infrastructure and helpers
2. Add integration tests for simple CRUD routes

### Phase 2: Refactor (Steps 3-5)

3. Extract Repository layer for core entities
4. Extract Service layer for core entities
5. Add integration tests for calendars and appointment-types

### Phase 3: Performance (Steps 6-9)

6. Add exclusion constraint migration
7. Refactor appointments route to Repository + Service
8. Add appointments integration tests (concurrent booking)
9. Optimize availability engine queries

### Phase 4: Availability (Step 10)

10. Add availability route integration tests

### Phase 5: Quality (Steps 11-12)

11. Update oxlint configuration
12. Fix linting violations

### Phase 6: Security (Steps 13-14)

13. Add RLS for org_memberships
14. Harden Better Auth configuration

### Phase 7: Completion (Step 15)

15. Add api-tokens and audit route tests

## New Files to Create

```
apps/api/src/
├── test-utils/
│   ├── context.ts
│   ├── factories.ts
│   ├── setup.ts
│   └── index.ts
├── repositories/
│   ├── base.ts
│   ├── appointments.ts
│   ├── calendars.ts
│   ├── locations.ts
│   ├── resources.ts
│   ├── appointment-types.ts
│   ├── availability.ts
│   └── clients.ts
├── services/
│   ├── appointments.ts
│   ├── calendars.ts
│   ├── locations.ts
│   ├── resources.ts
│   ├── appointment-types.ts
│   └── clients.ts
└── routes/
    ├── locations.test.ts
    ├── resources.test.ts
    ├── clients.test.ts
    ├── calendars.test.ts
    ├── appointment-types.test.ts
    ├── appointments.test.ts
    ├── api-tokens.test.ts
    └── audit.test.ts

packages/db/src/migrations/
├── 0003_exclusion_constraint.sql
└── 0004_user_rls.sql
```

## Migrations

1. **0003_exclusion_constraint.sql** - Prevents overlapping appointments at DB level
2. **0004_user_rls.sql** - Adds user context function and RLS to org_memberships

## Next Steps

1. Review the detailed design at `.sop/planning-v2/design/detailed-design.md`
2. Review the implementation plan at `.sop/planning-v2/implementation/plan.md`
3. Begin implementation following the checklist
4. Start with Step 1: Test infrastructure setup
