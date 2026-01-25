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
  .handler(({ input }) =>
    availabilityManagementService.listRules(input.calendarId, input),
  );

export const getRule = authed
  .input(idInput)
  .handler(({ input }) => availabilityManagementService.getRule(input.id));

export const createRule = authed
  .input(
    calendarIdInput.merge(z.object({ data: createAvailabilityRuleSchema })),
  )
  .handler(({ input }) =>
    availabilityManagementService.createRule(input.calendarId, input.data),
  );

export const updateRule = authed
  .input(idInput.merge(z.object({ data: updateAvailabilityRuleSchema })))
  .handler(({ input }) =>
    availabilityManagementService.updateRule(input.id, input.data),
  );

export const deleteRule = authed
  .input(idInput)
  .handler(({ input }) => availabilityManagementService.deleteRule(input.id));

export const setWeeklyAvailability = authed
  .input(calendarIdInput.merge(setWeeklyAvailabilitySchema))
  .handler(({ input }) =>
    availabilityManagementService.setWeeklyAvailability(
      input.calendarId,
      input.rules,
    ),
  );

// ============================================================================
// AVAILABILITY OVERRIDES
// ============================================================================

export const listOverrides = authed
  .input(calendarIdInput.merge(cursorPaginationInput))
  .handler(({ input }) =>
    availabilityManagementService.listOverrides(input.calendarId, input),
  );

export const getOverride = authed
  .input(idInput)
  .handler(({ input }) => availabilityManagementService.getOverride(input.id));

export const createOverride = authed
  .input(
    calendarIdInput.merge(z.object({ data: createAvailabilityOverrideSchema })),
  )
  .handler(({ input }) =>
    availabilityManagementService.createOverride(input.calendarId, input.data),
  );

export const updateOverride = authed
  .input(idInput.merge(z.object({ data: updateAvailabilityOverrideSchema })))
  .handler(({ input }) =>
    availabilityManagementService.updateOverride(input.id, input.data),
  );

export const deleteOverride = authed
  .input(idInput)
  .handler(({ input }) =>
    availabilityManagementService.deleteOverride(input.id),
  );

// ============================================================================
// BLOCKED TIME
// ============================================================================

export const listBlockedTime = authed
  .input(calendarIdInput.merge(cursorPaginationInput))
  .handler(({ input }) =>
    availabilityManagementService.listBlockedTime(input.calendarId, input),
  );

export const getBlockedTime = authed
  .input(idInput)
  .handler(({ input }) =>
    availabilityManagementService.getBlockedTime(input.id),
  );

export const createBlockedTime = authed
  .input(calendarIdInput.merge(z.object({ data: createBlockedTimeSchema })))
  .handler(({ input }) =>
    availabilityManagementService.createBlockedTime(input.calendarId, {
      startAt: new Date(input.data.startAt),
      endAt: new Date(input.data.endAt),
      recurringRule: input.data.recurringRule,
    }),
  );

export const updateBlockedTime = authed
  .input(idInput.merge(z.object({ data: updateBlockedTimeSchema })))
  .handler(({ input }) =>
    availabilityManagementService.updateBlockedTime(input.id, {
      startAt: input.data.startAt ? new Date(input.data.startAt) : undefined,
      endAt: input.data.endAt ? new Date(input.data.endAt) : undefined,
      recurringRule: input.data.recurringRule,
    }),
  );

export const deleteBlockedTime = authed
  .input(idInput)
  .handler(({ input }) =>
    availabilityManagementService.deleteBlockedTime(input.id),
  );

// ============================================================================
// SCHEDULING LIMITS
// ============================================================================

export const listSchedulingLimits = authed
  .input(calendarIdInput.merge(cursorPaginationInput))
  .handler(({ input }) =>
    availabilityManagementService.listLimits(input.calendarId, input),
  );

export const getSchedulingLimits = authed
  .input(idInput)
  .handler(({ input }) => availabilityManagementService.getLimits(input.id));

export const createSchedulingLimits = authed
  .input(z.object({ data: createSchedulingLimitsSchema }))
  .handler(({ input }) =>
    availabilityManagementService.createLimits(input.data),
  );

export const updateSchedulingLimits = authed
  .input(idInput.merge(z.object({ data: updateSchedulingLimitsSchema })))
  .handler(({ input }) =>
    availabilityManagementService.updateLimits(input.id, input.data),
  );

export const deleteSchedulingLimits = authed
  .input(idInput)
  .handler(({ input }) => availabilityManagementService.deleteLimits(input.id));

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
  .input(availabilityQuerySchema)
  .handler(async ({ input }) => {
    const dates = await availabilityService.getAvailableDates(input);
    return { dates };
  });

export const getTimes = authed
  .input(availabilityQuerySchema)
  .handler(async ({ input }) => {
    const slots = await availabilityService.getAvailableSlots(input);
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
  .input(availabilityCheckSchema)
  .handler(({ input }) =>
    availabilityService.checkSlot(
      input.appointmentTypeId,
      input.calendarId,
      new Date(input.startTime),
      input.timezone,
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
  engine: availabilityEngineRoutes,
};
