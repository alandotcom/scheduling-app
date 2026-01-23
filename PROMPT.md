# Objective
Implement the v1 scheduling platform described in the detailed design.

# Key Requirements
- API-first, multi-tenant (users can belong to multiple orgs) with Postgres RLS.
- Bun + Hono backend, REST API under `/v1`.
- Admin/staff auth via BetterAuth; API tokens for server-to-server access.
- Core entities: appointments, appointment types, calendars, locations, resources, clients.
- Availability engine: weekly hours, overrides, blocked time, min/max notice, start-time intervals, padding, appointment-type groups, resource constraints.
- Admin/staff UI: React + TanStack Router; latest shadcn/ui with Base UI.
- Webhook/event outbox architecture (no SMS/notifications in v1).
- Use BullMQ behind a small abstraction for background jobs.

# Acceptance Criteria
- CRUD endpoints for locations, calendars, resources, appointment types.
- Availability endpoints mirror Acuity flow (dates/times/check) and enforce rules.
- Appointment lifecycle: create/read/update/reschedule/cancel/no-show with conflict handling.
- RLS verified: cross-org access blocked.
- Admin UI allows managing the above entities.

# Design Reference
See `.sop/planning/design/detailed-design.md` for full design details and constraints.
