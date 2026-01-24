# Project Summary — Acuity-style Scheduling Platform

## Overview

An API-first scheduling platform matching core Acuity capabilities, built as a pnpm monorepo with type-safe end-to-end architecture.

## Artifacts Created

```
.sop/planning/
├── rough-idea.md              # Initial concept
├── idea-honing.md             # 36 Q&A requirements clarifications
├── research/
│   ├── existing-sdk.md        # Acuity SDK analysis
│   ├── acuity-api.md          # Acuity API research
│   ├── scheduling-rules.md    # Availability rule patterns
│   └── tech-stack.md          # Technology decisions (oRPC, Drizzle, etc.)
├── design/
│   ├── detailed-design.md     # Full architecture and data models
│   └── implementation-details.md  # Deep-dive code patterns
├── implementation/
│   └── plan.md                # 15-step implementation plan with checklist
└── summary.md                 # This document
```

## Architecture

### Monorepo Structure
```
scheduling-app/
├── apps/
│   ├── admin-ui/          # React + TanStack Router + shadcn/ui (nova)
│   └── api/               # Bun + Hono + oRPC
├── packages/
│   ├── db/                # @scheduling/db - Drizzle v1 schema
│   └── dto/               # @scheduling/dto - Zod schemas, oRPC types
├── docker-compose.yml     # Postgres 18 + Valkey
└── .env                   # Shared config via standard-env
```

### Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| API | Hono + oRPC (OpenAPI generation) |
| Frontend | React + TanStack Router + shadcn/ui |
| Data Fetching | @orpc/tanstack-query |
| Database | Postgres 18 (UUID7, RLS) |
| ORM | Drizzle v1 |
| Auth | BetterAuth + Drizzle adapter |
| Jobs | BullMQ + Valkey |
| Testing | Vitest + PGLite |
| Linting | oxlint (strict) |
| Formatting | oxfmt |
| Config | standard-env |

## Key Features (v1)

- **Multi-tenant** with Postgres RLS
- **Appointments** - full lifecycle (create, reschedule, cancel, no-show)
- **Availability engine** - weekly hours, overrides, blocked time, resource constraints
- **Calendars & Locations** - timezone-aware
- **Resources** - capacity-based allocation
- **Appointment Types** - duration, padding, capacity settings
- **Admin UI** - CRUD for all entities
- **Webhook framework** - event outbox for async delivery
- **API tokens** - server-to-server access

## Implementation Plan

15 steps organized for incremental, demoable progress:

1. Initialize pnpm monorepo
2. Set up docker-compose + environment
3. Configure @scheduling/db with Drizzle
4. Set up @scheduling/dto with Zod schemas
5. Bootstrap apps/api with Hono + oRPC
6. Bootstrap apps/admin-ui with shadcn
7. Implement RLS policies
8. CRUD for locations, calendars, resources, types
9. Availability rule endpoints
10. Build availability engine
11. Appointments CRUD with enforcement
12. Admin UI CRUD flows
13. Webhook/event outbox + jobs
14. API tokens + hardening
15. Audit logging + finalize

## Next Steps

1. Review the detailed design at `.sop/planning/design/detailed-design.md`
2. Review the implementation plan at `.sop/planning/implementation/plan.md`
3. Begin implementation following the checklist
