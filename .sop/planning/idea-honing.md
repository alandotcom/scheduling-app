## Q1
What specific Acuity capabilities must the cloned product include in the first end-to-end demo (e.g., availability search, booking creation, rescheduling/cancelation, payments, calendar sync, client portal)?

## A1
Ignore payments and anything related to payments. Focus on appointments, appointment types, calendars, resources, and availabilities. Do not build SMS/notification infrastructure. Provide a generic notification/webhook architecture so downstream consumers can be notified later.

## Q2
Who are the primary user roles we need to support in the first version (e.g., business admin, staff/provider, client/end-user), and what authentication model do you want (single-tenant vs multi-tenant, login vs magic link, etc.)?

## A2
Admin and staff roles. API-first scheduling product. Multi-tenant: a user can have multiple orgs; each org can have multiple locations; appointment types are shared across locations; calendars exist for availability.

## Q3
For the first version, do we need any client-facing/public booking flow (e.g., unauthenticated availability search + create appointment), or is everything driven by authenticated admin/staff/API tokens?

## A3
No client-facing/public booking flow yet. Support API use cases by storing client information, but no client-facing UI.

## Q4
What are the must-have appointment lifecycle actions for v1 (e.g., create, read, update/reschedule, cancel, confirm/no-show, list by date range, assign staff/resource)?

## A4
Must-have lifecycle actions: create, read, update/reschedule, cancel, confirm/no-show, list by date range, assign staff/resource. Need Acuity-level sophistication for availability and scheduling rules (e.g., resource limits). May need to read Acuity docs to understand features.

## Q5
What specific availability and scheduling rule capabilities must be in v1 (e.g., weekly hours, date overrides, buffers, min/max notice, capacity per slot, per-resource constraints, location-specific hours, blackout dates, multi-appointment types per slot)?

## A5
All of the listed capabilities are required in v1: weekly hours, date overrides, buffers, min/max notice, capacity per slot, per-resource constraints, location-specific hours, blackout dates, multi-appointment types per slot.

## Q6
Do we need calendar sync (e.g., Google/Microsoft) in v1, or should we model external calendar integrations as a future extension only?

## A6
No calendar sync in v1; model external integrations as future extension only.

## Q7
What are the key non-functional constraints for v1 (e.g., performance targets for availability search, time zone handling expectations, data retention, audit logs, rate limits, SLA)?

## A7
Timezone aware. Default timezones can be assigned to a calendar or location; appointments can have timezones. Data retention: retain all data. Audit logs desired: either change event stream for subscribers or stored audit log (TBD).

## Q8
What datastore and deployment preferences do you have (e.g., Postgres vs SQLite, hosted vs self-hosted), and do you want to use any specific auth provider or roll your own for admin/staff/API tokens?

## A8
Postgres. Use BetterAuth and Postgres RLS to enforce tenancy.

## Q9
What frontend stack and admin/staff UI scope do you want for v1 (e.g., React/Next, minimal internal dashboard, no UI and API-only)?

## A9
React + TanStack Router (TanStack stack). Use latest shadcn/ui with Base UI (not Radix). Always use latest package versions and do not install versions from memory.

## Q10
How should “resources” be modeled in v1 (e.g., staff-only, rooms/equipment, or both), and how do resources interact with appointment types and capacity (one resource per booking vs multiple required)?

## A10
Resources can be assigned to a location and/or appointment types. Example: if an appointment type has two resources, at most two overlapping appointments for that type. If a location has two resources, each location can have two appointments of the same type using its own resources.

## Q11
Do we need recurring appointments or package/series bookings in v1, or is single appointments only?

## A11
No recurring appointments for now; no packages.

## Q12
What external API surface should v1 expose to customers/partners (e.g., public REST API similar to Acuity, or only internal tRPC for the admin UI), and do you want versioning from day one?

## A12
REST API only. Use simple path-based versioning (/v1). Consider OAuth for integrations (e.g., Zapier) to authorize as a user with permissions.

## Q13
Do you want OAuth included in v1 scope, or modeled as a planned extension (with auth model and tables designed to support it later)?

## A13
OAuth is a v1 extension but lower priority; model to support later.

## Q14
Any constraints or preferences for infra/runtime (e.g., deploy target, using Bun in prod, background jobs/queues, cache/redis)?

## A14
Use Bun runtime. Use BullMQ for background jobs/queues with a concise abstraction to allow replacement later.

## Q15
Are there any must-have admin/staff UI screens for v1 (e.g., appointment list/calendar view, availability editor, appointment type editor, locations/resources management), or can UI be minimal since API-first?

## A15
Must-have admin/staff UI screens: CRUD for appointments, calendars, appointment types, locations, resources (and any required for functionality).

## Q16
What authentication/authorization modes do we need for API access in v1 (e.g., session auth for admin UI, API tokens for server-to-server, role-based permissions beyond admin/staff)?

## A16
Yes: session auth for admin/staff UI and API tokens for server-to-server access. Role-based access limited to admin vs staff in v1. Use Postgres RLS for org tenancy separation.

## Q17
Are there any explicit success criteria or milestones for the initial release/demo (e.g., ability to create availability rules and book appointments end-to-end, performance targets, multi-org support verified)?

## A17
Success criteria: all listed features are implemented.

## Q18
Should locations/resources be managed via admin-only REST endpoints in v1, and should those endpoints live alongside the public /v1 API or under a separate /admin namespace?

## A18
Locations/resources managed via admin-only REST endpoints within /v1 (no separate /admin namespace).

## Q19
What is the monorepo structure and package organization?

## A19
pnpm monorepo with:
- `apps/admin-ui` - React + TanStack Router admin UI
- `apps/api` - Bun + Hono REST API
- Shared DTO package for types shared between frontend and backend
- tRPC types live in the DTO package for simplicity

## Q20
What ORM/database access layer should be used?

## A20
Drizzle v1 for migrations and DB access. For raw queries when needed, use the Bun SQL adapter directly.

## Q21
What testing infrastructure should be used?

## A21
- Vitest for testing (not bun:test)
- PGLite for database tests instead of a real Postgres server

## Q22
What should the shared DTO/types package be named?

## A22
`packages/dto` for shared types between frontend and backend.

## Q23
Should tRPC be used for admin-ui ↔ api communication, with REST only for external/public API?

## A23
Use oRPC instead of tRPC (https://orpc.dev/docs/openapi/getting-started). This allows generating an OpenAPI spec for external consumers while keeping type-safe client-server communication.

## Q24
Where should the Drizzle schema live?

## A24
`packages/db` - separate package for Drizzle schema, migrations, and database access.

## Q25
What shared configs and linting/formatting tools should be used?

## A25
- oxlint and oxfmt with native TypeScript parser
- Keep rules strict
- Shared configs at monorepo root

## Q26
What dev workflow tooling should be used?

## A26
Plain pnpm scripts (no turbo or other build orchestrators).

## Q27
Should BetterAuth tables be part of the same Drizzle schema?

## A27
Yes, follow BetterAuth + Drizzle best practices for integration.

## Q28
What should be used for background job queues?

## A28
- Valkey instead of Redis (Redis-compatible)
- Run in Docker container for local dev/testing via docker-compose
- Ensure no port conflicts with existing host services

## Q29
How should environment configuration be managed?

## A29
- Shared .env file at monorepo root
- Use standard-env (https://github.com/alandotcom/standard-env/) for parsing configuration

## Q30
How should the oRPC client integrate with the admin-ui?

## A30
Use `@orpc/tanstack-query` for type-safe data fetching with TanStack Query in the admin-ui.

## Q31
How should API versioning work with oRPC?

## A31
Use whatever works best for oRPC (likely route path prefixes in route definitions).

## Q32
Should we expose an OpenAPI spec endpoint?

## A32
Not yet.

## Q33
What styling/CSS approach for admin-ui?

## A33
shadcn/ui with Tailwind. Initialize with:
```
pnpm dlx shadcn@latest create --preset "https://ui.shadcn.com/init?base=base&style=nova&baseColor=neutral&theme=neutral&iconLibrary=hugeicons&font=inter&menuAccent=subtle&menuColor=default&radius=default&template=vite" --template vite
```

## Q34
Should monorepo packages use scoped names?

## A34
Yes. Use `@scheduling/dto`, `@scheduling/db`, etc.

## Q35
How should dev startup work?

## A35
- Docker-compose runs separately (just once) to start Postgres and Valkey
- `pnpm dev` at root runs api and admin-ui concurrently
- Postgres database needed for development (PGLite only for tests)

## Q36
What ID format should be used for database records?

## A36
Postgres 18 native UUID7 columns (`uuidv7()`). UUID7 provides opaque identifiers with natural sort order - not for storing business timestamps, just for sortable IDs without auto-increment integers.

