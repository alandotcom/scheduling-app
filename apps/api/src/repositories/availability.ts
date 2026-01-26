// Availability repository - data access layer for availability engine
// Handles appointment types, rules, overrides, blocked times, limits, and appointments

import {
  eq,
  and,
  gte,
  lte,
  ne,
  inArray,
  or,
  lt,
  gt,
  isNull,
} from "drizzle-orm";
import { DateTime } from "luxon";
import {
  appointmentTypes,
  appointmentTypeCalendars,
  appointmentTypeResources,
  availabilityRules,
  availabilityOverrides,
  blockedTime,
  schedulingLimits,
  appointments,
  resources,
} from "@scheduling/db/schema";
import type { DbClient } from "../lib/db.js";
import { setOrgContext } from "./base.js";
import type {
  AppointmentTypeData,
  AvailabilityRule,
  AvailabilityOverride,
  BlockedTimeEntry,
  MergedSchedulingLimits,
  ExistingAppointment,
  ResourceConstraint,
  ResourceData,
} from "../services/availability-engine/types.js";

export class AvailabilityRepository {
  async loadAppointmentType(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<AppointmentTypeData | null> {
    await setOrgContext(tx, orgId);
    const result = await tx
      .select()
      .from(appointmentTypes)
      .where(eq(appointmentTypes.id, id))
      .limit(1);

    if (result.length === 0) return null;

    const at = result[0]!;
    return {
      id: at.id,
      name: at.name,
      durationMin: at.durationMin,
      paddingBeforeMin: at.paddingBeforeMin,
      paddingAfterMin: at.paddingAfterMin,
      capacity: at.capacity,
    };
  }

  async getValidCalendars(
    tx: DbClient,
    orgId: string,
    appointmentTypeId: string,
    requestedCalendarIds: string[],
  ): Promise<string[]> {
    const uniqueCalendarIds = Array.from(new Set(requestedCalendarIds));
    if (uniqueCalendarIds.length === 0) {
      return [];
    }
    await setOrgContext(tx, orgId);
    const links = await tx
      .select({ calendarId: appointmentTypeCalendars.calendarId })
      .from(appointmentTypeCalendars)
      .where(
        and(
          eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
          inArray(appointmentTypeCalendars.calendarId, uniqueCalendarIds),
        ),
      );

    return links.map((link) => link.calendarId);
  }

  async loadSchedulingLimits(
    tx: DbClient,
    orgId: string,
    calendarIds: string[],
  ): Promise<MergedSchedulingLimits> {
    await setOrgContext(tx, orgId);
    // Load all limits for these calendars
    const results = await tx
      .select()
      .from(schedulingLimits)
      .where(
        or(
          inArray(schedulingLimits.calendarId, calendarIds),
          isNull(schedulingLimits.calendarId),
        ),
      );

    // Merge limits - use the most restrictive
    const merged: MergedSchedulingLimits = {
      minNoticeHours: null,
      maxNoticeDays: null,
      maxPerSlot: null,
      maxPerDay: null,
      maxPerWeek: null,
    };

    for (const limit of results) {
      if (limit.minNoticeHours != null) {
        merged.minNoticeHours =
          merged.minNoticeHours == null
            ? limit.minNoticeHours
            : Math.max(merged.minNoticeHours, limit.minNoticeHours);
      }
      if (limit.maxNoticeDays != null) {
        merged.maxNoticeDays =
          merged.maxNoticeDays == null
            ? limit.maxNoticeDays
            : Math.min(merged.maxNoticeDays, limit.maxNoticeDays);
      }
      if (limit.maxPerSlot != null) {
        merged.maxPerSlot =
          merged.maxPerSlot == null
            ? limit.maxPerSlot
            : Math.min(merged.maxPerSlot, limit.maxPerSlot);
      }
      if (limit.maxPerDay != null) {
        merged.maxPerDay =
          merged.maxPerDay == null
            ? limit.maxPerDay
            : Math.min(merged.maxPerDay, limit.maxPerDay);
      }
      if (limit.maxPerWeek != null) {
        merged.maxPerWeek =
          merged.maxPerWeek == null
            ? limit.maxPerWeek
            : Math.min(merged.maxPerWeek, limit.maxPerWeek);
      }
    }

    return merged;
  }

  async loadAvailabilityRules(
    tx: DbClient,
    orgId: string,
    calendarIds: string[],
  ): Promise<AvailabilityRule[]> {
    await setOrgContext(tx, orgId);
    const results = await tx
      .select()
      .from(availabilityRules)
      .where(inArray(availabilityRules.calendarId, calendarIds));

    return results.map((r) => ({
      id: r.id,
      calendarId: r.calendarId,
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      intervalMin: r.intervalMin,
      groupId: r.groupId,
    }));
  }

  async loadOverrides(
    tx: DbClient,
    orgId: string,
    calendarIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<AvailabilityOverride[]> {
    await setOrgContext(tx, orgId);
    const results = await tx
      .select()
      .from(availabilityOverrides)
      .where(
        and(
          inArray(availabilityOverrides.calendarId, calendarIds),
          gte(availabilityOverrides.date, startDate),
          lte(availabilityOverrides.date, endDate),
        ),
      );

    return results.map((o) => ({
      id: o.id,
      calendarId: o.calendarId,
      date: o.date,
      startTime: o.startTime,
      endTime: o.endTime,
      isBlocked: o.isBlocked,
      intervalMin: o.intervalMin,
      groupId: o.groupId,
    }));
  }

  async loadBlockedTimes(
    tx: DbClient,
    orgId: string,
    calendarIds: string[],
    startDate: string,
    endDate: string,
    timezone: string,
  ): Promise<BlockedTimeEntry[]> {
    if (calendarIds.length === 0) return [];
    await setOrgContext(tx, orgId);
    // Convert dates to UTC for database query
    const startDateTime = DateTime.fromISO(startDate, { zone: timezone })
      .startOf("day")
      .toUTC();
    const endDateTime = DateTime.fromISO(endDate, { zone: timezone })
      .endOf("day")
      .toUTC();
    const rangeStart = startDateTime.toJSDate();
    const rangeEnd = endDateTime.toJSDate();

    const overlappingResults = await tx
      .select()
      .from(blockedTime)
      .where(
        and(
          inArray(blockedTime.calendarId, calendarIds),
          lt(blockedTime.startAt, rangeEnd),
          gt(blockedTime.endAt, rangeStart),
        ),
      );

    const recurringResults = await tx
      .select()
      .from(blockedTime)
      .where(
        and(
          inArray(blockedTime.calendarId, calendarIds),
          ne(blockedTime.recurringRule, null as any),
        ),
      );

    const mergedById = new Map<string, typeof blockedTime.$inferSelect>();
    for (const row of overlappingResults) {
      mergedById.set(row.id, row);
    }
    for (const row of recurringResults) {
      mergedById.set(row.id, row);
    }

    return Array.from(mergedById.values()).map((b) => ({
      id: b.id,
      calendarId: b.calendarId,
      startAt: b.startAt,
      endAt: b.endAt,
      recurringRule: b.recurringRule,
    }));
  }

  async loadExistingAppointments(
    tx: DbClient,
    orgId: string,
    calendarIds: string[],
    startDate: string,
    endDate: string,
    timezone: string,
  ): Promise<ExistingAppointment[]> {
    await setOrgContext(tx, orgId);
    // Convert dates to UTC for database query
    const startDateTime = DateTime.fromISO(startDate, { zone: timezone })
      .startOf("day")
      .toUTC();
    const endDateTime = DateTime.fromISO(endDate, { zone: timezone })
      .endOf("day")
      .toUTC();
    const rangeStart = startDateTime.toJSDate();
    const rangeEnd = endDateTime.toJSDate();

    const results = await tx
      .select()
      .from(appointments)
      .where(
        and(
          inArray(appointments.calendarId, calendarIds),
          ne(appointments.status, "cancelled"),
          lt(appointments.startAt, rangeEnd),
          gt(appointments.endAt, rangeStart),
        ),
      );

    return results.map((a) => ({
      id: a.id,
      calendarId: a.calendarId,
      appointmentTypeId: a.appointmentTypeId,
      startAt: a.startAt,
      endAt: a.endAt,
      status: a.status,
    }));
  }

  async loadResourceConstraints(
    tx: DbClient,
    orgId: string,
    appointmentTypeId: string,
  ): Promise<ResourceConstraint[]> {
    await setOrgContext(tx, orgId);
    const results = await tx
      .select()
      .from(appointmentTypeResources)
      .where(eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId));

    return results.map((r) => ({
      resourceId: r.resourceId,
      quantityRequired: r.quantityRequired,
    }));
  }

  async loadResourceConstraintsByAppointmentTypeIds(
    tx: DbClient,
    orgId: string,
    appointmentTypeIds: string[],
  ): Promise<Map<string, ResourceConstraint[]>> {
    const uniqueAppointmentTypeIds = Array.from(new Set(appointmentTypeIds));
    if (uniqueAppointmentTypeIds.length === 0) return new Map();

    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    resourceIds: string[],
  ): Promise<ResourceData[]> {
    if (resourceIds.length === 0) return [];

    await setOrgContext(tx, orgId);
    const results = await tx
      .select()
      .from(resources)
      .where(inArray(resources.id, resourceIds));

    return results.map((r) => ({
      id: r.id,
      name: r.name,
      quantity: r.quantity,
    }));
  }
}

// Singleton instance
export const availabilityRepository = new AvailabilityRepository();
