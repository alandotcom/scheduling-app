# Existing SDK/Repo Notes

## Local docs
- `docs/acuity-appointments-availability.md` captures current notes on Acuity endpoints for appointments, availability, calendars, appointment types, and webhooks. It already lists payload shapes and error handling.

## Implemented resources
- `src/resources/appointments.ts`: list/get/create/update/cancel/reschedule + appointment types.
- `src/resources/availability.ts`: dates/times/check-times helpers.
- `src/resources/calendars.ts`: list calendars.
- `src/resources/webhooks.ts`: list/create/delete dynamic webhooks.

## Observations relevant to cloning Acuity
- The SDK focuses on appointment and availability endpoints; it does not model locations, resources, or scheduling rules beyond what Acuity’s appointment-type fields expose (padding, class size, etc.).
- Webhook utilities include signature verification helpers (see `src/webhooks.ts`) for building a generic notification architecture.

## Candidate reuse
- The endpoint semantics in `docs/acuity-appointments-availability.md` can seed our v1 REST API design.
- SDK type shapes can inform data model and DTO naming (appointments, calendars, appointment types, availability slots).

## Gaps vs target scope
- No explicit modeling for locations/resources or complex availability rules (min/max notice, blackout dates, per-resource constraints) — these will require new schema and rule engine design.
