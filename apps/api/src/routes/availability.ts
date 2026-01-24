// oRPC routes for availability CRUD
// - Weekly availability rules (per weekday, start/end time, interval)
// - Date overrides (specific dates, blocked or custom hours)
// - Blocked time ranges (single or recurring via RRULE)
// - Scheduling limits (min/max notice, per-slot/day/week caps)

import { z } from "zod";
import { eq, and, gt } from "drizzle-orm";
import {
  availabilityRules,
  availabilityOverrides,
  blockedTime,
  schedulingLimits,
  calendars,
} from "@scheduling/db/schema";
import {
  createAvailabilityRuleSchema,
  updateAvailabilityRuleSchema,
  setWeeklyAvailabilitySchema,
  createAvailabilityOverrideSchema,
  updateAvailabilityOverrideSchema,
  createBlockedTimeSchema,
  updateBlockedTimeSchema,
  createSchedulingLimitsSchema,
  updateSchedulingLimitsSchema,
  availabilityQuerySchema,
  availabilityCheckSchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { availabilityService } from "../services/availability-engine/index.js";

const calendarIdInput = z.object({ calendarId: z.uuid() });
const idInput = z.object({ id: z.string().uuid() });
const cursorPaginationInput = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// Helper to verify calendar belongs to org
async function verifyCalendarAccess(orgId: string, calendarId: string) {
  const [calendar] = await withOrg(orgId, async (tx) => {
    return tx
      .select()
      .from(calendars)
      .where(eq(calendars.id, calendarId))
      .limit(1);
  });
  if (!calendar) {
    throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
  }
  return calendar;
}

// ============================================================================
// WEEKLY AVAILABILITY RULES
// ============================================================================

// List rules for a calendar
export const listRules = authed
  .input(calendarIdInput.merge(cursorPaginationInput))
  .handler(async ({ input, context }) => {
    const { calendarId, cursor, limit } = input;
    const { orgId } = context;

    await verifyCalendarAccess(orgId, calendarId);

    const results = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(availabilityRules)
        .where(
          and(
            eq(availabilityRules.calendarId, calendarId),
            cursor ? gt(availabilityRules.id, cursor) : undefined,
          ),
        )
        .limit(limit + 1)
        .orderBy(availabilityRules.weekday, availabilityRules.startTime);
    });

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  });

// Get single rule
export const getRule = authed
  .input(idInput)
  .handler(async ({ input, context }) => {
    const { id } = input;
    const { orgId } = context;

    const [rule] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(availabilityRules)
        .where(eq(availabilityRules.id, id))
        .limit(1);
    });

    if (!rule) {
      throw new ApplicationError("Availability rule not found", {
        code: "NOT_FOUND",
      });
    }

    // Verify calendar access
    await verifyCalendarAccess(orgId, rule.calendarId);

    return rule;
  });

// Create rule
export const createRule = authed
  .input(
    calendarIdInput.merge(z.object({ data: createAvailabilityRuleSchema })),
  )
  .handler(async ({ input, context }) => {
    const { calendarId, data } = input;
    const { orgId } = context;

    await verifyCalendarAccess(orgId, calendarId);

    // Check for overlapping rules on the same weekday
    const existingRules = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(availabilityRules)
        .where(
          and(
            eq(availabilityRules.calendarId, calendarId),
            eq(availabilityRules.weekday, data.weekday),
          ),
        );
    });

    for (const existing of existingRules) {
      // Check if time ranges overlap
      if (
        data.startTime < existing.endTime &&
        data.endTime > existing.startTime
      ) {
        throw new ApplicationError(
          `Overlapping rule exists for weekday ${data.weekday}: ${existing.startTime}-${existing.endTime}`,
          { code: "CONFLICT" },
        );
      }
    }

    const [rule] = await withOrg(orgId, async (tx) => {
      return tx
        .insert(availabilityRules)
        .values({
          calendarId,
          weekday: data.weekday,
          startTime: data.startTime,
          endTime: data.endTime,
          intervalMin: data.intervalMin ?? null,
          groupId: data.groupId ?? null,
        })
        .returning();
    });

    return rule;
  });

// Update rule
export const updateRule = authed
  .input(idInput.merge(z.object({ data: updateAvailabilityRuleSchema })))
  .handler(async ({ input, context }) => {
    const { id, data } = input;
    const { orgId } = context;

    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(availabilityRules)
        .where(eq(availabilityRules.id, id))
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Availability rule not found", {
        code: "NOT_FOUND",
      });
    }

    await verifyCalendarAccess(orgId, existing.calendarId);

    // Check for overlapping rules if weekday or times are changing
    const newWeekday = data.weekday ?? existing.weekday;
    const newStartTime = data.startTime ?? existing.startTime;
    const newEndTime = data.endTime ?? existing.endTime;

    const otherRules = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(availabilityRules)
        .where(
          and(
            eq(availabilityRules.calendarId, existing.calendarId),
            eq(availabilityRules.weekday, newWeekday),
          ),
        );
    });

    for (const other of otherRules) {
      if (other.id === id) continue;
      if (newStartTime < other.endTime && newEndTime > other.startTime) {
        throw new ApplicationError(
          `Overlapping rule exists for weekday ${newWeekday}: ${other.startTime}-${other.endTime}`,
          { code: "CONFLICT" },
        );
      }
    }

    const [updated] = await withOrg(orgId, async (tx) => {
      return tx
        .update(availabilityRules)
        .set({
          weekday: data.weekday ?? existing.weekday,
          startTime: data.startTime ?? existing.startTime,
          endTime: data.endTime ?? existing.endTime,
          intervalMin:
            data.intervalMin !== undefined
              ? data.intervalMin
              : existing.intervalMin,
          groupId: data.groupId !== undefined ? data.groupId : existing.groupId,
        })
        .where(eq(availabilityRules.id, id))
        .returning();
    });

    return updated;
  });

// Delete rule
export const deleteRule = authed
  .input(idInput)
  .handler(async ({ input, context }) => {
    const { id } = input;
    const { orgId } = context;

    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(availabilityRules)
        .where(eq(availabilityRules.id, id))
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Availability rule not found", {
        code: "NOT_FOUND",
      });
    }

    await verifyCalendarAccess(orgId, existing.calendarId);

    await withOrg(orgId, async (tx) => {
      return tx.delete(availabilityRules).where(eq(availabilityRules.id, id));
    });

    return { success: true };
  });

// Set weekly availability (bulk replace)
export const setWeeklyAvailability = authed
  .input(calendarIdInput.merge(setWeeklyAvailabilitySchema))
  .handler(async ({ input, context }) => {
    const { calendarId, rules } = input;
    const { orgId } = context;

    await verifyCalendarAccess(orgId, calendarId);

    // Validate no overlaps within the new rules
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i]!;
        const b = rules[j]!;
        if (
          a.weekday === b.weekday &&
          a.startTime < b.endTime &&
          a.endTime > b.startTime
        ) {
          throw new ApplicationError(
            `Overlapping rules for weekday ${a.weekday}`,
            {
              code: "BAD_REQUEST",
            },
          );
        }
      }
    }

    // Delete existing rules and insert new ones
    const insertedRules = await withOrg(orgId, async (tx) => {
      await tx
        .delete(availabilityRules)
        .where(eq(availabilityRules.calendarId, calendarId));

      if (rules.length === 0) {
        return [];
      }

      return tx
        .insert(availabilityRules)
        .values(
          rules.map((rule) => ({
            calendarId,
            weekday: rule.weekday,
            startTime: rule.startTime,
            endTime: rule.endTime,
            intervalMin: rule.intervalMin ?? null,
            groupId: rule.groupId ?? null,
          })),
        )
        .returning();
    });

    return { rules: insertedRules };
  });

// ============================================================================
// AVAILABILITY OVERRIDES
// ============================================================================

// List overrides for a calendar
export const listOverrides = authed
  .input(calendarIdInput.merge(cursorPaginationInput))
  .handler(async ({ input, context }) => {
    const { calendarId, cursor, limit } = input;
    const { orgId } = context;

    await verifyCalendarAccess(orgId, calendarId);

    const results = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(availabilityOverrides)
        .where(
          and(
            eq(availabilityOverrides.calendarId, calendarId),
            cursor ? gt(availabilityOverrides.id, cursor) : undefined,
          ),
        )
        .limit(limit + 1)
        .orderBy(availabilityOverrides.date);
    });

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  });

// Get single override
export const getOverride = authed
  .input(idInput)
  .handler(async ({ input, context }) => {
    const { id } = input;
    const { orgId } = context;

    const [override] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(availabilityOverrides)
        .where(eq(availabilityOverrides.id, id))
        .limit(1);
    });

    if (!override) {
      throw new ApplicationError("Availability override not found", {
        code: "NOT_FOUND",
      });
    }

    await verifyCalendarAccess(orgId, override.calendarId);

    return override;
  });

// Create override
export const createOverride = authed
  .input(
    calendarIdInput.merge(z.object({ data: createAvailabilityOverrideSchema })),
  )
  .handler(async ({ input, context }) => {
    const { calendarId, data } = input;
    const { orgId } = context;

    await verifyCalendarAccess(orgId, calendarId);

    // Check for existing override on the same date
    const [existingOverride] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(availabilityOverrides)
        .where(
          and(
            eq(availabilityOverrides.calendarId, calendarId),
            eq(availabilityOverrides.date, data.date),
          ),
        )
        .limit(1);
    });

    if (existingOverride) {
      throw new ApplicationError(
        `Override already exists for date ${data.date}`,
        {
          code: "CONFLICT",
        },
      );
    }

    const [override] = await withOrg(orgId, async (tx) => {
      return tx
        .insert(availabilityOverrides)
        .values({
          calendarId,
          date: data.date,
          startTime: data.startTime ?? null,
          endTime: data.endTime ?? null,
          isBlocked: data.isBlocked ?? false,
          intervalMin: data.intervalMin ?? null,
          groupId: data.groupId ?? null,
        })
        .returning();
    });

    return override;
  });

// Update override
export const updateOverride = authed
  .input(idInput.merge(z.object({ data: updateAvailabilityOverrideSchema })))
  .handler(async ({ input, context }) => {
    const { id, data } = input;
    const { orgId } = context;

    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(availabilityOverrides)
        .where(eq(availabilityOverrides.id, id))
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Availability override not found", {
        code: "NOT_FOUND",
      });
    }

    await verifyCalendarAccess(orgId, existing.calendarId);

    // If changing date, check for conflicts
    if (data.date && data.date !== existing.date) {
      const [conflicting] = await withOrg(orgId, async (tx) => {
        return tx
          .select()
          .from(availabilityOverrides)
          .where(
            and(
              eq(availabilityOverrides.calendarId, existing.calendarId),
              eq(availabilityOverrides.date, data.date!),
            ),
          )
          .limit(1);
      });

      if (conflicting) {
        throw new ApplicationError(
          `Override already exists for date ${data.date}`,
          {
            code: "CONFLICT",
          },
        );
      }
    }

    const [updated] = await withOrg(orgId, async (tx) => {
      return tx
        .update(availabilityOverrides)
        .set({
          date: data.date ?? existing.date,
          startTime:
            data.startTime !== undefined ? data.startTime : existing.startTime,
          endTime: data.endTime !== undefined ? data.endTime : existing.endTime,
          isBlocked: data.isBlocked ?? existing.isBlocked,
          intervalMin:
            data.intervalMin !== undefined
              ? data.intervalMin
              : existing.intervalMin,
          groupId: data.groupId !== undefined ? data.groupId : existing.groupId,
        })
        .where(eq(availabilityOverrides.id, id))
        .returning();
    });

    return updated;
  });

// Delete override
export const deleteOverride = authed
  .input(idInput)
  .handler(async ({ input, context }) => {
    const { id } = input;
    const { orgId } = context;

    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(availabilityOverrides)
        .where(eq(availabilityOverrides.id, id))
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Availability override not found", {
        code: "NOT_FOUND",
      });
    }

    await verifyCalendarAccess(orgId, existing.calendarId);

    await withOrg(orgId, async (tx) => {
      return tx
        .delete(availabilityOverrides)
        .where(eq(availabilityOverrides.id, id));
    });

    return { success: true };
  });

// ============================================================================
// BLOCKED TIME
// ============================================================================

// List blocked time for a calendar
export const listBlockedTime = authed
  .input(calendarIdInput.merge(cursorPaginationInput))
  .handler(async ({ input, context }) => {
    const { calendarId, cursor, limit } = input;
    const { orgId } = context;

    await verifyCalendarAccess(orgId, calendarId);

    const results = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(blockedTime)
        .where(
          and(
            eq(blockedTime.calendarId, calendarId),
            cursor ? gt(blockedTime.id, cursor) : undefined,
          ),
        )
        .limit(limit + 1)
        .orderBy(blockedTime.startAt);
    });

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  });

// Get single blocked time
export const getBlockedTime = authed
  .input(idInput)
  .handler(async ({ input, context }) => {
    const { id } = input;
    const { orgId } = context;

    const [block] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(blockedTime)
        .where(eq(blockedTime.id, id))
        .limit(1);
    });

    if (!block) {
      throw new ApplicationError("Blocked time not found", {
        code: "NOT_FOUND",
      });
    }

    await verifyCalendarAccess(orgId, block.calendarId);

    return block;
  });

// Create blocked time
export const createBlockedTime = authed
  .input(calendarIdInput.merge(z.object({ data: createBlockedTimeSchema })))
  .handler(async ({ input, context }) => {
    const { calendarId, data } = input;
    const { orgId } = context;

    await verifyCalendarAccess(orgId, calendarId);

    const [block] = await withOrg(orgId, async (tx) => {
      return tx
        .insert(blockedTime)
        .values({
          calendarId,
          startAt: new Date(data.startAt),
          endAt: new Date(data.endAt),
          recurringRule: data.recurringRule ?? null,
        })
        .returning();
    });

    return block;
  });

// Update blocked time
export const updateBlockedTime = authed
  .input(idInput.merge(z.object({ data: updateBlockedTimeSchema })))
  .handler(async ({ input, context }) => {
    const { id, data } = input;
    const { orgId } = context;

    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(blockedTime)
        .where(eq(blockedTime.id, id))
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Blocked time not found", {
        code: "NOT_FOUND",
      });
    }

    await verifyCalendarAccess(orgId, existing.calendarId);

    const [updated] = await withOrg(orgId, async (tx) => {
      return tx
        .update(blockedTime)
        .set({
          startAt: data.startAt ? new Date(data.startAt) : existing.startAt,
          endAt: data.endAt ? new Date(data.endAt) : existing.endAt,
          recurringRule:
            data.recurringRule !== undefined
              ? data.recurringRule
              : existing.recurringRule,
        })
        .where(eq(blockedTime.id, id))
        .returning();
    });

    return updated;
  });

// Delete blocked time
export const deleteBlockedTime = authed
  .input(idInput)
  .handler(async ({ input, context }) => {
    const { id } = input;
    const { orgId } = context;

    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(blockedTime)
        .where(eq(blockedTime.id, id))
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Blocked time not found", {
        code: "NOT_FOUND",
      });
    }

    await verifyCalendarAccess(orgId, existing.calendarId);

    await withOrg(orgId, async (tx) => {
      return tx.delete(blockedTime).where(eq(blockedTime.id, id));
    });

    return { success: true };
  });

// ============================================================================
// SCHEDULING LIMITS
// ============================================================================

// List scheduling limits for a calendar
export const listSchedulingLimits = authed
  .input(calendarIdInput.merge(cursorPaginationInput))
  .handler(async ({ input, context }) => {
    const { calendarId, cursor, limit } = input;
    const { orgId } = context;

    await verifyCalendarAccess(orgId, calendarId);

    const results = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(schedulingLimits)
        .where(
          and(
            eq(schedulingLimits.calendarId, calendarId),
            cursor ? gt(schedulingLimits.id, cursor) : undefined,
          ),
        )
        .limit(limit + 1)
        .orderBy(schedulingLimits.id);
    });

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  });

// Get single scheduling limits entry
export const getSchedulingLimits = authed
  .input(idInput)
  .handler(async ({ input, context }) => {
    const { id } = input;
    const { orgId } = context;

    const [limits] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(schedulingLimits)
        .where(eq(schedulingLimits.id, id))
        .limit(1);
    });

    if (!limits) {
      throw new ApplicationError("Scheduling limits not found", {
        code: "NOT_FOUND",
      });
    }

    if (limits.calendarId) {
      await verifyCalendarAccess(orgId, limits.calendarId);
    }

    return limits;
  });

// Create scheduling limits
export const createSchedulingLimits = authed
  .input(z.object({ data: createSchedulingLimitsSchema }))
  .handler(async ({ input, context }) => {
    const { data } = input;
    const { orgId } = context;

    if (data.calendarId) {
      await verifyCalendarAccess(orgId, data.calendarId);
    }

    const [limits] = await withOrg(orgId, async (tx) => {
      return tx
        .insert(schedulingLimits)
        .values({
          calendarId: data.calendarId ?? null,
          groupId: data.groupId ?? null,
          minNoticeHours: data.minNoticeHours ?? null,
          maxNoticeDays: data.maxNoticeDays ?? null,
          maxPerSlot: data.maxPerSlot ?? null,
          maxPerDay: data.maxPerDay ?? null,
          maxPerWeek: data.maxPerWeek ?? null,
        })
        .returning();
    });

    return limits;
  });

// Update scheduling limits
export const updateSchedulingLimits = authed
  .input(idInput.merge(z.object({ data: updateSchedulingLimitsSchema })))
  .handler(async ({ input, context }) => {
    const { id, data } = input;
    const { orgId } = context;

    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(schedulingLimits)
        .where(eq(schedulingLimits.id, id))
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Scheduling limits not found", {
        code: "NOT_FOUND",
      });
    }

    if (existing.calendarId) {
      await verifyCalendarAccess(orgId, existing.calendarId);
    }

    const [updated] = await withOrg(orgId, async (tx) => {
      return tx
        .update(schedulingLimits)
        .set({
          minNoticeHours:
            data.minNoticeHours !== undefined
              ? data.minNoticeHours
              : existing.minNoticeHours,
          maxNoticeDays:
            data.maxNoticeDays !== undefined
              ? data.maxNoticeDays
              : existing.maxNoticeDays,
          maxPerSlot:
            data.maxPerSlot !== undefined
              ? data.maxPerSlot
              : existing.maxPerSlot,
          maxPerDay:
            data.maxPerDay !== undefined ? data.maxPerDay : existing.maxPerDay,
          maxPerWeek:
            data.maxPerWeek !== undefined
              ? data.maxPerWeek
              : existing.maxPerWeek,
        })
        .where(eq(schedulingLimits.id, id))
        .returning();
    });

    return updated;
  });

// Delete scheduling limits
export const deleteSchedulingLimits = authed
  .input(idInput)
  .handler(async ({ input, context }) => {
    const { id } = input;
    const { orgId } = context;

    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(schedulingLimits)
        .where(eq(schedulingLimits.id, id))
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Scheduling limits not found", {
        code: "NOT_FOUND",
      });
    }

    if (existing.calendarId) {
      await verifyCalendarAccess(orgId, existing.calendarId);
    }

    await withOrg(orgId, async (tx) => {
      return tx.delete(schedulingLimits).where(eq(schedulingLimits.id, id));
    });

    return { success: true };
  });

// ============================================================================
// ROUTE EXPORTS
// ============================================================================

export const availabilityRulesRoutes = {
  list: listRules,
  get: getRule,
  create: createRule,
  update: updateRule,
  delete: deleteRule,
  setWeekly: setWeeklyAvailability,
};

export const availabilityOverridesRoutes = {
  list: listOverrides,
  get: getOverride,
  create: createOverride,
  update: updateOverride,
  delete: deleteOverride,
};

export const blockedTimeRoutes = {
  list: listBlockedTime,
  get: getBlockedTime,
  create: createBlockedTime,
  update: updateBlockedTime,
  delete: deleteBlockedTime,
};

export const schedulingLimitsRoutes = {
  list: listSchedulingLimits,
  get: getSchedulingLimits,
  create: createSchedulingLimits,
  update: updateSchedulingLimits,
  delete: deleteSchedulingLimits,
};

// ============================================================================
// AVAILABILITY ENGINE ROUTES
// ============================================================================

// Get available dates
export const getDates = authed
  .input(availabilityQuerySchema)
  .handler(async ({ input, context }) => {
    const { orgId, userId } = context;

    // Verify all calendars belong to this org
    for (const calendarId of input.calendarIds) {
      await verifyCalendarAccess(orgId, calendarId);
    }

    const dates = await availabilityService.getAvailableDates(input, {
      orgId,
      userId: userId!,
    });

    return { dates };
  });

// Get available time slots
export const getTimes = authed
  .input(availabilityQuerySchema)
  .handler(async ({ input, context }) => {
    const { orgId, userId } = context;

    // Verify all calendars belong to this org
    for (const calendarId of input.calendarIds) {
      await verifyCalendarAccess(orgId, calendarId);
    }

    const slots = await availabilityService.getAvailableSlots(input, {
      orgId,
      userId: userId!,
    });

    // Transform Date objects to ISO strings for serialization
    return {
      slots: slots.map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        available: slot.available,
        remainingCapacity: slot.remainingCapacity,
      })),
    };
  });

// Check if a specific slot is available
export const checkSlot = authed
  .input(availabilityCheckSchema)
  .handler(async ({ input, context }) => {
    const { orgId, userId } = context;
    const { appointmentTypeId, calendarId, startTime, timezone } = input;

    await verifyCalendarAccess(orgId, calendarId);

    const result = await availabilityService.checkSlot(
      appointmentTypeId,
      calendarId,
      new Date(startTime),
      timezone,
      { orgId, userId: userId! },
    );

    return result;
  });

export const availabilityEngineRoutes = {
  dates: getDates,
  times: getTimes,
  check: checkSlot,
};

export const availabilityRoutes = {
  rules: availabilityRulesRoutes,
  overrides: availabilityOverridesRoutes,
  blockedTime: blockedTimeRoutes,
  schedulingLimits: schedulingLimitsRoutes,
  engine: availabilityEngineRoutes,
};
