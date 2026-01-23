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
- Output: available dates and times, plus “check” capability
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
