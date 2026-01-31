# Luxon Migration: Full Frontend Adoption

## Summary

Migrate all date/time handling in `admin-ui` from native JavaScript `Date` API to Luxon for consistency with the backend API (which already uses Luxon v3.7.2).

## Current State

| Layer | Library | Status |
|-------|---------|--------|
| Backend (API) | Luxon v3.7.2 | ✅ Already using |
| Frontend (admin-ui) | Native Date | ❌ Needs migration |
| Shared (DTO) | Zod schemas | No change needed |

## Why Migrate?

1. **Consistency** - Same API across frontend and backend
2. **Immutability** - No more mutation bugs from `setDate()`, `setMonth()`
3. **Timezone support** - First-class IANA timezone handling
4. **Cleaner API** - `dt.plus({ days: 7 })` vs `date.setDate(date.getDate() + 7)`
5. **Better formatting** - Built-in locale-aware formatting

## Phase 1: Setup & Core Utilities

### Step 1.1: Add Dependencies

```bash
pnpm --filter @scheduling/admin-ui add luxon@^3.7.2
pnpm --filter @scheduling/admin-ui add -D @types/luxon
```

### Step 1.2: Create Central Date Utilities

Create `apps/admin-ui/src/lib/date-utils.ts` with:

```typescript
import { DateTime } from "luxon";

// Formatting
export function formatDateISO(dt: DateTime): string;      // YYYY-MM-DD
export function formatTimeHHMM(dt: DateTime): string;     // HH:mm
export function formatDisplayDate(str: string): string;   // "Jan 15, 2025"
export function formatDisplayDateTime(dt: DateTime | string): string; // "Jan 15, 2025, 2:30 PM"
export function formatTimeDisplay(dt: DateTime | string): string;     // "2:30 PM"

// Week navigation (Sunday-based)
export function getWeekStart(date: Date): DateTime;
export function getWeekDays(weekStart: DateTime): DateTime[];
export function formatWeekRange(weekStart: DateTime): string; // "Jan 15 - 21, 2025"

// Calendar generation
export function getMonthDays(year: number, month: number): DateTime[];

// Comparisons
export function isSameDay(dt1: DateTime, dt2: DateTime): boolean;
export function isToday(dt: DateTime): boolean;
export function isPast(dt: DateTime): boolean;

// Parsing
export function parseDateParam(str: string): DateTime;
export function parseISO(str: string): DateTime;

// Utilities
export function getUserTimezone(): string;
export function toJSDate(dt: DateTime): Date;
export function fromJSDate(date: Date): DateTime;
```

### Step 1.3: Migrate availability/utils.ts

Update existing functions to use Luxon internally while keeping same exports for backward compatibility during migration.

## Phase 2: Migrate Hooks

**File:** `apps/admin-ui/src/hooks/use-schedule-appointments.ts`

Changes:
- `getWeekStart()` → use `DateTime.weekday % 7` for Sunday-based weeks
- `weekEnd` calculation → `DateTime.plus({ days: 7 })`
- `formatDateParam()` → `DateTime.toISODate()`
- `parseDateParam()` → `DateTime.fromISO()`

## Phase 3: Migrate Availability Components

| File | Key Changes |
|------|-------------|
| `mini-calendar.tsx` | Month navigation with `plus({ months: 1 })` |
| `date-overrides-editor.tsx` | Date parsing with `DateTime.fromISO()` |
| `blocked-time-editor.tsx` | Tomorrow: `DateTime.now().plus({ days: 1 })` |

## Phase 4: Migrate Appointments Components

| File | Key Changes |
|------|-------------|
| `schedule-grid.tsx` | Week days generation, event positioning, date headers |
| `schedule-event.tsx` | Time formatting |
| `appointment-detail.tsx` | Date/time display formatting |
| `appointments-list.tsx` | DateTime formatting |

## Phase 5: Migrate Pages

| File | Key Changes |
|------|-------------|
| `appointments/index.tsx` | Week navigation (prev/next/today) |
| `index.tsx` (Dashboard) | Today/week range calculations |
| Other pages | Minimal - just formatting calls |

## Phase 6: Migrate appointment-modal.tsx

- Calendar generation with Luxon
- Month navigation with `plus/minus({ months: 1 })`
- Keep `Date` at form input boundaries for compatibility

## Common Pattern Transformations

| Native Date | Luxon |
|-------------|-------|
| `new Date()` | `DateTime.now()` |
| `new Date(year, month, day)` | `DateTime.local(year, month + 1, day)` |
| `date.getFullYear()` | `dt.year` |
| `date.getMonth()` | `dt.month - 1` (0-indexed compat) |
| `date.getDate()` | `dt.day` |
| `date.setDate(date.getDate() + n)` | `dt.plus({ days: n })` |
| `date.toISOString().split('T')[0]` | `dt.toISODate()` |
| `date.toLocaleDateString(locale, opts)` | `dt.toLocaleString(opts)` |
| `date.toLocaleTimeString()` | `dt.toLocaleString(DateTime.TIME_SIMPLE)` |
| `date.getDay()` | `dt.weekday % 7` (Sunday=0) |
| `date.getHours()` | `dt.hour` |
| `date.getMinutes()` | `dt.minute` |

## Files to Modify (in order)

1. `apps/admin-ui/src/lib/date-utils.ts` (NEW)
2. `apps/admin-ui/src/components/availability/utils.ts`
3. `apps/admin-ui/src/hooks/use-schedule-appointments.ts`
4. `apps/admin-ui/src/components/availability/mini-calendar.tsx`
5. `apps/admin-ui/src/components/availability/date-overrides-editor.tsx`
6. `apps/admin-ui/src/components/availability/blocked-time-editor.tsx`
7. `apps/admin-ui/src/components/appointments/schedule-grid.tsx`
8. `apps/admin-ui/src/components/appointments/schedule-event.tsx`
9. `apps/admin-ui/src/components/appointments/appointment-detail.tsx`
10. `apps/admin-ui/src/components/appointments/appointments-list.tsx`
11. `apps/admin-ui/src/routes/_authenticated/appointments/index.tsx`
12. `apps/admin-ui/src/routes/_authenticated/index.tsx`
13. `apps/admin-ui/src/components/appointment-modal.tsx`
14. `apps/admin-ui/src/components/appointment-drawer.tsx`
15. `apps/admin-ui/src/components/client-drawer.tsx`
16. Other pages with minimal date formatting

## Luxon Quick Reference

### Creating DateTimes

```typescript
import { DateTime } from "luxon";

DateTime.now()                           // Current moment
DateTime.local(2025, 1, 15)              // Jan 15, 2025 (months are 1-indexed!)
DateTime.fromJSDate(date)                // From JS Date
DateTime.fromISO("2025-01-15")           // From ISO string
DateTime.fromISO("2025-01-15T14:30:00")  // With time
```

### Arithmetic (immutable)

```typescript
dt.plus({ days: 7 })          // Add 7 days
dt.minus({ months: 1 })       // Subtract 1 month
dt.startOf("day")             // Midnight
dt.startOf("week")            // Monday (Luxon default)
dt.endOf("month")             // Last moment of month
```

### Formatting

```typescript
dt.toISODate()                // "2025-01-15"
dt.toISO()                    // "2025-01-15T14:30:00.000-05:00"
dt.toFormat("HH:mm")          // "14:30"
dt.toFormat("h:mm a")         // "2:30 PM"
dt.toLocaleString({ month: "short", day: "numeric" }) // "Jan 15"
```

### Comparisons

```typescript
dt1 < dt2                     // Works with comparison operators
dt1.hasSame(dt2, "day")       // Same calendar day
dt1.hasSame(dt2, "month")     // Same month
dt.diff(other, "days").days   // Difference in days
```

### Timezone Handling

```typescript
DateTime.now().setZone("America/New_York")
DateTime.fromISO("2025-01-15", { zone: "UTC" })
dt.toLocal()                  // Convert to local timezone
dt.zoneName                   // "America/New_York"
```

## Verification

After each file:
1. `pnpm typecheck` - verify types compile
2. `pnpm lint` - check for issues
3. `pnpm format` - format code

End-to-end testing:
1. Start dev server: `pnpm dev`
2. Test schedule view week navigation (prev/next/today)
3. Test appointment modal calendar month navigation
4. Test date display in appointment list and detail views
5. Test availability editor date pickers
6. Test blocked time creation with dates

Edge cases to verify:
- Month boundary transitions (Jan 31 → Feb 1)
- Year boundary transitions (Dec → Jan)
- Week spanning two months displays correctly
- Daylight saving time transitions

## Reference

- [Luxon Documentation](https://moment.github.io/luxon/)
- Backend usage example: `apps/api/src/services/availability-engine/engine.ts`
