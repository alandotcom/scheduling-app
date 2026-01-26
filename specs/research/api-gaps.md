# API Readiness & Gaps (Against Redesign)

## What Exists Now (From Code)
- Appointments list query accepts `startDate`/`endDate` (date-only), plus filters for calendar/type/client/status.
  - DTO: `packages/dto/src/schemas/appointment.ts`
  - Route: `apps/api/src/routes/appointments.ts`
- Reschedule validates availability and returns conflicts as error strings with a `CONFLICT` code.
  - Service: `apps/api/src/services/appointments.ts`
- Availability management is split into rules, overrides, blocked time endpoints.
  - Routes: `apps/api/src/routes/availability.ts`
- No bulk appointment status update endpoint found.
- No consolidated availability feed endpoint found.
- No client history summary endpoint found (audit exists but is separate).

## Gaps vs. Redesign Prework
- **Time-range appointments endpoint** (start/end timestamps for day/week): not present.
- **Merged availability feed** (rules + overrides + blocked time in one response): not present.
- **Reschedule conflict metadata** (structured type + override flag): not present; currently string errors.
- **Bulk appointment status updates** with per-item results: not present.
- **Client history summary** endpoint: not present.

## Data Flow Needed for Schedule View
```mermaid
flowchart LR
  UI[Schedule Grid] --> A[Appointments time-range query]
  UI --> B[Availability feed (rules + overrides + blocked time)]
  UI --> C[Client history / detail fields]
  UI --> D[Bulk status update]
  UI --> E[Reschedule w/ conflict metadata]
```
