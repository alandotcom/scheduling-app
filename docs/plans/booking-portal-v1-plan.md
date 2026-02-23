# Booking Portal V1 Plan

Status: Implementation Plan (not scheduled)  
Last Updated: 2026-02-23  
Owners: Product, `@scheduling/admin-ui`, `@scheduling/api`, `@scheduling/db`, `@scheduling/dto`  
Related: `docs/ARCHITECTURE.md`, `docs/plans/README.md`

## 1. Purpose

Define the v1 architecture and implementation plan for a public booking portal that enables external users to book, cancel, and reschedule appointments without using the authenticated admin UI.

This document is both:

1. The architecture decision record for v1.
2. The implementation plan to execute when scheduled.

## 2. Decision Summary

### 2.1 Chosen v1 architecture

Use a centralized, path-based booking surface on one domain with org + portal slugs:

`/booking/{orgSlug}/{portalSlug}`

### 2.2 Locked product decisions

1. Path-only in v1; no org subdomains in v1.
2. No customer custom domains in v1 (phase 2+).
3. Portal scope is single-calendar only.
4. Each portal exposes a selected subset of appointment types for that calendar.
5. Per-portal auth mode: `required | optional | disabled`.
6. Portal client auth is separate from admin auth.
7. Maintain global client identity with org-local client projections/links.
8. Default auth methods: Phone OTP, Email OTP, Google, Apple (show configured methods only).
9. If portal auth mode is `required` and no auth methods are configured, portal is unavailable.
10. Booking management uses signed links (no OTP) with 24-hour TTL.
11. Support both cancellation and rescheduling in v1.
12. Respect existing calendar confirmation behavior.
13. Intake fields are fixed core fields only in v1.
14. Timezone UX is browser default + manual switcher.
15. No new anti-abuse features in v1.

## 3. Scope

### 3.1 In scope for v1

1. Public portal page and step flow.
2. Public APIs for portal metadata, availability, booking, and manage-link actions.
3. Portal configuration model and internal management surfaces.
4. Separate client auth model and sessioning.
5. Cancel/reschedule by manage link.

### 3.2 Out of scope for v1

1. Customer-owned custom domains.
2. Org subdomain routing.
3. Passkeys.
4. Custom booking form question builder.
5. New anti-abuse features (rate limiting/CAPTCHA work is deferred).

## 4. Public Interfaces

### 4.1 Frontend routes

1. `/booking/$orgSlug/$portalSlug`
2. `/booking/$orgSlug/$portalSlug/manage`

### 4.2 Public API namespace

Create unauthenticated public endpoints under `/public/v1/booking`:

1. `GET /public/v1/booking/{orgSlug}/{portalSlug}`  
   Returns portal metadata, auth mode/capabilities, selected appointment types, and timezone defaults.
2. `GET /public/v1/booking/{orgSlug}/{portalSlug}/dates`
3. `GET /public/v1/booking/{orgSlug}/{portalSlug}/times`
4. `POST /public/v1/booking/{orgSlug}/{portalSlug}/book`
5. `POST /public/v1/booking/{orgSlug}/{portalSlug}/auth/start`
6. `POST /public/v1/booking/{orgSlug}/{portalSlug}/auth/verify`
7. `POST /public/v1/booking/{orgSlug}/{portalSlug}/manage-link/request`
8. `GET /public/v1/booking/manage/{token}`
9. `POST /public/v1/booking/manage/{token}/cancel`
10. `POST /public/v1/booking/manage/{token}/reschedule`

### 4.3 DTO/contracts

Add booking-portal DTOs for:

1. Portal metadata and capabilities.
2. Public availability date/time query+response.
3. Booking create input+response.
4. Auth start/verify contracts.
5. Manage link request and manage token actions.

## 5. Data Model Plan

### 5.1 Portal config tables

1. `booking_portals`
   - `id`, `org_id`, `slug`, `name`, `calendar_id`, `auth_mode`, `is_active`
   - light branding fields (`logo_url`, `accent_color`, `headline`, `subheadline`)
2. `booking_portal_appointment_types`
   - `portal_id`, `appointment_type_id`

Constraints:

1. Unique `(org_id, slug)`
2. Unique `(portal_id, appointment_type_id)`

### 5.2 Dedicated client-auth tables

Create separate portal-client auth tables (do not reuse admin auth tables):

1. `portal_users`
2. `portal_sessions`
3. `portal_accounts`
4. `portal_verifications`

### 5.3 Global identity + org projection

1. `client_identities` (global)
2. `client_identity_org_links` (`client_identity_id`, `org_id`, `client_id`)

Linking rule in v1:

1. Match existing org client by verified phone or exact email.
2. If none exists, create org client and create identity link.
3. Org-local client remains the source of truth for org operations.

### 5.4 Manage token table

1. `booking_manage_tokens`
   - `token_hash`, `appointment_id`, `channel`, `expires_at`, `used_at`, metadata
2. TTL: 24 hours.

## 6. UX Flow Specification

### 6.1 Adaptive step order by auth mode

`required` mode:

1. Landing
2. Auth
3. Appointment type (if more than one)
4. Date/time
5. Profile completion (missing fields only)
6. Confirmation + submit

`optional` mode:

1. Landing
2. Type/date/time
3. Auth/profile (allow guest continue)
4. Confirmation + submit

`disabled` mode:

1. Landing
2. Type/date/time
3. Guest profile
4. Confirmation + submit

### 6.2 Form and contact rules

1. Require first name + last name + one contact method (email or phone).
2. If phone is used for auth/identity path, require phone OTP verification.
3. Email verification is not required in v1.

### 6.3 Availability and slot conflicts

1. Reuse existing availability engine/service internally.
2. On slot race/conflict at submit:
   - show “slot no longer available”
   - refresh times for selected date/type/timezone
   - keep user in the flow with selections preserved

### 6.4 Booking management UX

1. Manage via signed email/SMS link.
2. Allow view + cancel + reschedule.
3. Expired link path supports requesting a new link.

## 7. Backend Implementation Phases

### Phase 0: Contracts and schemas

1. Define DTO contracts in `@scheduling/dto`.
2. Add/extend DB schema tables in `packages/db/src/schema/index.ts`.
3. Update seed paths if any new required defaults are introduced.

Exit criteria:

1. Types compile.
2. DB push/seed paths remain valid.

### Phase 1: Portal config and resolver

1. Implement repositories/services for portal config and type mapping.
2. Implement public portal resolver by `orgSlug + portalSlug`.
3. Add capability checks for auth methods.

Exit criteria:

1. Portal metadata endpoint returns complete and validated payloads.

### Phase 2: Public availability + booking

1. Implement public availability endpoints wired to existing availability engine.
2. Implement booking transaction:
   - validate portal/type scope
   - resolve/create identity + client projection link
   - create appointment through existing appointment logic
3. Preserve conflict and exclusion-constraint behavior.

Exit criteria:

1. End-to-end public booking succeeds for happy path and known conflict scenarios.

### Phase 3: Public auth + management links

1. Implement dedicated client auth flows for OTP/social providers.
2. Enforce portal-unavailable behavior for `required` mode with zero methods.
3. Implement manage-link request/validate/cancel/reschedule endpoints.

Exit criteria:

1. Signed-link manage flows work with expiry semantics.
2. Cancel and reschedule behave correctly with existing scheduling checks.

### Phase 4: Admin management UX + rollout

1. Add portal management UI in authenticated admin settings area.
2. Add portal preview/link copy + basic status diagnostics (configured providers).
3. Roll out behind an internal enablement mechanism.

Exit criteria:

1. Internal org can create/manage portals and complete full public flow.

## 8. Testing Plan

### 8.1 API tests

1. Portal resolution (valid, invalid, inactive).
2. Auth-mode/capability behavior.
3. Availability scope enforcement.
4. Booking success and slot conflict handling.
5. Manage token validity/expiry and cancel/reschedule actions.
6. Client identity linking behavior and org isolation.

### 8.2 UI tests

1. Adaptive step order by auth mode.
2. Type step hidden when one selected type.
3. Timezone selector behavior and persistence.
4. Slot conflict recovery UX.
5. Manage-link success/expiry/retry flows.

### 8.3 End-to-end smoke

1. Required-auth portal booking.
2. Optional-auth guest booking.
3. Disabled-auth guest booking.
4. Cancel + reschedule from manage link.

## 9. Rollout and Follow-ups

### 9.1 v1 rollout

1. Internal dogfood portal(s).
2. Limited org rollout.
3. Observe conversion, failures, and support load.

### 9.2 Post-v1 roadmap candidates

1. Subdomain routing and custom domains.
2. Passkeys.
3. Anti-abuse controls (rate limits/CAPTCHA).
4. Enhanced intake/custom questions.

## 10. Assumptions

1. Existing appointment status model remains unchanged for v1.
2. Existing availability engine remains the source of slot truth.
3. Existing RLS/org patterns remain authoritative for org-local entities.

## 11. Package Task Checklist

### 11.1 `packages/db`

1. Add `booking_portals` and `booking_portal_appointment_types` tables to `packages/db/src/schema/index.ts`.
2. Add `client_identities` and `client_identity_org_links` tables to `packages/db/src/schema/index.ts`.
3. Add dedicated portal auth tables (`portal_users`, `portal_sessions`, `portal_accounts`, `portal_verifications`) to `packages/db/src/schema/index.ts`.
4. Add `booking_manage_tokens` table to `packages/db/src/schema/index.ts`.
5. Add indexes and unique constraints described in section 5.
6. Update `packages/db/src/relations.ts` for new table relationships.
7. Update `packages/db/src/migrations/20260208064434_init/migration.sql` and snapshot files to include all schema changes (per active dev policy).
8. Update `packages/db/src/seed.ts` only if required by new non-null/default constraints.
9. Add DB tests for identity linking table constraints and token expiry query behavior.

### 11.2 `packages/dto`

1. Add `packages/dto/src/schemas/booking-portal.ts` with public request/response contracts.
2. Export new schemas/types from `packages/dto/src/schemas/index.ts`.
3. Export from package root `packages/dto/src/index.ts`.
4. Add DTO tests for required/optional field behavior and auth mode enums.

### 11.3 `apps/api`

1. Add public booking router module(s) under `apps/api/src/routes/` for `/public/v1/booking/*`.
2. Mount new public booking routes in `apps/api/src/index.ts` without `authMiddleware`.
3. Add repository modules for portal config resolution and identity-link lookups/creates.
4. Add service modules:
   - portal resolver service
   - public availability service wrapper
   - booking orchestration service
   - manage-link token service
5. Wire booking creation to existing appointment service conflict checks and DB exclusion handling.
6. Add auth capability detection for phone OTP/email OTP/Google/Apple method availability.
7. Enforce `required` auth mode behavior when no methods are configured.
8. Add cancel/reschedule actions via manage token endpoints.
9. Add route/service tests covering:
   - portal resolution and inactive behavior
   - availability scoping
   - booking happy path + slot race
   - manage link TTL/expiry
   - cancel/reschedule flows

### 11.4 `apps/admin-ui`

1. Add public booking route files under `apps/admin-ui/src/routes/booking.$orgSlug.$portalSlug*.tsx`.
2. Build booking flow container with adaptive step order by auth mode.
3. Build appointment type step that only renders when more than one type exists.
4. Build date/time step with timezone selector (browser default + manual override).
5. Build auth/profile step supporting:
   - required mode blocking
   - optional mode guest continue
   - disabled mode guest-only
6. Build confirmation step and slot conflict recovery UX.
7. Build manage booking page for token-based view/cancel/reschedule.
8. Add authenticated portal management UI under settings area.
9. Add integration tests for adaptive flow, slot conflict refresh, and manage-link actions.

### 11.5 Cross-package integration sequence

1. Complete DB + DTO changes first.
2. Implement API public endpoints second.
3. Implement admin-ui public flow and settings UI third.
4. Run full verification commands:
   - `pnpm format`
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
