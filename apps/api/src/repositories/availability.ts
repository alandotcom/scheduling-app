// Availability repository - data access layer for availability engine
// Handles appointment types, rules, overrides, blocked times, limits, and appointments

import { eq, and, gte, lte, ne, inArray, or, isNull, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import {
  appointmentTypes,
  appointmentTypeCalendars,
  appointmentTypeResources,
  calendars,
  availabilityRules,
  availabilityOverrides,
  blockedTime,
  schedulingLimits,
  appointments,
  orgs,
  resources,
} from "@scheduling/db/schema";
import type { OrgScopedTx } from "../lib/db.js";
import type {
  AppointmentTypeData,
  AvailabilityRule,
  AvailabilityOverride,
  BlockedTimeEntry,
  MergedSchedulingLimits,
  ExistingAppointment,
  ResourceConstraint,
  ResourceData,
  ResourceUsageAppointment,
} from "../services/availability-engine/types.js";

export class AvailabilityRepository {
  async loadAppointmentType(
    tx: OrgScopedTx,
    id: string,
  ): Promise<AppointmentTypeData | null> {
    const [appointmentType] = await tx
      .select({
        id: appointmentTypes.id,
        name: appointmentTypes.name,
        durationMin: appointmentTypes.durationMin,
        paddingBeforeMin: appointmentTypes.paddingBeforeMin,
        paddingAfterMin: appointmentTypes.paddingAfterMin,
        capacity: appointmentTypes.capacity,
      })
      .from(appointmentTypes)
      .where(eq(appointmentTypes.id, id))
      .limit(1);

    return appointmentType ?? null;
  }

  async getValidCalendar(
    tx: OrgScopedTx,
    appointmentTypeId: string,
    requestedCalendarId: string,
  ): Promise<string | null> {
    const [link] = await tx
      .select({ calendarId: appointmentTypeCalendars.calendarId })
      .from(appointmentTypeCalendars)
      .where(
        and(
          eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
          eq(appointmentTypeCalendars.calendarId, requestedCalendarId),
        ),
      )
      .limit(1);

    return link?.calendarId ?? null;
  }

  async loadCalendarTimezone(
    tx: OrgScopedTx,
    calendarId: string,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ timezone: calendars.timezone })
      .from(calendars)
      .where(eq(calendars.id, calendarId))
      .limit(1);

    return row?.timezone ?? null;
  }

  async loadCalendarSlotInterval(
    tx: OrgScopedTx,
    calendarId: string,
  ): Promise<number | null> {
    const [row] = await tx
      .select({ slotIntervalMin: calendars.slotIntervalMin })
      .from(calendars)
      .where(eq(calendars.id, calendarId))
      .limit(1);

    return row?.slotIntervalMin ?? null;
  }

  async loadOrgDefaultTimezone(tx: OrgScopedTx): Promise<string | null> {
    // orgs is a core table without RLS; scope the read to the current org via
    // the session context that withOrg already established.
    const [row] = await tx
      .select({ defaultTimezone: orgs.defaultTimezone })
      .from(orgs)
      .where(eq(orgs.id, sql`current_org_id()`))
      .limit(1);

    return row?.defaultTimezone ?? null;
  }

  async loadSchedulingLimits(
    tx: OrgScopedTx,
    calendarId: string,
  ): Promise<MergedSchedulingLimits> {
    const results = await tx
      .select()
      .from(schedulingLimits)
      .where(
        or(
          eq(schedulingLimits.calendarId, calendarId),
          isNull(schedulingLimits.calendarId),
        ),
      );

    const orgDefault =
      results.find((limit) => limit.calendarId == null) ?? null;
    const calendarOverride =
      results.find((limit) => limit.calendarId === calendarId) ?? null;

    return {
      minNoticeMinutes:
        calendarOverride?.minNoticeMinutes ??
        orgDefault?.minNoticeMinutes ??
        null,
      maxNoticeDays:
        calendarOverride?.maxNoticeDays ?? orgDefault?.maxNoticeDays ?? null,
      maxPerSlot:
        calendarOverride?.maxPerSlot ?? orgDefault?.maxPerSlot ?? null,
      maxPerDay: calendarOverride?.maxPerDay ?? orgDefault?.maxPerDay ?? null,
      maxPerWeek:
        calendarOverride?.maxPerWeek ?? orgDefault?.maxPerWeek ?? null,
    };
  }

  async loadAvailabilityRules(
    tx: OrgScopedTx,
    calendarId: string,
  ): Promise<AvailabilityRule[]> {
    return tx
      .select({
        id: availabilityRules.id,
        calendarId: availabilityRules.calendarId,
        weekday: availabilityRules.weekday,
        startTime: availabilityRules.startTime,
        endTime: availabilityRules.endTime,
        groupId: availabilityRules.groupId,
      })
      .from(availabilityRules)
      .where(eq(availabilityRules.calendarId, calendarId));
  }

  async loadOverrides(
    tx: OrgScopedTx,
    calendarId: string,
    startDate: string,
    endDate: string,
  ): Promise<AvailabilityOverride[]> {
    return tx
      .select({
        id: availabilityOverrides.id,
        calendarId: availabilityOverrides.calendarId,
        date: availabilityOverrides.date,
        timeRanges: availabilityOverrides.timeRanges,
        groupId: availabilityOverrides.groupId,
      })
      .from(availabilityOverrides)
      .where(
        and(
          eq(availabilityOverrides.calendarId, calendarId),
          gte(availabilityOverrides.date, startDate),
          lte(availabilityOverrides.date, endDate),
        ),
      );
  }

  async loadBlockedTimes(
    tx: OrgScopedTx,
    calendarId: string,
    startDate: string,
    endDate: string,
    timezone: string,
  ): Promise<BlockedTimeEntry[]> {
    // Convert dates to UTC for database query
    const startDateTime = DateTime.fromISO(startDate, { zone: timezone })
      .startOf("day")
      .toUTC();
    const endDateTime = DateTime.fromISO(endDate, { zone: timezone })
      .endOf("day")
      .toUTC();
    const rangeStart = startDateTime.toJSDate();
    const rangeEnd = endDateTime.toJSDate();

    return tx
      .select({
        id: blockedTime.id,
        calendarId: blockedTime.calendarId,
        startAt: blockedTime.startAt,
        endAt: blockedTime.endAt,
        recurringRule: blockedTime.recurringRule,
      })
      .from(blockedTime)
      .where(
        and(
          eq(blockedTime.calendarId, calendarId),
          or(
            sql`tstzrange(${blockedTime.startAt}, ${blockedTime.endAt}, '[)') && tstzrange(${rangeStart}, ${rangeEnd}, '[)')`,
            sql`${blockedTime.recurringRule} is not null`,
          ),
        ),
      );
  }

  async loadExistingAppointments(
    tx: OrgScopedTx,
    calendarId: string,
    startDate: string,
    endDate: string,
    timezone: string,
  ): Promise<ExistingAppointment[]> {
    // Convert dates to UTC for database query
    const startDateTime = DateTime.fromISO(startDate, { zone: timezone })
      .startOf("day")
      .toUTC();
    const endDateTime = DateTime.fromISO(endDate, { zone: timezone })
      .endOf("day")
      .toUTC();
    const rangeStart = startDateTime.toJSDate();
    const rangeEnd = endDateTime.toJSDate();

    return tx
      .select({
        id: appointments.id,
        calendarId: appointments.calendarId,
        appointmentTypeId: appointments.appointmentTypeId,
        startAt: appointments.startAt,
        endAt: appointments.endAt,
        status: appointments.status,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.calendarId, calendarId),
          ne(appointments.status, "cancelled"),
          sql`tstzrange(${appointments.startAt}, ${appointments.endAt}, '[)') && tstzrange(${rangeStart}, ${rangeEnd}, '[)')`,
        ),
      );
  }

  async loadResourceConstraints(
    tx: OrgScopedTx,
    appointmentTypeId: string,
  ): Promise<ResourceConstraint[]> {
    return tx
      .select({
        resourceId: appointmentTypeResources.resourceId,
        quantityRequired: appointmentTypeResources.quantityRequired,
      })
      .from(appointmentTypeResources)
      .where(eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId));
  }

  async loadResourceConstraintsByAppointmentTypeIds(
    tx: OrgScopedTx,
    appointmentTypeIds: string[],
  ): Promise<Map<string, ResourceConstraint[]>> {
    const uniqueAppointmentTypeIds = Array.from(new Set(appointmentTypeIds));
    if (uniqueAppointmentTypeIds.length === 0) return new Map();

    const results = await tx
      .select()
      .from(appointmentTypeResources)
      .where(
        inArray(
          appointmentTypeResources.appointmentTypeId,
          uniqueAppointmentTypeIds,
        ),
      );

    const map = new Map<string, ResourceConstraint[]>();
    for (const row of results) {
      const list = map.get(row.appointmentTypeId) ?? [];
      list.push({
        resourceId: row.resourceId,
        quantityRequired: row.quantityRequired,
      });
      map.set(row.appointmentTypeId, list);
    }

    return map;
  }

  async loadResourcesData(
    tx: OrgScopedTx,
    resourceIds: string[],
  ): Promise<ResourceData[]> {
    if (resourceIds.length === 0) return [];

    return tx
      .select({
        id: resources.id,
        name: resources.name,
        quantity: resources.quantity,
        locationId: resources.locationId,
      })
      .from(resources)
      .where(inArray(resources.id, resourceIds));
  }

  // Existing appointments whose type requires any of the given resources, across
  // EVERY calendar in the org, with the calendar's location. The in-memory
  // resource check scopes these per resource the same way the trigger does, so
  // the slot picker matches booking-time enforcement.
  //
  // Org scoping is via RLS: appointments and calendars are RLS-protected and the
  // resourceIds were themselves loaded under this org-scoped tx, so the IN list
  // can't reference another org. appointment_type_resources is reached only
  // through those RLS-protected joins.
  //
  // selectDistinct collapses the join fan-out: an appointment whose type
  // requires two of the requested resources matches two atr rows but projects to
  // identical columns. Without DISTINCT it would appear twice and be
  // double-counted (checkResourceCapacity re-derives quantity per resource but
  // iterates the list once per appearance). The unique (appointmentTypeId,
  // resourceId) index guarantees no further duplication.
  //
  // The [startDate, endDate] window must dominate every candidate slot span —
  // which it does, since slots are generated within that range, so any
  // appointment overlapping a slot also overlaps the window and is loaded.
  async loadResourceUsageAppointments(
    tx: OrgScopedTx,
    resourceIds: string[],
    startDate: string,
    endDate: string,
    timezone: string,
  ): Promise<ResourceUsageAppointment[]> {
    if (resourceIds.length === 0) return [];

    const rangeStart = DateTime.fromISO(startDate, { zone: timezone })
      .startOf("day")
      .toUTC()
      .toJSDate();
    const rangeEnd = DateTime.fromISO(endDate, { zone: timezone })
      .endOf("day")
      .toUTC()
      .toJSDate();

    return tx
      .selectDistinct({
        id: appointments.id,
        calendarId: appointments.calendarId,
        calendarLocationId: calendars.locationId,
        appointmentTypeId: appointments.appointmentTypeId,
        startAt: appointments.startAt,
        endAt: appointments.endAt,
      })
      .from(appointments)
      .innerJoin(
        appointmentTypeResources,
        eq(
          appointmentTypeResources.appointmentTypeId,
          appointments.appointmentTypeId,
        ),
      )
      .innerJoin(calendars, eq(calendars.id, appointments.calendarId))
      .where(
        and(
          inArray(appointmentTypeResources.resourceId, resourceIds),
          ne(appointments.status, "cancelled"),
          sql`tstzrange(${appointments.startAt}, ${appointments.endAt}, '[)') && tstzrange(${rangeStart}, ${rangeEnd}, '[)')`,
        ),
      );
  }

  async loadCalendarLocationId(
    tx: OrgScopedTx,
    calendarId: string,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ locationId: calendars.locationId })
      .from(calendars)
      .where(eq(calendars.id, calendarId))
      .limit(1);

    return row?.locationId ?? null;
  }
}

// Singleton instance
export const availabilityRepository = new AvailabilityRepository();
