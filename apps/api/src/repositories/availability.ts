// Availability repository - data access layer for availability engine
// Handles appointment types, rules, overrides, blocked times, limits, and appointments

import { eq, and, gte, lte, ne, inArray, or, isNull, sql } from "drizzle-orm";
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

    const calendarIds: string[] = [];
    for (const link of links) {
      calendarIds.push(link.calendarId);
    }
    return calendarIds;
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
    return tx
      .select({
        id: availabilityRules.id,
        calendarId: availabilityRules.calendarId,
        weekday: availabilityRules.weekday,
        startTime: availabilityRules.startTime,
        endTime: availabilityRules.endTime,
        intervalMin: availabilityRules.intervalMin,
        groupId: availabilityRules.groupId,
      })
      .from(availabilityRules)
      .where(inArray(availabilityRules.calendarId, calendarIds));
  }

  async loadOverrides(
    tx: DbClient,
    orgId: string,
    calendarIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<AvailabilityOverride[]> {
    await setOrgContext(tx, orgId);
    return tx
      .select({
        id: availabilityOverrides.id,
        calendarId: availabilityOverrides.calendarId,
        date: availabilityOverrides.date,
        timeRanges: availabilityOverrides.timeRanges,
        intervalMin: availabilityOverrides.intervalMin,
        groupId: availabilityOverrides.groupId,
      })
      .from(availabilityOverrides)
      .where(
        and(
          inArray(availabilityOverrides.calendarId, calendarIds),
          gte(availabilityOverrides.date, startDate),
          lte(availabilityOverrides.date, endDate),
        ),
      );
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
          inArray(blockedTime.calendarId, calendarIds),
          or(
            sql`tstzrange(${blockedTime.startAt}, ${blockedTime.endAt}, '[)') && tstzrange(${rangeStart}, ${rangeEnd}, '[)')`,
            sql`${blockedTime.recurringRule} is not null`,
          ),
        ),
      );
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
          inArray(appointments.calendarId, calendarIds),
          ne(appointments.status, "cancelled"),
          sql`tstzrange(${appointments.startAt}, ${appointments.endAt}, '[)') && tstzrange(${rangeStart}, ${rangeEnd}, '[)')`,
        ),
      );
  }

  async loadResourceConstraints(
    tx: DbClient,
    orgId: string,
    appointmentTypeId: string,
  ): Promise<ResourceConstraint[]> {
    await setOrgContext(tx, orgId);
    return tx
      .select({
        resourceId: appointmentTypeResources.resourceId,
        quantityRequired: appointmentTypeResources.quantityRequired,
      })
      .from(appointmentTypeResources)
      .where(eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId));
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
    return tx
      .select({
        id: resources.id,
        name: resources.name,
        quantity: resources.quantity,
      })
      .from(resources)
      .where(inArray(resources.id, resourceIds));
  }
}

// Singleton instance
export const availabilityRepository = new AvailabilityRepository();
