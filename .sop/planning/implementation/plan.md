# Implementation Plan

## Checklist
- [ ] Step 1: Establish project skeleton, shared types, and auth/tenancy primitives
- [ ] Step 2: Define core data model + RLS policies
- [ ] Step 3: Implement basic CRUD for locations, calendars, resources, appointment types
- [ ] Step 4: Implement availability rule storage and admin endpoints
- [ ] Step 5: Build availability engine (dates/times/check)
- [ ] Step 6: Implement appointments CRUD with rule enforcement
- [ ] Step 7: Build admin UI CRUD flows (TanStack Router)
- [ ] Step 8: Add webhook/event outbox + job processing
- [ ] Step 9: Add API tokens + external REST hardening (rate limits, pagination)
- [ ] Step 10: Add audit logging and finalize docs

## Steps

Step 1: Establish project skeleton, shared types, and auth/tenancy primitives
- Objective: Create the backend and frontend project structure with shared types and basic auth scaffolding.
- Guidance: Initialize Bun + Hono API project, add React + TanStack Router frontend, establish shared packages for DTOs and validation schemas. Add BetterAuth integration skeleton and a tenant context middleware that sets RLS session variables. Define base error envelope and API version prefix `/v1`.
- Tests: Basic auth middleware unit tests; ensure unauthenticated requests are rejected. Smoke test for `/v1/health`.
- Integration: Provides the foundation for all subsequent APIs and UI.
- Demo: Run server and load a minimal UI shell with authenticated access stubbed.

Step 2: Define core data model + RLS policies
- Objective: Create Postgres schema, migrations, and RLS policies for org isolation.
- Guidance: Implement tables for orgs, users, memberships, locations, calendars, appointment types, resources, and clients. Define RLS policies based on `current_org_id` and membership role. Add seed script for a demo org and admin user.
- Tests: SQL tests for RLS policies; confirm cross‑org access is blocked.
- Integration: Enables secure CRUD for org‑scoped resources.
- Demo: Query database as different org contexts; verify data isolation.

Step 3: Implement basic CRUD for locations, calendars, resources, appointment types
- Objective: Provide REST endpoints with validation and RLS for core admin entities.
- Guidance: Create `/v1/locations`, `/v1/calendars`, `/v1/resources`, `/v1/appointment-types` with CRUD and pagination. Add resource assignment to locations and appointment types. Use DTO validation and consistent error envelopes.
- Tests: API tests for CRUD and list filtering; RLS enforcement tests.
- Integration: These entities feed availability and appointments.
- Demo: Create a location, calendar, resources, and appointment type via API; list them in UI.

Step 4: Implement availability rule storage and admin endpoints
- Objective: Support weekly hours, overrides, blocked time, and scheduling limits.
- Guidance: Add tables for availability rules, overrides, blocked time, and scheduling limits. Implement admin endpoints to manage them. Include appointment type groups and start‑time interval rules.
- Tests: API tests for creating and reading rule sets; validation for overlapping ranges.
- Integration: These rules are inputs for availability generation.
- Demo: Configure a calendar with weekly hours + overrides + blocked time.

Step 5: Build availability engine (dates/times/check)
- Objective: Generate available dates and time slots with rule enforcement.
- Guidance: Implement a service that accepts appointment type, calendar/location, and date range. Generate candidate slots from rules + interval; apply min/max notice; apply duration + padding; filter by existing appointments; enforce resource capacities. Add endpoints mirroring Acuity flow: `/v1/availability/dates`, `/v1/availability/times`, `/v1/availability/check`.
- Tests: Unit tests for slot generation, padding, blocked time, and resource constraints. Integration tests for check‑then‑book flow.
- Integration: Used by appointment creation/reschedule endpoints.
- Demo: Fetch available dates and times for a type with resources configured.

Step 6: Implement appointments CRUD with rule enforcement
- Objective: Enable creating, rescheduling, canceling, and listing appointments with validation.
- Guidance: Implement `/v1/appointments` list/create, `/v1/appointments/:id` get/update, `/v1/appointments/:id/cancel`, `/v1/appointments/:id/reschedule`. Enforce availability checks and return structured conflict errors (`time_unavailable`). Store appointment time zone and client info. Update resource utilization and slot conflicts.
- Tests: Appointment lifecycle tests including conflict handling and reschedule flows.
- Integration: Links availability engine, appointment types, and resources.
- Demo: Create and reschedule an appointment; verify conflicts are enforced.

Step 7: Build admin UI CRUD flows (TanStack Router)
- Objective: Provide admin/staff screens for core entities.
- Guidance: Implement views and forms for appointments, calendars, appointment types, locations, resources, and availability rules. Use shared DTOs for validation; include list filters and basic inline editing.
- Tests: Minimal UI tests or Playwright smoke flows.
- Integration: UI uses REST APIs with session auth.
- Demo: Manage availability and appointments through the UI.

Step 8: Add webhook/event outbox + job processing
- Objective: Emit domain events and deliver webhooks asynchronously.
- Guidance: Implement outbox table and job processors. Emit events on appointment changes and CRUD for core entities. Provide subscription endpoints (even if limited) and webhook retry logic.
- Tests: Event emission unit tests; background job integration tests.
- Integration: Introduces asynchronous event pipeline; no SMS.
- Demo: Create appointment, verify event queued and delivered to a test endpoint.

Step 9: Add API tokens + external REST hardening (rate limits, pagination)
- Objective: Support server‑to‑server access and protect APIs.
- Guidance: Implement API token issuance/revocation, rate limiting, pagination defaults, and audit usage. Provide token scopes (admin/staff). Ensure RLS context is set for token auth.
- Tests: Token auth integration tests; rate limit tests.
- Integration: Enables external API usage.
- Demo: Use an API token to access `/v1/appointments`.

Step 10: Add audit logging and finalize docs
- Objective: Capture change history and document APIs.
- Guidance: Add audit log table, emit records for CRUD/reschedule/cancel; summarize in docs. Update README and API reference.
- Tests: Verify audit entries on mutations.
- Integration: Completes platform‑level observability.
- Demo: Show audit log entries for an appointment lifecycle.
