# DTO Package — CLAUDE.md

## Commands

```bash
pnpm --filter @scheduling/dto run test        # Run schema tests (~50 tests)
pnpm --filter @scheduling/dto run typecheck   # Type-check
pnpm format                                   # Biome (run from root)
```

## Package Exports

| Path | Entry | Contents |
|------|-------|----------|
| `.` | `src/index.ts` | Re-exports all schemas |
| `./schemas` | `src/schemas/index.ts` | All Zod schemas + types |

Both paths resolve to the same schemas. Use `import { createOrgSchema } from "@scheduling/dto"`.

## Directory Structure

```
src/
  index.ts                  # Barrel: export * from "./schemas"
  schemas/
    index.ts                # Barrel for all schema files
    common.ts               # Shared validators (uuid, time, pagination)
    org.ts                  # Organization schemas
    user.ts                 # User + org membership schemas
    location.ts             # Location schemas
    calendar.ts             # Calendar schemas
    resource.ts             # Resource schemas
    appointment-type.ts     # Appointment type + join table schemas
    client.ts               # Client + history summary schemas
    appointment.ts          # Appointment + conflict + schedule schemas
    availability.ts         # Rules, overrides, blocked time, limits, feed
    api-key.ts              # API key schemas
    audit.ts                # Audit event schemas
    dashboard.ts            # Dashboard summary schema
    schemas.test.ts         # All tests (~50 cases)
```

## Schema Pattern (create / update / response)

Every entity follows a consistent pattern:

```typescript
// Base — full entity with all DB fields
export const orgSchema = z.object({ id: uuidSchema, name: z.string(), ...timestampsSchema });

// Create — input for POST (excludes id, timestamps)
export const createOrgSchema = z.object({ name: z.string().min(1).max(255) });

// Update — input for PATCH (all fields optional)
export const updateOrgSchema = z.object({ name: z.string().min(1).max(255).optional() });

// Response — output format (usually alias of base)
export const orgResponseSchema = orgSchema;

// List item — extends base with relationship counts
export const orgListItemSchema = orgSchema.extend({
  relationshipCounts: z.object({ calendars: nonNegativeIntSchema }),
});

// Type inference
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
```

**Variations by domain:**
- **Appointment:** Separate `rescheduleAppointmentSchema` (time changes are a distinct operation)
- **Appointment type:** Join table schemas for calendar/resource many-to-many
- **Client:** `clientHistorySummarySchema` with appointment counts
- **API key:** `createApiKeyResponseSchema` includes full key (returned once only)
- **Org:** Separate `updateOrgSettingsSchema` for settings-specific updates
- **Audit:** Response extends with optional `actor` relation

## Common Validators (`common.ts`)

| Validator | Type | Constraint |
|-----------|------|------------|
| `uuidSchema` | `string` | `.uuid()` |
| `timestampSchema` | `date` | `z.coerce.date()` |
| `timezoneSchema` | `string` | `.min(1)` — IANA timezone |
| `timeSchema` | `string` | `/^([01]\d\|2[0-3]):([0-5]\d)$/` — HH:MM |
| `dateSchema` | `string` | `/^\d{4}-\d{2}-\d{2}$/` — YYYY-MM-DD |
| `weekdaySchema` | `number` | `.int().min(0).max(6)` — 0=Sun |
| `positiveIntSchema` | `number` | `.int().positive()` |
| `nonNegativeIntSchema` | `number` | `.int().nonnegative()` |
| `timestampsSchema` | `object` | `{ createdAt, updatedAt }` |
| `paginationSchema` | `object` | `{ cursor?: uuid, limit?: 1-100 (default 20) }` |
| `paginatedResponseSchema(T)` | `factory` | `{ items: T[], nextCursor?, hasMore }` |

## Schema Files Reference

| File | Domain | Key Schemas | Notes |
|------|--------|-------------|-------|
| `org.ts` | Organizations | `orgSchema`, `createOrgSchema`, `updateOrgSettingsSchema` | Settings with defaults (timezone, hours, days) |
| `user.ts` | Users | `userSchema`, `orgMembershipSchema`, `orgMembershipRoleSchema` | Role enum: owner/admin/member |
| `location.ts` | Locations | `locationSchema`, `locationListItemSchema` | List items include `relationshipCounts` |
| `calendar.ts` | Calendars | `calendarSchema`, `calendarListItemSchema` | Nullable `locationId`, `appointmentsThisWeek` count |
| `resource.ts` | Resources | `resourceSchema`, `createResourceSchema` | `quantity` (default 1) |
| `appointment-type.ts` | Apt Types | `appointmentTypeSchema`, join schemas | Calendar/resource many-to-many, `quantityRequired` |
| `client.ts` | Clients | `clientSchema`, `clientHistorySummarySchema` | Email accepts empty string, history counts |
| `appointment.ts` | Appointments | `appointmentSchema`, `rescheduleAppointmentSchema`, `appointmentConflictSchema` | Status enum, conflict types, schedule events |
| `availability.ts` | Availability | Rules, overrides, blocked time, limits, feed | Overlap detection, RRULE support, 309 lines |
| `api-key.ts` | API Keys | `createApiKeyResponseSchema`, `apiKeyResponseSchema` | Full key only on create |
| `audit.ts` | Audit | `auditEventSchema`, `auditEventResponseSchema` | Before/after snapshots, actor types |
| `dashboard.ts` | Dashboard | `dashboardSummarySchema` | Aggregate counts |

## Validation Patterns

**Time range refinement:**
```typescript
.refine((d) => d.startTime < d.endTime, { message: "Start must be before end" })
```

**Overlap detection** (availability overrides):
```typescript
// hasOverlappingTimeRanges() — sorts ranges and detects overlaps
createAvailabilityOverrideSchema.refine((d) => !hasOverlappingTimeRanges(d.timeRanges))
```

**Email with empty string** (client create):
```typescript
z.string().email().optional().or(z.literal(""))
```

**Nullable vs optional:**
- `nullable` — field can be explicitly set to `null` (cleared)
- `optional` — field can be omitted (not modified)

**Record types for metadata:**
```typescript
z.record(z.string(), z.unknown()).nullable()
```

**Generic pagination:**
```typescript
paginatedResponseSchema(appointmentSchema)  // → { items: Appointment[], nextCursor?, hasMore }
```

**Variable pagination limits:**
- Standard queries: limit 1-100 (default 20)
- Time range queries: limit 1-1000 (default 500)

## Testing

Single test file: `src/schemas/schemas.test.ts` (~50 tests, ~483 lines)

- Framework: `bun:test` with `describe`/`test`/`expect`
- Uses `.safeParse()` to test accept/reject and `.parse()` to test defaults/transforms
- Organized by domain with nested describe blocks
- Covers: boundaries, refinements, defaults, enum values, format validation

```bash
pnpm --filter @scheduling/dto run test                    # All tests
pnpm --filter @scheduling/dto run test --grep "common"    # Filter by name
```

## Adding a New Schema

1. Create `src/schemas/<domain>.ts`
2. Follow the create/update/response pattern (see above)
3. Export inferred types: `export type CreateFooInput = z.infer<typeof createFooSchema>`
4. Add `export * from "./<domain>"` to `src/schemas/index.ts`
5. Add tests to `src/schemas/schemas.test.ts` covering valid/invalid/defaults
6. Run `pnpm --filter @scheduling/dto run test` and `pnpm format`
