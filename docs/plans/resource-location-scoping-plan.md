# Resource Location Scoping Plan

Status: Implementation Plan (not scheduled)
Last Updated: 2026-06-21
Owners: Product, `@scheduling/admin-ui`, `@scheduling/api`
Related: `docs/plans/README.md`, `apps/api/src/services/availability-engine/`

## 1. Purpose

Resolve a confusing and currently-broken interaction: an appointment type is org-global, a resource can be tied to a location, and a type can require a resource while also being offered on a calendar at a different location. Today the system lets you build this configuration with no guidance, and the booking engine then ignores resource location entirely, so a booking at Location B silently consumes a resource that lives at Location A and can block bookings there.

This plan fixes the behavior and makes the configuration legible in the UI. It is a UX-led change with one supporting backend change. There is no schema or DTO migration.

## 2. Decision Summary

### 2.1 The model: shared OR location-bound

A resource is one of two things, set explicitly by the author:

1. **Org-wide** (`location_id IS NULL`): a shared pool usable by any calendar at any location (e.g. a roaming interpreter pool, a mobile device cart).
2. **Location-bound** (`location_id = X`): physically lives at one location and only applies to bookings there (e.g. a treatment room, an MRI machine).

### 2.2 Enforcement contract (the booking-engine fix)

When evaluating a booking on calendar `C` at location `L(C)`:

1. Org-wide required resources are always enforced.
2. A location-bound required resource at location `R` is enforced **only if** `R == L(C)`.
3. A location-bound required resource where `R != L(C)` (or where the calendar has no location) is **skipped** for that booking.

This is also the fix for the silent cross-location consumption: location-bound resources can no longer leak capacity across sites.

### 2.3 Authoring behavior: skip + warn (not block)

A location-bound resource attached to a type that is offered on a different-location calendar is a **soft warning**, not a hard block. The warning tells the author that bookings on that calendar will not reserve the resource, so the skipped requirement is never silent. Booking is still allowed (a virtual or no-resource-needed calendar remains valid).

## 3. Scope

### 3.1 In scope

1. Location-aware resource enforcement in the availability/booking engine.
2. Relabel the org-wide option in the resource editor and list so the choice is explicit.
3. Location badges in the appointment-type Resources tab.
4. Mismatch warnings + coherence summary in the appointment-type Calendars tab.
5. Seed one org-wide and one location-bound sample resource so the behavior is visible.
6. Tests for the cross-location enforcement case.

### 3.2 Out of scope

1. Schema or DTO changes (`resources.location_id` is already nullable; create/update DTOs already accept it).
2. The "resource as a kind, resolved per location" model (a larger redesign; explicitly rejected for now).
3. Hard-blocking bookings when a required resource is absent at a location.
4. A reusable shared LocationPicker component (the inline `Select` pattern is fine until it appears a third time).

## 4. Backend: location-aware enforcement

Today resource location is dropped on the floor. `ResourceData` carries no location, and `loadResourcesData` selects by id only.

Files:

1. `apps/api/src/services/availability-engine/types.ts` — add `locationId: string | null` to the `ResourceData` interface.
2. `apps/api/src/repositories/availability.ts` — `loadResourcesData` must also select `resources.locationId`.
3. `apps/api/src/services/availability-engine/slot-evaluation.ts` and `engine.ts` — `checkResourceCapacity` must receive the booking calendar's `locationId` and apply the §2.2 contract: skip any location-bound resource whose location differs from the calendar's location before counting capacity.

The calendar's `location_id` is already loaded during availability data assembly; thread it into the resource check. No new query shape beyond adding one selected column.

## 5. UI Surface 1: resource editor (make org-wide explicit)

File: `apps/admin-ui/src/routes/_authenticated/resources.tsx` (`ResourceForm`, location `Select`).

1. Relabel the null option from `"No location"` to `"Org-wide (all locations)"`.
2. In the list/table (`components/resources/resources-list-presentation.tsx`), render org-wide resources as an `Org-wide` badge instead of `"-"`.
3. Optional: a one-line helper under the field — "Org-wide resources can be used by any location's calendars."

## 6. UI Surface 2: appointment-type Resources tab

File: `apps/admin-ui/src/routes/_authenticated/appointment-types/components/resources-tab.tsx`.

1. Show a location badge (`Org-wide` or the location name) on each attached resource and in the picker.
2. Sort org-wide resources first so shared pools read as the default.
3. The picker already fetches all resources; it needs `locationId` in the projection (confirm the list endpoint returns it).

## 7. UI Surface 3: appointment-type Calendars tab (the mismatch warning)

File: `apps/admin-ui/src/routes/_authenticated/appointment-types/components/calendars-tab.tsx`.

Inputs available in the editor: the type's required resources (with `locationId`) and its linked calendars (with `locationId`).

Mismatch rule for a calendar at location `L`:

> A calendar is mismatched if the type requires at least one location-bound resource whose location `!= L` (or `L` is null/org-wide calendar). For each such resource, that requirement will be skipped for bookings on this calendar.

Render per calendar row:

1. The calendar's location.
2. If mismatched, an inline warning naming the resource(s) and the consequence in booking terms, plus inline fixes: **Make {resource} org-wide** and **Remove** (the calendar).

Example:

```
Resources required:  Interpreter pool · Org-wide      Room 3 · Location A

Calendars offering this type
─────────────────────────────────────────────────────
  Dr. Lee — Downtown        Location A      ✓
  Dr. Patel — Eastside      Location B      ⚠ Bookings here won't
                                             reserve Room 3 (Location A)
                                             [Make Room 3 org-wide] [Remove]
─────────────────────────────────────────────────────
Offered at Location A, Location B · 1 calendar can't reserve Room 3
```

A coherence summary line sits below the list so the author sees the whole picture without switching tabs.

## 8. Seed

File: `apps/api/src/scripts/seed.ts` — currently deletes resources and inserts none.

Add per org: one org-wide resource (e.g. "Interpreter pool", quantity 2, no location) and one location-bound resource (e.g. "Room 3", quantity 1, at the first location), and wire one of them into an existing appointment type's `appointment_type_resources` so the warning and enforcement are demonstrable.

## 9. Tests

File: `apps/api/src/routes/appointments.write.test.ts` already has location-scoped resource tests; the gap is the mismatch case.

1. Booking on a calendar at Location B does **not** consume a Location-A-bound resource (capacity at A is untouched; booking at B succeeds even if the A resource is full).
2. Booking on a calendar at Location A **does** consume the Location-A-bound resource (existing behavior preserved).
3. An org-wide resource is enforced regardless of the booking calendar's location.

## 10. Sequencing

1. Backend enforcement contract (§4) + tests (§9). This is the correctness fix and stands alone.
2. Resource editor relabel + list badge (§5).
3. Resources tab badges (§6).
4. Calendars tab warning + summary (§7).
5. Seed sample resources (§8).
