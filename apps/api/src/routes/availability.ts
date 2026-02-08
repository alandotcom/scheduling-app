// oRPC routes for availability CRUD
// - Weekly availability rules (per weekday, start/end time, interval)
// - Date overrides (specific dates, blocked or custom hours)
// - Blocked time ranges (single or recurring via RRULE)
// - Scheduling limits (min/max notice, per-slot/day/week caps)

import { z } from "zod";
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
  availabilityFeedQuerySchema,
  availabilityFeedResponseSchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { availabilityManagementService } from "../services/availability-management.js";
import { availabilityService } from "../services/availability-engine/index.js";

const calendarIdInput = z.object({ calendarId: z.string().uuid() });
const idInput = z.object({ id: z.string().uuid() });
const cursorPaginationInput = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// ============================================================================
// WEEKLY AVAILABILITY RULES
// ============================================================================

export const listRules = authed
  .input(calendarIdInput.merge(cursorPaginationInput))
  .handler(({ input, context }) =>
    availabilityManagementService.listRules(input.calendarId, input, context),
  );

export const getRule = authed
  .input(idInput)
  .handler(({ input, context }) =>
    availabilityManagementService.getRule(input.id, context),
  );

export const createRule = authed
  .input(
    calendarIdInput.merge(z.object({ data: createAvailabilityRuleSchema })),
  )
  .handler(({ input, context }) =>
    availabilityManagementService.createRule(
      input.calendarId,
      input.data,
      context,
    ),
  );

export const updateRule = authed
  .input(idInput.merge(z.object({ data: updateAvailabilityRuleSchema })))
  .handler(({ input, context }) =>
    availabilityManagementService.updateRule(input.id, input.data, context),
  );

export const deleteRule = authed
  .input(idInput)
  .handler(({ input, context }) =>
    availabilityManagementService.deleteRule(input.id, context),
  );

export const setWeeklyAvailability = authed
  .input(calendarIdInput.merge(setWeeklyAvailabilitySchema))
  .handler(({ input, context }) =>
    availabilityManagementService.setWeeklyAvailability(
      input.calendarId,
      input.rules,
      context,
    ),
  );

// ============================================================================
// AVAILABILITY OVERRIDES
// ============================================================================

export const listOverrides = authed
  .input(calendarIdInput.merge(cursorPaginationInput))
  .handler(({ input, context }) =>
    availabilityManagementService.listOverrides(
      input.calendarId,
      input,
      context,
    ),
  );

export const getOverride = authed
  .input(idInput)
  .handler(({ input, context }) =>
    availabilityManagementService.getOverride(input.id, context),
  );

export const createOverride = authed
  .input(
    calendarIdInput.merge(z.object({ data: createAvailabilityOverrideSchema })),
  )
  .handler(({ input, context }) =>
    availabilityManagementService.createOverride(
      input.calendarId,
      input.data,
      context,
    ),
  );

export const updateOverride = authed
  .input(idInput.merge(z.object({ data: updateAvailabilityOverrideSchema })))
  .handler(({ input, context }) =>
    availabilityManagementService.updateOverride(input.id, input.data, context),
  );

export const deleteOverride = authed
  .input(idInput)
  .handler(({ input, context }) =>
    availabilityManagementService.deleteOverride(input.id, context),
  );

// ============================================================================
// BLOCKED TIME
// ============================================================================

export const listBlockedTime = authed
  .input(calendarIdInput.merge(cursorPaginationInput))
  .handler(({ input, context }) =>
    availabilityManagementService.listBlockedTime(
      input.calendarId,
      input,
      context,
    ),
  );

export const getBlockedTime = authed
  .input(idInput)
  .handler(({ input, context }) =>
    availabilityManagementService.getBlockedTime(input.id, context),
  );

export const createBlockedTime = authed
  .input(calendarIdInput.merge(z.object({ data: createBlockedTimeSchema })))
  .handler(({ input, context }) =>
    availabilityManagementService.createBlockedTime(
      input.calendarId,
      {
        startAt: new Date(input.data.startAt),
        endAt: new Date(input.data.endAt),
        recurringRule: input.data.recurringRule,
      },
      context,
    ),
  );

export const updateBlockedTime = authed
  .input(idInput.merge(z.object({ data: updateBlockedTimeSchema })))
  .handler(({ input, context }) =>
    availabilityManagementService.updateBlockedTime(
      input.id,
      {
        startAt: input.data.startAt ? new Date(input.data.startAt) : undefined,
        endAt: input.data.endAt ? new Date(input.data.endAt) : undefined,
        recurringRule: input.data.recurringRule,
      },
      context,
    ),
  );

export const deleteBlockedTime = authed
  .input(idInput)
  .handler(({ input, context }) =>
    availabilityManagementService.deleteBlockedTime(input.id, context),
  );

// ============================================================================
// SCHEDULING LIMITS
// ============================================================================

export const listSchedulingLimits = authed
  .input(calendarIdInput.merge(cursorPaginationInput))
  .handler(({ input, context }) =>
    availabilityManagementService.listLimits(input.calendarId, input, context),
  );

export const getSchedulingLimits = authed
  .input(idInput)
  .handler(({ input, context }) =>
    availabilityManagementService.getLimits(input.id, context),
  );

export const createSchedulingLimits = authed
  .input(z.object({ data: createSchedulingLimitsSchema }))
  .handler(({ input, context }) =>
    availabilityManagementService.createLimits(input.data, context),
  );

export const updateSchedulingLimits = authed
  .input(idInput.merge(z.object({ data: updateSchedulingLimitsSchema })))
  .handler(({ input, context }) =>
    availabilityManagementService.updateLimits(input.id, input.data, context),
  );

export const deleteSchedulingLimits = authed
  .input(idInput)
  .handler(({ input, context }) =>
    availabilityManagementService.deleteLimits(input.id, context),
  );

// ============================================================================
// AVAILABILITY FEED (Schedule shading)
// ============================================================================

export const feed = authed
  .route({ method: "GET", path: "/availability/feed" })
  .input(availabilityFeedQuerySchema)
  .handler(async ({ input, context }) => {
    const result = await availabilityManagementService.getAvailabilityFeed(
      input,
      {
        orgId: context.orgId,
        userId: context.userId,
      },
    );
    return availabilityFeedResponseSchema.parse(result);
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

export const getDates = authed
  .route({ method: "GET", path: "/availability/dates" })
  .input(availabilityQuerySchema)
  .handler(async ({ input, context }) => {
    const dates = await availabilityService.getAvailableDates(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
    return { dates };
  });

export const getTimes = authed
  .route({ method: "GET", path: "/availability/times" })
  .input(availabilityQuerySchema)
  .handler(async ({ input, context }) => {
    const slots = await availabilityService.getAvailableSlots(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
    return {
      slots: slots.map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        available: slot.available,
        remainingCapacity: slot.remainingCapacity,
      })),
    };
  });

export const checkSlot = authed
  .route({ method: "GET", path: "/availability/check" })
  .input(availabilityCheckSchema)
  .handler(({ input, context }) =>
    availabilityService.checkSlot(
      input.appointmentTypeId,
      input.calendarId,
      new Date(input.startTime),
      input.timezone,
      { orgId: context.orgId, userId: context.userId },
    ),
  );

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
  feed,
  engine: availabilityEngineRoutes,
};
