// AvailabilityService - generates available dates and time slots with full rule enforcement

import { DateTime } from "luxon";
import { withOrg } from "../../lib/db.js";
import type { OrgScopedTx } from "../../lib/db.js";
import { ApplicationError } from "../../errors/application-error.js";
import { availabilityRepository } from "../../repositories/availability.js";
import {
  checkResourceCapacity,
  evaluateSlot,
  intervalsOverlap,
  isBlockedAt,
  type SlotConstraints,
} from "./slot-evaluation.js";
import { parseHm, setZonedTime, sundayZeroWeekday } from "./calendar-time.js";
import type { ServiceContext } from "../locations.js";
import type { AppointmentConflict } from "@scheduling/dto";
import type {
  AvailabilityQuery,
  CalendarPreviewQuery,
  AvailabilityPreviewDraft,
  DraftWeeklyRule,
  DraftBlockedTime,
  DraftDayOverride,
  TimeSlot,
  AvailabilityRule,
  AvailabilityOverride,
  BlockedTimeEntry,
  MergedSchedulingLimits,
  AppointmentTypeData,
  ExistingAppointment,
  ResourceConstraint,
  ResourceData,
  ResourceUsageAppointment,
} from "./types.js";

// Pre-loaded data for slot computation
interface AvailabilityData {
  appointmentType: AppointmentTypeData;
  calendarLocationId: string | null;
  timezone: string;
  slotIntervalMin: number;
  limits: MergedSchedulingLimits;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  blockedTimes: BlockedTimeEntry[];
  existingAppointments: ExistingAppointment[];
  resourceConstraintsByAppointmentTypeId: Map<string, ResourceConstraint[]>;
  resourceConstraints: ResourceConstraint[];
  resourcesData: ResourceData[];
  resourceUsageAppointments: ResourceUsageAppointment[];
}

interface CalendarPreviewData {
  timezone: string;
  slotIntervalMin: number;
  limits: MergedSchedulingLimits;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  blockedTimes: BlockedTimeEntry[];
  existingAppointments: ExistingAppointment[];
}

interface DraftOverlayData {
  limits: MergedSchedulingLimits;
  rules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
  blockedTimes: BlockedTimeEntry[];
}

// Drop the appointment being rescheduled so it doesn't count against itself.
function excludeAppointment<T extends { id: string }>(
  appointments: T[],
  excludeId: string | undefined,
): T[] {
  if (excludeId == null) return appointments;
  return appointments.filter((appointment) => appointment.id !== excludeId);
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
      const data = await this.loadAvailabilityData(tx, query, {
        requireAllCalendars: true,
      });
      if (!data) {
        return [];
      }
      const excludeId = query.excludeAppointmentId;
      const filteredData: AvailabilityData = {
        ...data,
        existingAppointments: excludeAppointment(
          data.existingAppointments,
          excludeId,
        ),
        resourceUsageAppointments: excludeAppointment(
          data.resourceUsageAppointments,
          excludeId,
        ),
      };
      const { timezone } = data;

      const dates: string[] = [];
      let current = DateTime.fromISO(startDate, { zone: timezone });
      const end = DateTime.fromISO(endDate, { zone: timezone });

      while (current <= end) {
        const dateStr = current.toISODate()!;
        const slots = this.computeSlotsForDate(filteredData, dateStr, timezone);

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
      const data = await this.loadAvailabilityData(tx, query, {
        requireAllCalendars: true,
      });
      if (!data) {
        return [];
      }
      const excludeId = query.excludeAppointmentId;
      const filteredData: AvailabilityData = {
        ...data,
        existingAppointments: excludeAppointment(
          data.existingAppointments,
          excludeId,
        ),
        resourceUsageAppointments: excludeAppointment(
          data.resourceUsageAppointments,
          excludeId,
        ),
      };

      return this.computeSlots(
        filteredData,
        query.startDate,
        query.endDate,
        data.timezone,
      );
    });
  }

  /**
   * Get available time slots with draft availability overlays.
   */
  async getPreviewSlots(
    query: CalendarPreviewQuery,
    context: ServiceContext,
  ): Promise<TimeSlot[]> {
    return withOrg(context.orgId, async (tx) => {
      const data = await this.loadCalendarPreviewData(tx, query);
      const draftData = this.applyDraftOverlay<CalendarPreviewData>(
        data,
        query.calendarId,
        query.draft,
      );

      return this.computeCalendarPreviewSlots(
        draftData,
        query.startDate,
        query.endDate,
        draftData.timezone,
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
    options?: { excludeAppointmentId?: string | undefined },
  ): Promise<{ available: boolean; reason?: string }> {
    return withOrg(context.orgId, async (tx) => {
      const resolvedTimezone = await this.resolveTimezone(
        tx,
        calendarId,
        timezone,
      );

      const appointmentType = await availabilityRepository.loadAppointmentType(
        tx,
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
        calendarId,
        startDate,
        endDate: startDate,
        timezone: resolvedTimezone,
      };

      const data = await this.loadAvailabilityData(tx, query);
      if (!data) {
        return { available: false, reason: "INVALID_CALENDAR" };
      }
      const excludeId = options?.excludeAppointmentId;
      const filteredData: AvailabilityData = {
        ...data,
        existingAppointments: excludeAppointment(
          data.existingAppointments,
          excludeId,
        ),
        resourceUsageAppointments: excludeAppointment(
          data.resourceUsageAppointments,
          excludeId,
        ),
      };

      const slots = this.computeSlots(
        filteredData,
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
        calendarId,
        startDate,
        endDate: startDate,
        timezone,
      };

      const data = await this.loadAvailabilityData(tx, query);
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
        data.slotIntervalMin,
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

      if (data.limits.minNoticeMinutes != null) {
        const minNotice = now.plus({ minutes: data.limits.minNoticeMinutes });
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
        if (isBlockedAt(startTime, endTime, blocked)) {
          return {
            available: false,
            conflicts: [makeConflict("unavailable", "This time is blocked")],
          };
        }
      }

      const existingAppointments = excludeAppointment(
        data.existingAppointments,
        options?.excludeAppointmentId,
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
        intervalsOverlap(slotWithPadding, {
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
        const resourceUsageAppointments = excludeAppointment(
          data.resourceUsageAppointments,
          options?.excludeAppointmentId,
        );
        const resourceAvailable = checkResourceCapacity(
          startTime,
          endTime,
          data.resourceConstraints,
          data.resourcesData,
          resourceUsageAppointments,
          data.resourceConstraintsByAppointmentTypeId,
          data.calendarLocationId,
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
    tx: OrgScopedTx,
    query: AvailabilityQuery,
    options?: { requireAllCalendars?: boolean },
  ): Promise<AvailabilityData | null> {
    const { appointmentTypeId, calendarId, startDate, endDate, timezone } =
      query;

    // 1. Load appointment type details
    const appointmentType = await availabilityRepository.loadAppointmentType(
      tx,
      appointmentTypeId,
    );
    if (!appointmentType) {
      return null;
    }

    // 2. Validate calendars are linked to this appointment type
    const validCalendarId = await availabilityRepository.getValidCalendar(
      tx,
      appointmentTypeId,
      calendarId,
    );
    if (options?.requireAllCalendars && !validCalendarId) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }
    if (!validCalendarId) {
      return null;
    }

    const resolvedTimezone = await this.resolveTimezone(
      tx,
      validCalendarId,
      timezone,
    );

    // 3. Load scheduling limits
    const limits = await availabilityRepository.loadSchedulingLimits(
      tx,
      validCalendarId,
    );
    const slotIntervalMin =
      await availabilityRepository.loadCalendarSlotInterval(
        tx,
        validCalendarId,
      );
    if (slotIntervalMin == null) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }

    // 4. Load availability rules for all calendars
    const rules = await availabilityRepository.loadAvailabilityRules(
      tx,
      validCalendarId,
    );

    // 5. Load overrides and blocked time
    const overrides = await availabilityRepository.loadOverrides(
      tx,
      validCalendarId,
      startDate,
      endDate,
    );
    const blockedTimes = await availabilityRepository.loadBlockedTimes(
      tx,
      validCalendarId,
      startDate,
      endDate,
      resolvedTimezone,
    );

    // 6. Load existing appointments
    const existingAppointments =
      await availabilityRepository.loadExistingAppointments(
        tx,
        validCalendarId,
        startDate,
        endDate,
        resolvedTimezone,
      );

    // 7. Load resource constraints for the booking type, then the appointments
    // that consume those resources across the whole org (the trigger counts
    // shared pools org-wide / location-wide, not per calendar — so the picker
    // must too). The constraint map covers every type in that usage set.
    const resourceConstraints =
      await availabilityRepository.loadResourceConstraints(
        tx,
        appointmentTypeId,
      );
    const requiredResourceIds = resourceConstraints.map((r) => r.resourceId);
    const resourcesData = await availabilityRepository.loadResourcesData(
      tx,
      requiredResourceIds,
    );
    const resourceUsageAppointments =
      await availabilityRepository.loadResourceUsageAppointments(
        tx,
        requiredResourceIds,
        startDate,
        endDate,
        resolvedTimezone,
      );
    const usageTypeIds = new Set(
      resourceUsageAppointments.map((a) => a.appointmentTypeId),
    );
    usageTypeIds.add(appointmentTypeId);
    const resourceConstraintsByAppointmentTypeId =
      await availabilityRepository.loadResourceConstraintsByAppointmentTypeIds(
        tx,
        Array.from(usageTypeIds),
      );
    // Only needed to scope resource enforcement; skip the read when the type
    // requires no resources.
    const calendarLocationId =
      requiredResourceIds.length > 0
        ? await availabilityRepository.loadCalendarLocationId(
            tx,
            validCalendarId,
          )
        : null;

    return {
      appointmentType,
      calendarLocationId,
      timezone: resolvedTimezone,
      slotIntervalMin,
      limits,
      rules,
      overrides,
      blockedTimes,
      existingAppointments,
      resourceConstraintsByAppointmentTypeId,
      resourceConstraints,
      resourcesData,
      resourceUsageAppointments,
    };
  }

  private async loadCalendarPreviewData(
    tx: OrgScopedTx,
    query: CalendarPreviewQuery,
  ): Promise<CalendarPreviewData> {
    const { calendarId, startDate, endDate, timezone } = query;

    const slotIntervalMin =
      await availabilityRepository.loadCalendarSlotInterval(tx, calendarId);
    if (slotIntervalMin == null) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }

    const resolvedTimezone = await this.resolveTimezone(
      tx,
      calendarId,
      timezone,
    );
    const limits = await availabilityRepository.loadSchedulingLimits(
      tx,
      calendarId,
    );
    const rules = await availabilityRepository.loadAvailabilityRules(
      tx,
      calendarId,
    );
    const overrides = await availabilityRepository.loadOverrides(
      tx,
      calendarId,
      startDate,
      endDate,
    );
    const blockedTimes = await availabilityRepository.loadBlockedTimes(
      tx,
      calendarId,
      startDate,
      endDate,
      resolvedTimezone,
    );
    const existingAppointments =
      await availabilityRepository.loadExistingAppointments(
        tx,
        calendarId,
        startDate,
        endDate,
        resolvedTimezone,
      );

    return {
      timezone: resolvedTimezone,
      slotIntervalMin,
      limits,
      rules,
      overrides,
      blockedTimes,
      existingAppointments,
    };
  }

  private applyDraftOverlay<T extends DraftOverlayData>(
    data: T,
    calendarId: string,
    draft?: AvailabilityPreviewDraft,
  ): T {
    if (!draft) {
      return data;
    }

    const next: T = {
      ...data,
      limits: { ...data.limits },
      rules: [...data.rules],
      overrides: [...data.overrides],
      blockedTimes: [...data.blockedTimes],
    };

    if (draft.schedulingLimits) {
      if (draft.schedulingLimits.minNoticeMinutes !== undefined) {
        next.limits.minNoticeMinutes = draft.schedulingLimits.minNoticeMinutes;
      }
      if (draft.schedulingLimits.maxNoticeDays !== undefined) {
        next.limits.maxNoticeDays = draft.schedulingLimits.maxNoticeDays;
      }
      if (draft.schedulingLimits.maxPerSlot !== undefined) {
        next.limits.maxPerSlot = draft.schedulingLimits.maxPerSlot;
      }
      if (draft.schedulingLimits.maxPerDay !== undefined) {
        next.limits.maxPerDay = draft.schedulingLimits.maxPerDay;
      }
      if (draft.schedulingLimits.maxPerWeek !== undefined) {
        next.limits.maxPerWeek = draft.schedulingLimits.maxPerWeek;
      }
    }

    if (draft.weeklyRules) {
      next.rules = draft.weeklyRules.map((rule, index) =>
        this.toDraftAvailabilityRule(calendarId, rule, index),
      );
    }

    if (draft.blockedTime) {
      next.blockedTimes = draft.blockedTime.map((block, index) =>
        this.toDraftBlockedTime(calendarId, block, index),
      );
    }

    if (draft.dayOverrides) {
      const byDate = new Map<string, AvailabilityOverride>();
      for (const override of next.overrides) {
        byDate.set(override.date, override);
      }
      draft.dayOverrides.forEach((override, index) => {
        byDate.set(
          override.date,
          this.toDraftAvailabilityOverride(calendarId, override, index),
        );
      });
      next.overrides = Array.from(byDate.values()).toSorted((a, b) =>
        a.date.localeCompare(b.date),
      );
    }

    return next;
  }

  private toDraftAvailabilityRule(
    calendarId: string,
    rule: DraftWeeklyRule,
    index: number,
  ): AvailabilityRule {
    return {
      id: `draft-rule-${index}`,
      calendarId,
      weekday: rule.weekday,
      startTime: rule.startTime,
      endTime: rule.endTime,
      groupId: rule.groupId ?? null,
    };
  }

  private toDraftBlockedTime(
    calendarId: string,
    block: DraftBlockedTime,
    index: number,
  ): BlockedTimeEntry {
    return {
      id: `draft-block-${index}`,
      calendarId,
      startAt: block.startAt,
      endAt: block.endAt,
      recurringRule: block.recurringRule ?? null,
    };
  }

  private toDraftAvailabilityOverride(
    calendarId: string,
    override: DraftDayOverride,
    index: number,
  ): AvailabilityOverride {
    return {
      id: `draft-override-${index}`,
      calendarId,
      date: override.date,
      timeRanges: override.timeRanges,
      groupId: override.groupId ?? null,
    };
  }

  private async resolveTimezone(
    tx: OrgScopedTx,
    calendarId: string,
    requestedTimezone?: string,
  ): Promise<string> {
    if (requestedTimezone) {
      return requestedTimezone;
    }

    const calendarTimezone = await availabilityRepository.loadCalendarTimezone(
      tx,
      calendarId,
    );
    if (calendarTimezone) {
      return calendarTimezone;
    }

    const orgDefaultTimezone =
      await availabilityRepository.loadOrgDefaultTimezone(tx);
    if (orgDefaultTimezone) {
      return orgDefaultTimezone;
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
      resourceUsageAppointments,
    } = data;

    const candidateSlots = this.generateCandidateSlots(
      startDate,
      endDate,
      timezone,
      rules,
      overrides,
      appointmentType.durationMin,
      data.slotIntervalMin,
    );

    const now = DateTime.now();
    const constraints: SlotConstraints = {
      limits,
      blockedTimes,
      capacity: {
        kind: "type",
        capacity: appointmentType.capacity ?? 1,
        paddingBeforeMin: appointmentType.paddingBeforeMin ?? 0,
        paddingAfterMin: appointmentType.paddingAfterMin ?? 0,
        resourceConstraints,
        resourcesData,
        resourceUsageAppointments,
        resourceConstraintsByAppointmentTypeId,
        calendarLocationId: data.calendarLocationId,
      },
    };

    return candidateSlots.map((slot) =>
      evaluateSlot(slot, constraints, existingAppointments, now),
    );
  }

  private computeSlotsForDate(
    data: AvailabilityData,
    dateStr: string,
    timezone: string,
  ): TimeSlot[] {
    return this.computeSlots(data, dateStr, dateStr, timezone);
  }

  private computeCalendarPreviewSlots(
    data: CalendarPreviewData,
    startDate: string,
    endDate: string,
    timezone: string,
  ): TimeSlot[] {
    const candidateSlots = this.generateCandidateSlots(
      startDate,
      endDate,
      timezone,
      data.rules,
      data.overrides,
      data.slotIntervalMin,
      data.slotIntervalMin,
    );

    const now = DateTime.now();
    const constraints: SlotConstraints = {
      limits: data.limits,
      blockedTimes: data.blockedTimes,
      capacity: { kind: "perSlot" },
    };

    return candidateSlots.map((slot) =>
      evaluateSlot(slot, constraints, data.existingAppointments, now),
    );
  }

  private generateCandidateSlots(
    startDate: string,
    endDate: string,
    timezone: string,
    rules: AvailabilityRule[],
    overrides: AvailabilityOverride[],
    durationMin: number,
    slotIntervalMin: number,
  ): Array<{ start: Date; end: Date }> {
    const slots: Array<{ start: Date; end: Date }> = [];

    let current = DateTime.fromISO(startDate, { zone: timezone }).startOf(
      "day",
    );
    const end = DateTime.fromISO(endDate, { zone: timezone }).endOf("day");

    while (current <= end) {
      const dateStr = current.toISODate()!;
      const weekday = sundayZeroWeekday(current);

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
          }>
        | AvailabilityRule[] =
        override && override.timeRanges.length > 0
          ? override.timeRanges.map((timeRange) => ({
              startTime: timeRange.startTime,
              endTime: timeRange.endTime,
            }))
          : dayRules;

      if (ruleWindows.length === 0) {
        current = current.plus({ days: 1 });
        continue;
      }

      const seenSlots = new Set<string>();
      for (const rule of ruleWindows) {
        const interval = slotIntervalMin;

        let slotStart = setZonedTime(current, parseHm(rule.startTime));
        const dayEndTime = setZonedTime(current, parseHm(rule.endTime));

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
}

// Singleton instance
export const availabilityService = new AvailabilityService();
