// AvailabilityService - generates available dates and time slots with full rule enforcement

import { DateTime } from "luxon";
import { RRule } from "rrule";
import { withOrg } from "../../lib/db.js";
import type { DbClient } from "../../lib/db.js";
import { ApplicationError } from "../../errors/application-error.js";
import { availabilityRepository } from "../../repositories/availability.js";
import type { ServiceContext } from "../locations.js";
import type { AppointmentConflict } from "@scheduling/dto";
import type {
  AvailabilityQuery,
  TimeSlot,
  AvailabilityRule,
  AvailabilityOverride,
  BlockedTimeEntry,
  MergedSchedulingLimits,
  AppointmentTypeData,
  ExistingAppointment,
  ResourceConstraint,
  ResourceData,
} from "./types.js";

// Pre-loaded data for slot computation
interface AvailabilityData {
  appointmentType: AppointmentTypeData;
  timezone: string;
  validCalendarIds: string[];
  limits: MergedSchedulingLimits;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  blockedTimes: BlockedTimeEntry[];
  existingAppointments: ExistingAppointment[];
  resourceConstraintsByAppointmentTypeId: Map<string, ResourceConstraint[]>;
  resourceConstraints: ResourceConstraint[];
  resourcesData: ResourceData[];
}

function makeConflict(
  conflictType: AppointmentConflict["conflictType"],
  message: string,
  conflictingIds: string[] = [],
): AppointmentConflict {
  return {
    conflictType,
    message,
    canOverride: false,
    conflictingIds,
  };
}

export class AvailabilityService {
  /**
   * Get available dates in the range
   */
  async getAvailableDates(
    query: AvailabilityQuery,
    context: ServiceContext,
  ): Promise<string[]> {
    return withOrg(context.orgId, async (tx) => {
      const { startDate, endDate } = query;

      // Load all data once for efficiency
      const data = await this.loadAvailabilityData(tx, context.orgId, query, {
        requireAllCalendars: true,
      });
      if (!data) {
        return [];
      }
      const { timezone } = data;

      const dates: string[] = [];
      let current = DateTime.fromISO(startDate, { zone: timezone });
      const end = DateTime.fromISO(endDate, { zone: timezone });

      while (current <= end) {
        const dateStr = current.toISODate()!;
        const slots = this.computeSlotsForDate(data, dateStr, timezone);

        if (slots.some((s) => s.available)) {
          dates.push(dateStr);
        }

        current = current.plus({ days: 1 });
      }

      return dates;
    });
  }

  /**
   * Get available time slots in the range
   */
  async getAvailableSlots(
    query: AvailabilityQuery,
    context: ServiceContext,
  ): Promise<TimeSlot[]> {
    return withOrg(context.orgId, async (tx) => {
      const data = await this.loadAvailabilityData(tx, context.orgId, query, {
        requireAllCalendars: true,
      });
      if (!data) {
        return [];
      }

      return this.computeSlots(
        data,
        query.startDate,
        query.endDate,
        data.timezone,
      );
    });
  }

  /**
   * Check if a specific slot is available
   */
  async checkSlot(
    appointmentTypeId: string,
    calendarId: string,
    startTime: Date,
    timezone: string | undefined,
    context: ServiceContext,
  ): Promise<{ available: boolean; reason?: string }> {
    return withOrg(context.orgId, async (tx) => {
      const resolvedTimezone = await this.resolveTimezone(
        tx,
        context.orgId,
        [calendarId],
        timezone,
      );

      const appointmentType = await availabilityRepository.loadAppointmentType(
        tx,
        context.orgId,
        appointmentTypeId,
      );
      if (!appointmentType) {
        return { available: false, reason: "APPOINTMENT_TYPE_NOT_FOUND" };
      }

      const endTime = DateTime.fromJSDate(startTime)
        .plus({ minutes: appointmentType.durationMin })
        .toJSDate();
      const startDate = DateTime.fromJSDate(startTime, {
        zone: resolvedTimezone,
      }).toISODate()!;

      const query: AvailabilityQuery = {
        appointmentTypeId,
        calendarIds: [calendarId],
        startDate,
        endDate: startDate,
        timezone: resolvedTimezone,
      };

      const data = await this.loadAvailabilityData(tx, context.orgId, query);
      if (!data) {
        return { available: false, reason: "INVALID_CALENDAR" };
      }

      const slots = this.computeSlots(
        data,
        startDate,
        startDate,
        data.timezone,
      );

      const matchingSlot = slots.find(
        (s) =>
          s.start.getTime() === startTime.getTime() &&
          s.end.getTime() === endTime.getTime(),
      );

      if (!matchingSlot) {
        return { available: false, reason: "INVALID_SLOT_TIME" };
      }

      if (!matchingSlot.available) {
        return { available: false, reason: "SLOT_UNAVAILABLE" };
      }

      return { available: true };
    });
  }

  /**
   * Check a specific slot and return structured conflict metadata.
   */
  async checkSlotDetailed(
    appointmentTypeId: string,
    calendarId: string,
    startTime: Date,
    timezone: string,
    context: ServiceContext,
    options?: { excludeAppointmentId?: string },
  ): Promise<{ available: boolean; conflicts: AppointmentConflict[] }> {
    return withOrg(context.orgId, async (tx) => {
      const appointmentType = await availabilityRepository.loadAppointmentType(
        tx,
        context.orgId,
        appointmentTypeId,
      );
      if (!appointmentType) {
        return {
          available: false,
          conflicts: [
            makeConflict(
              "unavailable",
              "Appointment type not found for this slot",
            ),
          ],
        };
      }

      const endTime = DateTime.fromJSDate(startTime)
        .plus({ minutes: appointmentType.durationMin })
        .toJSDate();
      const startDate = DateTime.fromJSDate(startTime, {
        zone: timezone,
      }).toISODate();

      if (!startDate) {
        return {
          available: false,
          conflicts: [
            makeConflict("unavailable", "Invalid date for the requested slot"),
          ],
        };
      }

      const query: AvailabilityQuery = {
        appointmentTypeId,
        calendarIds: [calendarId],
        startDate,
        endDate: startDate,
        timezone,
      };

      const data = await this.loadAvailabilityData(tx, context.orgId, query);
      if (!data) {
        return {
          available: false,
          conflicts: [
            makeConflict("unavailable", "Calendar not available for this slot"),
          ],
        };
      }

      const candidateSlots = this.generateCandidateSlots(
        startDate,
        startDate,
        timezone,
        data.rules,
        data.overrides,
        appointmentType.durationMin,
      );
      const matchesCandidate = candidateSlots.some(
        (slot) =>
          slot.start.getTime() === startTime.getTime() &&
          slot.end.getTime() === endTime.getTime(),
      );

      if (!matchesCandidate) {
        return {
          available: false,
          conflicts: [
            makeConflict(
              "unavailable",
              "Outside availability window for this calendar",
            ),
          ],
        };
      }

      const slotStart = DateTime.fromJSDate(startTime);
      const now = DateTime.now();

      if (data.limits.minNoticeHours != null) {
        const minNotice = now.plus({ hours: data.limits.minNoticeHours });
        if (slotStart < minNotice) {
          return {
            available: false,
            conflicts: [
              makeConflict(
                "unavailable",
                "Not enough notice to book this slot",
              ),
            ],
          };
        }
      }

      if (data.limits.maxNoticeDays != null) {
        const maxNotice = now.plus({ days: data.limits.maxNoticeDays });
        if (slotStart > maxNotice) {
          return {
            available: false,
            conflicts: [
              makeConflict(
                "unavailable",
                "Slot is beyond the advance booking window",
              ),
            ],
          };
        }
      }

      if (slotStart < now) {
        return {
          available: false,
          conflicts: [
            makeConflict("unavailable", "Cannot book a slot in the past"),
          ],
        };
      }

      for (const blocked of data.blockedTimes) {
        if (this.isBlockedAt(startTime, endTime, blocked)) {
          return {
            available: false,
            conflicts: [makeConflict("unavailable", "This time is blocked")],
          };
        }
      }

      const existingAppointments = data.existingAppointments.filter(
        (appt) => appt.id !== options?.excludeAppointmentId,
      );
      const slotWithPadding = {
        start: DateTime.fromJSDate(startTime)
          .minus({ minutes: appointmentType.paddingBeforeMin ?? 0 })
          .toJSDate(),
        end: DateTime.fromJSDate(endTime)
          .plus({ minutes: appointmentType.paddingAfterMin ?? 0 })
          .toJSDate(),
      };
      const overlappingAppointments = existingAppointments.filter((appt) =>
        this.intervalsOverlap(slotWithPadding, {
          start: appt.startAt,
          end: appt.endAt,
        }),
      );
      const capacity = appointmentType.capacity ?? 1;
      const remainingCapacity = capacity - overlappingAppointments.length;

      if (remainingCapacity <= 0) {
        const conflictType = capacity > 1 ? "capacity" : ("overlap" as const);
        return {
          available: false,
          conflicts: [
            makeConflict(
              conflictType,
              capacity > 1
                ? "Slot has reached capacity"
                : "Slot overlaps another appointment",
              overlappingAppointments.map((appt) => appt.id),
            ),
          ],
        };
      }

      if (data.resourceConstraints.length > 0) {
        const resourceAvailable = this.checkResourceCapacity(
          startTime,
          endTime,
          data.resourceConstraints,
          data.resourcesData,
          existingAppointments,
          data.resourceConstraintsByAppointmentTypeId,
        );
        if (!resourceAvailable) {
          return {
            available: false,
            conflicts: [
              makeConflict(
                "resource_unavailable",
                "Required resources are unavailable for this slot",
              ),
            ],
          };
        }
      }

      if (data.limits.maxPerDay != null) {
        const dailyCount = existingAppointments.filter((a) =>
          DateTime.fromJSDate(a.startAt).hasSame(slotStart, "day"),
        ).length;
        if (dailyCount >= data.limits.maxPerDay) {
          return {
            available: false,
            conflicts: [
              makeConflict(
                "unavailable",
                "Daily booking limit has been reached",
              ),
            ],
          };
        }
      }

      if (data.limits.maxPerWeek != null) {
        const weekStart = slotStart.startOf("week");
        const weekEnd = slotStart.endOf("week");
        const weeklyCount = existingAppointments.filter((a) => {
          const apptStart = DateTime.fromJSDate(a.startAt);
          return apptStart >= weekStart && apptStart <= weekEnd;
        }).length;
        if (weeklyCount >= data.limits.maxPerWeek) {
          return {
            available: false,
            conflicts: [
              makeConflict(
                "unavailable",
                "Weekly booking limit has been reached",
              ),
            ],
          };
        }
      }

      if (data.limits.maxPerSlot != null) {
        if (capacity - remainingCapacity >= data.limits.maxPerSlot) {
          return {
            available: false,
            conflicts: [makeConflict("capacity", "Slot has reached capacity")],
          };
        }
      }

      return { available: true, conflicts: [] };
    });
  }

  // ============================================================================
  // Private data loading
  // ============================================================================

  private async loadAvailabilityData(
    tx: DbClient,
    orgId: string,
    query: AvailabilityQuery,
    options?: { requireAllCalendars?: boolean },
  ): Promise<AvailabilityData | null> {
    const { appointmentTypeId, calendarIds, startDate, endDate, timezone } =
      query;

    // 1. Load appointment type details
    const appointmentType = await availabilityRepository.loadAppointmentType(
      tx,
      orgId,
      appointmentTypeId,
    );
    if (!appointmentType) {
      return null;
    }

    // 2. Validate calendars are linked to this appointment type
    const uniqueCalendarIds = Array.from(new Set(calendarIds));
    const validCalendarIds = await availabilityRepository.getValidCalendars(
      tx,
      orgId,
      appointmentTypeId,
      uniqueCalendarIds,
    );
    if (
      options?.requireAllCalendars &&
      validCalendarIds.length !== uniqueCalendarIds.length
    ) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }
    if (validCalendarIds.length === 0) {
      return null;
    }

    const resolvedTimezone = await this.resolveTimezone(
      tx,
      orgId,
      validCalendarIds,
      timezone,
    );

    // 3. Load scheduling limits
    const limits = await availabilityRepository.loadSchedulingLimits(
      tx,
      orgId,
      validCalendarIds,
    );

    // 4. Load availability rules for all calendars
    const rules = await availabilityRepository.loadAvailabilityRules(
      tx,
      orgId,
      validCalendarIds,
    );

    // 5. Load overrides and blocked time
    const overrides = await availabilityRepository.loadOverrides(
      tx,
      orgId,
      validCalendarIds,
      startDate,
      endDate,
    );
    const blockedTimes = await availabilityRepository.loadBlockedTimes(
      tx,
      orgId,
      validCalendarIds,
      startDate,
      endDate,
      resolvedTimezone,
    );

    // 6. Load existing appointments
    const existingAppointments =
      await availabilityRepository.loadExistingAppointments(
        tx,
        orgId,
        validCalendarIds,
        startDate,
        endDate,
        resolvedTimezone,
      );

    // 7. Load resource constraints
    const appointmentTypeIds = new Set(
      existingAppointments.map((appointment) => appointment.appointmentTypeId),
    );
    appointmentTypeIds.add(appointmentTypeId);
    const resourceConstraintsByAppointmentTypeId =
      await availabilityRepository.loadResourceConstraintsByAppointmentTypeIds(
        tx,
        orgId,
        Array.from(appointmentTypeIds),
      );
    const resourceConstraints =
      resourceConstraintsByAppointmentTypeId.get(appointmentTypeId) ?? [];
    const resourcesData = await availabilityRepository.loadResourcesData(
      tx,
      orgId,
      resourceConstraints.map((r) => r.resourceId),
    );

    return {
      appointmentType,
      timezone: resolvedTimezone,
      validCalendarIds,
      limits,
      rules,
      overrides,
      blockedTimes,
      existingAppointments,
      resourceConstraintsByAppointmentTypeId,
      resourceConstraints,
      resourcesData,
    };
  }

  private async resolveTimezone(
    tx: DbClient,
    orgId: string,
    calendarIds: string[],
    requestedTimezone?: string,
  ): Promise<string> {
    if (requestedTimezone) {
      return requestedTimezone;
    }

    const calendarTimezones =
      await availabilityRepository.loadCalendarTimezones(
        tx,
        orgId,
        calendarIds,
      );
    if (calendarTimezones.length === 1) {
      return calendarTimezones[0]!;
    }

    const orgDefaultTimezone =
      await availabilityRepository.loadOrgDefaultTimezone(tx, orgId);
    if (orgDefaultTimezone) {
      return orgDefaultTimezone;
    }

    if (calendarTimezones.length > 0) {
      return calendarTimezones[0]!;
    }

    return "America/New_York";
  }

  // ============================================================================
  // Pure computation helpers (no DB access)
  // ============================================================================

  private computeSlots(
    data: AvailabilityData,
    startDate: string,
    endDate: string,
    timezone: string,
  ): TimeSlot[] {
    const {
      appointmentType,
      limits,
      rules,
      overrides,
      blockedTimes,
      existingAppointments,
      resourceConstraintsByAppointmentTypeId,
      resourceConstraints,
      resourcesData,
    } = data;

    const durationMin = appointmentType.durationMin;
    const paddingBeforeMin = appointmentType.paddingBeforeMin ?? 0;
    const paddingAfterMin = appointmentType.paddingAfterMin ?? 0;
    const capacity = appointmentType.capacity ?? 1;

    // Generate candidate slots
    const candidateSlots = this.generateCandidateSlots(
      startDate,
      endDate,
      timezone,
      rules,
      overrides,
      durationMin,
    );

    // Apply filters
    const now = DateTime.now();
    const slots: TimeSlot[] = [];

    for (const slot of candidateSlots) {
      let available = true;
      let remainingCapacity = capacity;

      const slotStart = DateTime.fromJSDate(slot.start);
      const slotEnd = DateTime.fromJSDate(slot.end);

      // Check min notice
      if (available && limits.minNoticeHours != null) {
        const minNotice = now.plus({ hours: limits.minNoticeHours });
        if (slotStart < minNotice) {
          available = false;
        }
      }

      // Check max notice
      if (available && limits.maxNoticeDays != null) {
        const maxNotice = now.plus({ days: limits.maxNoticeDays });
        if (slotStart > maxNotice) {
          available = false;
        }
      }

      // Cannot book in the past
      if (available && slotStart < now) {
        available = false;
      }

      // Check blocked times (including recurring)
      if (available) {
        for (const blocked of blockedTimes) {
          if (this.isBlockedAt(slot.start, slot.end, blocked)) {
            available = false;
            break;
          }
        }
      }

      // Check existing appointments (with padding)
      if (available) {
        const slotWithPadding = {
          start: slotStart.minus({ minutes: paddingBeforeMin }).toJSDate(),
          end: slotEnd.plus({ minutes: paddingAfterMin }).toJSDate(),
        };

        let overlappingCount = 0;
        for (const appt of existingAppointments) {
          if (
            this.intervalsOverlap(slotWithPadding, {
              start: appt.startAt,
              end: appt.endAt,
            })
          ) {
            overlappingCount++;
          }
        }

        remainingCapacity = capacity - overlappingCount;
        if (remainingCapacity <= 0) {
          available = false;
        }
      }

      // Check resource capacity
      if (available && resourceConstraints.length > 0) {
        const resourceAvailable = this.checkResourceCapacity(
          slot.start,
          slot.end,
          resourceConstraints,
          resourcesData,
          existingAppointments,
          resourceConstraintsByAppointmentTypeId,
        );
        if (!resourceAvailable) {
          available = false;
        }
      }

      // Check daily limits
      if (available && limits.maxPerDay != null) {
        const dailyCount = existingAppointments.filter((a) =>
          DateTime.fromJSDate(a.startAt).hasSame(slotStart, "day"),
        ).length;
        if (dailyCount >= limits.maxPerDay) {
          available = false;
        }
      }

      // Check weekly limits
      if (available && limits.maxPerWeek != null) {
        const weekStart = slotStart.startOf("week");
        const weekEnd = slotStart.endOf("week");
        const weeklyCount = existingAppointments.filter((a) => {
          const apptStart = DateTime.fromJSDate(a.startAt);
          return apptStart >= weekStart && apptStart <= weekEnd;
        }).length;
        if (weeklyCount >= limits.maxPerWeek) {
          available = false;
        }
      }

      // Check per-slot limits (maxPerSlot)
      if (available && limits.maxPerSlot != null) {
        if (capacity - remainingCapacity >= limits.maxPerSlot) {
          available = false;
        }
      }

      slots.push({
        start: slot.start,
        end: slot.end,
        available,
        remainingCapacity: Math.max(0, remainingCapacity),
      });
    }

    return slots;
  }

  private computeSlotsForDate(
    data: AvailabilityData,
    dateStr: string,
    timezone: string,
  ): TimeSlot[] {
    return this.computeSlots(data, dateStr, dateStr, timezone);
  }

  private generateCandidateSlots(
    startDate: string,
    endDate: string,
    timezone: string,
    rules: AvailabilityRule[],
    overrides: AvailabilityOverride[],
    durationMin: number,
  ): Array<{ start: Date; end: Date }> {
    const slots: Array<{ start: Date; end: Date }> = [];

    let current = DateTime.fromISO(startDate, { zone: timezone }).startOf(
      "day",
    );
    const end = DateTime.fromISO(endDate, { zone: timezone }).endOf("day");

    while (current <= end) {
      const dateStr = current.toISODate()!;
      // Luxon weekday: 1 = Monday, 7 = Sunday
      // We need 0 = Sunday, 1 = Monday, etc.
      const weekday = current.weekday % 7;

      // Check for override on this date
      const override = overrides.find((o) => o.date === dateStr);

      if (override && override.timeRanges.length === 0) {
        // Entire day is blocked
        current = current.plus({ days: 1 });
        continue;
      }

      // Get hours for this day (override or regular rules)
      const dayRules = rules
        .filter((r) => r.weekday === weekday)
        .toSorted((a, b) => a.startTime.localeCompare(b.startTime));
      const ruleWindows:
        | Array<{
            startTime: string;
            endTime: string;
            intervalMin: number | null;
          }>
        | AvailabilityRule[] =
        override && override.timeRanges.length > 0
          ? override.timeRanges.map((timeRange) => ({
              startTime: timeRange.startTime,
              endTime: timeRange.endTime,
              intervalMin: override.intervalMin,
            }))
          : dayRules;

      if (ruleWindows.length === 0) {
        current = current.plus({ days: 1 });
        continue;
      }

      const seenSlots = new Set<string>();
      for (const rule of ruleWindows) {
        const dayStart = rule.startTime;
        const dayEnd = rule.endTime;
        const interval = rule.intervalMin ?? 15;

        // Generate slots for this day
        const [startHour, startMin] = dayStart.split(":").map(Number);
        const [endHour, endMin] = dayEnd.split(":").map(Number);

        let slotStart = current.set({ hour: startHour, minute: startMin });
        const dayEndTime = current.set({ hour: endHour, minute: endMin });

        while (slotStart.plus({ minutes: durationMin }) <= dayEndTime) {
          const slotEnd = slotStart.plus({ minutes: durationMin });
          const slotKey = `${slotStart.toMillis()}-${slotEnd.toMillis()}`;
          if (!seenSlots.has(slotKey)) {
            slots.push({
              start: slotStart.toJSDate(),
              end: slotEnd.toJSDate(),
            });
            seenSlots.add(slotKey);
          }
          slotStart = slotStart.plus({ minutes: interval });
        }
      }

      current = current.plus({ days: 1 });
    }

    return slots;
  }

  private isBlockedAt(
    start: Date,
    end: Date,
    blocked: BlockedTimeEntry,
  ): boolean {
    // Handle recurring blocked time
    if (blocked.recurringRule) {
      try {
        const rruleOptions = RRule.parseString(blocked.recurringRule);
        // Anchor recurrence to the block's configured start timestamp.
        rruleOptions.dtstart = blocked.startAt;
        const rrule = new RRule(rruleOptions);
        const occurrences = rrule.between(
          DateTime.fromJSDate(start).minus({ days: 1 }).toJSDate(),
          DateTime.fromJSDate(end).plus({ days: 1 }).toJSDate(),
          true,
        );

        const blockDuration =
          blocked.endAt.getTime() - blocked.startAt.getTime();

        for (const occurrence of occurrences) {
          const blockStart = DateTime.fromJSDate(occurrence);
          const blockEnd = blockStart.plus({ milliseconds: blockDuration });

          if (
            this.intervalsOverlap(
              { start, end },
              { start: blockStart.toJSDate(), end: blockEnd.toJSDate() },
            )
          ) {
            return true;
          }
        }
        return false;
      } catch {
        // If RRULE parsing fails, fall back to simple check
        return this.intervalsOverlap(
          { start, end },
          { start: blocked.startAt, end: blocked.endAt },
        );
      }
    }

    // Simple blocked time
    return this.intervalsOverlap(
      { start, end },
      { start: blocked.startAt, end: blocked.endAt },
    );
  }

  private intervalsOverlap(
    a: { start: Date; end: Date },
    b: { start: Date; end: Date },
  ): boolean {
    return a.start < b.end && b.start < a.end;
  }

  private checkResourceCapacity(
    start: Date,
    end: Date,
    resourceConstraints: ResourceConstraint[],
    resourcesData: ResourceData[],
    existingAppointments: ExistingAppointment[],
    resourceConstraintsByAppointmentTypeId: Map<string, ResourceConstraint[]>,
  ): boolean {
    // For each resource, check if adding this appointment would exceed capacity
    for (const constraint of resourceConstraints) {
      const resource = resourcesData.find(
        (r) => r.id === constraint.resourceId,
      );
      if (!resource) continue;

      // Count how much of this resource is already allocated during this time
      // We need to look at appointments that use this resource
      const overlappingAppointments = existingAppointments.filter((a) =>
        this.intervalsOverlap(
          { start, end },
          { start: a.startAt, end: a.endAt },
        ),
      );

      let usedQuantity = 0;
      for (const appointment of overlappingAppointments) {
        const appointmentConstraints =
          resourceConstraintsByAppointmentTypeId.get(
            appointment.appointmentTypeId,
          ) ?? [];
        const matchingConstraint = appointmentConstraints.find(
          (appointmentConstraint) =>
            appointmentConstraint.resourceId === constraint.resourceId,
        );
        if (matchingConstraint) {
          usedQuantity += matchingConstraint.quantityRequired;
        }
      }

      if (usedQuantity + constraint.quantityRequired > resource.quantity) {
        return false;
      }
    }

    return true;
  }
}

// Singleton instance
export const availabilityService = new AvailabilityService();
