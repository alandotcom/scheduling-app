# Detailed Design — Acuity‑style Scheduling (v1)

## Overview

Build an API‑first scheduling platform that matches core Acuity capabilities for appointments, appointment types, calendars, resources, locations, and availability with sophisticated scheduling rules. The system is multi‑tenant (users can belong to multiple orgs), uses Postgres with RLS for tenancy, runs a Bun + Hono backend, and exposes a REST API under `/v1`. Admin/staff users interact through a React + TanStack Router UI (using latest shadcn/ui with Base UI). Payments, SMS, and client‑facing booking UI are out of scope for v1. OAuth is a lower‑priority v1 extension (schema/architecture should allow it later).

## Detailed Requirements

### Functional scope
- Appointments
  - Create, read, update, reschedule, cancel, mark no‑show
  - List with filters (calendar, appointment type, client info, date/time range)
  - Assign staff/resource and enforce availability rules
  - Store client info for bookings (no public UI yet)
- Appointment types
  - CRUD (admin/staff)
  - Duration, padding before/after, capacity (class size), price optional
  - Offered across multiple locations/calendars
- Calendars
  - CRUD (admin/staff)
  - Calendar timezone and availability rules
  - Calendar‑level scheduling limits that override global defaults
- Locations
  - CRUD (admin/staff)
  - Location default timezone
- Resources
  - CRUD (admin/staff)
  - Assignable to locations and appointment types
  - Capacity enforcement for concurrent appointments
- Availability
  - Weekly recurring hours
  - Per‑date overrides and temporary repeating hours
  - Blocked time (single, multi‑day, recurring)
  - Min/max notice windows
  - Start‑time interval rule
  - Appointment type groups (availability + limits by group)
  - Slot generation that respects duration + padding
  - Resource constraints and capacity per slot
- Webhook/notification architecture
  - Provide generic event emission on key entity changes
  - Allow future webhook subscription API
  - No SMS/notifications in v1

### Non‑functional
- Multi‑tenant data isolation enforced via Postgres RLS
- Timezone‑aware data model; default timezone on location and calendar; appointment can override
- REST API under `/v1` with simple path versioning
- Admin/staff auth via BetterAuth (session) + API tokens for server‑to‑server
- Bun runtime; BullMQ for background jobs (behind an abstraction)

## Architecture Overview

```mermaid
flowchart LR
  subgraph UI[Admin/Staff UI]
    A[React + TanStack Router]
  end

  subgraph API[Bun + Hono API]
    B[REST /v1]
    C[tRPC (internal type-sharing)]
    D[Auth (BetterAuth)]
    E[Availability Engine]
    F[Job Queue Abstraction]
  end

  subgraph DB[Postgres]
    G[(Tenant Data + RLS)]
  end

  subgraph Infra[Background Services]
    H[BullMQ Workers]
  end

  A --> B
  B --> D
  B --> E
  B --> G
  E --> G
  F --> H
```

## Components and Interfaces

### API Layer (Hono)
- REST endpoints grouped under `/v1`
- DTO validation at edge (Zod or equivalent)
- Uses tRPC types for shared schemas where helpful
- Auth middleware attaches user/org context and sets RLS session variables

### Auth & Tenancy
- BetterAuth for session auth (admin/staff UI)
- API tokens for server‑to‑server access
- Postgres RLS enforces org isolation
- Middleware sets `app.current_org_id` (or similar) for each request

### Availability Engine
- Input: appointment type, calendar(s), date range, timezone
- Output: available dates and times, plus "check" capability
- Core steps:
  1. Load calendar availability rules (weekly + overrides + blocked)
  2. Apply scheduling limits (min/max notice, intervals, per‑slot caps)
  3. Generate candidate slots based on duration + padding
  4. Filter by existing appointments
  5. Filter by resource capacity/constraints
- Supports appointment type groups for availability/lens

### Webhook/Notification Framework
- Domain events emitted on create/update/cancel/reschedule for appointments and on CRUD for calendars/types/resources/locations
- Event outbox table for eventual webhook delivery
- Deferred actual webhook subscription API for v1 extension

### Background Jobs
- Abstract `JobQueue` interface with BullMQ implementation
- Jobs: webhook delivery, audit log compaction, availability cache refresh

### UI (Admin/Staff)
- CRUD screens for appointments, appointment types, calendars, locations, resources
- Availability editor with weekly hours + overrides + blocked time
- Appointment list view with filters; calendar view optional later

## Data Models

### Core tables
- `orgs`
- `users`
- `org_memberships` (role: admin/staff)
- `locations` (org_id, name, timezone)
- `calendars` (org_id, location_id, name, timezone)
- `appointment_types` (org_id, name, duration_min, padding_before_min, padding_after_min, capacity, metadata)
- `appointment_type_calendars` (appointment_type_id, calendar_id)
- `appointment_type_resources` (appointment_type_id, resource_id, quantity_required)
- `resources` (org_id, location_id?, name, quantity)
- `availability_rules` (calendar_id, weekday, start_time, end_time, interval_min, group_id?)
- `availability_overrides` (calendar_id, date, start_time, end_time, interval_min, group_id?)
- `blocked_time` (calendar_id, start_at, end_at, recurring_rule?)
- `scheduling_limits` (scope: global | calendar | group, min_notice_hours, max_notice_days, max_per_slot, max_per_day, max_per_week)
- `appointments` (org_id, calendar_id, appointment_type_id, client_id, start_at, end_at, timezone, status, notes)
- `clients` (org_id, first_name, last_name, email, phone)
- `appointment_audit_events` (org_id, appointment_id, action, payload)
- `event_outbox` (org_id, type, payload, status, next_attempt_at)

### Relationships
- One org → many locations, calendars, appointment types, resources
- One location → many calendars/resources
- One appointment type ↔ many calendars
- One appointment type ↔ many resources
- One calendar → many availability rules/overrides/blocked times

## Error Handling
- API returns structured errors (code, message, details)
- 400 for validation errors
- 401/403 for auth/tenancy
- 404 for missing resources
- 409/422 for conflict/time unavailable

## Testing Strategy
- Unit tests for availability engine (slot generation, overrides, limits, resources)
- Integration tests for appointment create/reschedule/cancel enforcing rules
- RLS tests to verify org isolation
- API tests for CRUD endpoints and filters

## Appendices

### Technology Choices
- Bun + Hono for API speed and TS‑first ergonomics
- tRPC for shared types between backend and UI
- Postgres with RLS for strong tenancy isolation
- BullMQ behind abstraction for background jobs

### Research Findings (Summary)
- Acuity availability flow: dates → times → check‑times → book
- Scheduling rules: weekly hours, overrides, blocked time, min/max notice, intervals, padding, appointment type groups
- Resources are internal, quantity‑based, cross‑calendar within same timezone
- Webhooks use HMAC of raw payload and emit appointment events

### Alternative Approaches Considered
- Pure tRPC API (rejected; need REST for external consumers)
- Single‑tenant architecture (rejected; must support multi‑org)

## Implementation Status (as of February 7, 2026)

### Database Schema: Complete
All core scheduling tables are implemented with Postgres 18 `uuidv7()` IDs. `group_id` columns exist on availability/scheduling-limit records for future appointment-type grouping features.

### API Layer: ~90% Complete

#### Fully Implemented
- **Core CRUD**: Appointments, Appointment Types, Calendars, Locations, Resources, Clients
- **Availability Management**: Weekly rules, per-date overrides, blocked time, scheduling limits
- **Availability Engine**: `getAvailableDates`, `getAvailableSlots`, `checkSlot` with rule/resource/capacity enforcement
- **Dashboard Summary API**: Real metrics (appointments, clients, calendars, attention counts)
- **API Tokens**: Admin token management with hashing, prefix, expiration
- **Audit Logging**: Entity audit trail with before/after snapshots
- **Event Emission**: Domain events written to outbox and queued through BullMQ
- **Auth**: BetterAuth session auth + API token auth for server-to-server

#### Partially Implemented
- **Appointment editing workflow**: Rescheduling is implemented; update is intentionally narrow (notes/client fields). No dedicated confirm endpoint/workflow.

#### Not Yet Implemented
- **Webhook Subscriptions API**: Events emit to outbox but there are no subscription management endpoints
- **HMAC Webhook Signing**: Webhook delivery exists but request signing is not implemented
- **Appointment Type Groups API**: Schema has `group_id`, but there are no group-management endpoints

### Admin UI: ~85% Complete

#### Fully Implemented
- **Authentication**: Login/logout and session flow
- **Navigation**: Authenticated app shell and section routing
- **Calendars**: CRUD + weekly availability editor + date overrides + blocked time
- **Appointment Types**: CRUD + calendar linking + resource linking
- **Locations**: CRUD with timezone
- **Resources**: CRUD with quantity and location
- **Clients**: CRUD (list/create/edit/delete) with detail panel
- **Dashboard**: Live summary metrics and today's schedule data
- **Appointments**: List/schedule views, filters, create flow, reschedule, cancel, no-show
- **Settings**: Organization settings (timezone, business hours/days, notifications)

#### Partially Implemented
- **Settings scope**: Org settings are implemented, but user profile and API token management UI are not yet present

### Background Jobs: Partially Implemented

#### Implemented
- BullMQ with Valkey backend
- Event processor worker
- Webhook delivery worker with retries/rate limit
- Graceful shutdown and stale outbox recovery

#### Not Yet Implemented
- **Webhook subscription fan-out** in worker processing
- **HMAC webhook signature generation**
- **Audit log compaction job**
- **Availability cache refresh job**

### Testing: In Progress
- RLS isolation tests are implemented
- API tests cover core CRUD and availability routes
- Availability engine unit tests are implemented
- Webhook subscription/signing and remaining background job behaviors still need dedicated tests

### Next Milestones
1. **Implement webhook subscriptions end-to-end**
   - Add `webhook_subscriptions` schema + migration (org-scoped, event filters, secret, status)
   - Add CRUD endpoints for subscription management
   - Update event worker to fan out outbox events to matching subscriptions
2. **Add HMAC-signed webhook delivery**
   - Sign raw payload with per-subscription secret
   - Include signature + timestamp headers and verification docs for consumers
   - Add retry/error classification for 4xx vs 5xx responses
3. **Ship appointment type groups API**
   - Define group entity/schema and org-scoped routes
   - Wire `group_id` flows across availability rules, overrides, and scheduling limits
   - Add API and service tests for group-aware slot calculations
4. **Finish remaining background jobs**
   - Implement audit-log compaction worker/job
   - Implement availability cache refresh worker/job (or remove from scope if not needed)
   - Add operational metrics and runbook notes for all workers
