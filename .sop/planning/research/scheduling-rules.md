# Scheduling Rules & Resources (Acuity help docs)

## Availability modeling
- Availability can be set per calendar using repeating weekly hours. Days left blank are not bookable, and you can override a specific day without changing the default repeating hours. Hours can be entered as ranges or discrete start times (or a combination). These patterns imply we should support:
  - Weekly recurring availability
  - Per-date overrides
  - Temporary repeating hours with an end date
  - Multiple intervals per day
  - Both range-based and discrete time-slot entry
- Availability can also be split into appointment-type groups with their own availability and scheduling limits (used when certain services are only offered at specific times). If multiple groups are available at the same time on a single calendar, once a client books a slot, only appointments from the same group are offered for that time slot.

## Scheduling limits
Acuity has global scheduling limits and calendar-specific scheduling limits. When the same setting exists in both places, the calendar limit overrides the global limit for that calendar. Limits control:
- Minimum hours before an appointment that clients can book
- Maximum days into the future clients can book
- Minimum time before clients can reschedule/cancel
- Whether clients can reschedule/cancel and edit intake forms (global-only setting)
- Start time intervals for slot generation
- Appointments per time slot (calendar/availability-group only)
- Maximum appointments (calendar/availability-group only, with per-day or per-week variants)

Additional behavior:
- Slot generation excludes start times that can’t fit the appointment duration within available hours, and the chosen interval determines the sequence of offered start times.

## Blocked time and padding
- Blocked time temporarily removes slots from the client-facing scheduler; admins can override blocked time when booking internally.
- Blocking time does not remove existing appointments in that window; it prevents new bookings in the blocked range.
- Blocked time can be single-date, multi-day, or weekly recurring.
- Acuity supports padding between appointments as another availability constraint. Padding applies before/after appointments and consumes real scheduling time; if a slot can’t fit duration + padding, it’s not offered.

## Resources
Resources limit how many appointments can happen concurrently across calendars:
- Resources are internal-only; clients never see them.
- Each resource has a quantity and is assigned to appointment types that require it.
- If an appointment type requires multiple resources, all of them need to be available for clients to book. Resources can be stacked across appointment types.
- Resource availability is evaluated across calendars, but resources don’t work for calendars in different time zones.
- Resources are intended for interchangeable shared assets; if you need clients to choose a specific room/person, the guidance is to use separate calendars instead of resources.
- Resources are considered in-use for the appointment duration plus padding.

## Time zones
- Acuity sets a business time zone globally and can default the scheduler to business or client time zone. Per-calendar time zones are supported on higher plans.

## Look busy / minimize gaps (optional behavior)
- “Look busy” can hide a percentage of available slots per day to appear more in-demand.
- “Minimize gaps” clusters appointments together.
- These settings apply across all calendars in the account.

## Availability evaluation flow (conceptual)

```mermaid
flowchart TD
  A[Calendar availability rules] --> B[Slot generation (intervals + duration fit)]
  C[Overrides/blocked time] --> B
  D[Scheduling limits (min/max notice)] --> B
  E[Resource constraints] --> F[Slot filtering]
  B --> F
  F --> G[Available time slots]
```

## Implications for our v1 design
- Data model should separate calendar-level availability rules and overrides from scheduling limits.
- Availability computation should apply slot generation first (intervals + duration fit), then overlay overrides/blocked time and limits, then apply resource constraints.
- Resources should be scoped to orgs and optionally locations, and evaluated in a timezone-consistent manner (same timezone requirement).

## Sources
- https://help.acuityscheduling.com/hc/en-us/articles/27016341585421-Setting-and-editing-your-basic-availability
- https://help.acuityscheduling.com/hc/en-us/articles/16676880363277-Setting-repeating-hours-in-Acuity-Scheduling
- https://help.acuityscheduling.com/hc/en-us/articles/27016559462285-Using-appointment-type-groups
- https://help.acuityscheduling.com/hc/en-us/articles/27141282369037-Using-global-and-calendar-scheduling-limits
- https://help.acuityscheduling.com/hc/en-us/articles/16676943309205-Blocking-off-time
- https://help.acuityscheduling.com/hc/en-us/articles/16676926857101-Adding-padding-between-appointments
- https://help.acuityscheduling.com/hc/en-us/articles/16676949567757-Using-resources-to-limit-bookings
- https://help.acuityscheduling.com/hc/en-us/articles/16676924846733-Controlling-start-time-intervals-in-Acuity-Scheduling
- https://help.acuityscheduling.com/hc/en-us/articles/16676883635725-Managing-availability-and-calendars
- https://help.acuityscheduling.com/hc/en-us/articles/25481348949773-Look-busy-and-minimize-gaps
- https://help.acuityscheduling.com/hc/en-us/articles/16676881708941-Setting-time-zones-in-Acuity-Scheduling
