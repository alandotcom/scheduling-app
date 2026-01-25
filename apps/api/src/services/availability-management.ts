// Availability management service - business logic for rules, overrides, blocked time, limits

import { availabilityManagementRepository } from "../repositories/availability-management.js";
import type {
  AvailabilityRule,
  AvailabilityOverride,
  BlockedTime,
  SchedulingLimits,
  RuleCreateInput,
  RuleUpdateInput,
  OverrideCreateInput,
  OverrideUpdateInput,
  BlockedTimeCreateInput,
  BlockedTimeUpdateInput,
  LimitsCreateInput,
  LimitsUpdateInput,
} from "../repositories/availability-management.js";
import type { PaginationInput, PaginatedResult } from "../repositories/base.js";
import { withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import type { ServiceContext } from "./locations.js";

// Helper to check time range overlap
function hasOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  return start1 < end2 && end1 > start2;
}

export class AvailabilityManagementService {
  // ============================================================================
  // SHARED HELPERS
  // ============================================================================

  private async ensureCalendarAccess(
    orgId: string,
    calendarId: string,
  ): Promise<void> {
    const exists = await withOrg(orgId, (tx) =>
      availabilityManagementRepository.verifyCalendarAccess(tx, orgId, calendarId),
    );
    if (!exists) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }
  }

  // ============================================================================
  // AVAILABILITY RULES
  // ============================================================================

  async listRules(
    calendarId: string,
    input: PaginationInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<AvailabilityRule>> {
    await this.ensureCalendarAccess(context.orgId, calendarId);
    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.findRulesByCalendar(
        tx,
        context.orgId,
        calendarId,
        input,
      ),
    );
  }

  async getRule(id: string, context: ServiceContext): Promise<AvailabilityRule> {
    return withOrg(context.orgId, async (tx) => {
      const rule = await availabilityManagementRepository.findRuleById(
        tx,
        context.orgId,
        id,
      );
      if (!rule) {
        throw new ApplicationError("Availability rule not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, rule.calendarId);
      return rule;
    });
  }

  async createRule(
    calendarId: string,
    input: RuleCreateInput,
    context: ServiceContext,
  ): Promise<AvailabilityRule> {
    await this.ensureCalendarAccess(context.orgId, calendarId);

    return withOrg(context.orgId, async (tx) => {
      // Check for overlapping rules
      const existing = await availabilityManagementRepository.findRulesByWeekday(
        tx,
        context.orgId,
        calendarId,
        input.weekday,
      );

      for (const rule of existing) {
        if (hasOverlap(input.startTime, input.endTime, rule.startTime, rule.endTime)) {
          throw new ApplicationError(
            `Overlapping rule exists for weekday ${input.weekday}: ${rule.startTime}-${rule.endTime}`,
            { code: "CONFLICT" },
          );
        }
      }

      return availabilityManagementRepository.createRule(
        tx,
        context.orgId,
        calendarId,
        input,
      );
    });
  }

  async updateRule(
    id: string,
    input: RuleUpdateInput,
    context: ServiceContext,
  ): Promise<AvailabilityRule> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await availabilityManagementRepository.findRuleById(
        tx,
        context.orgId,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability rule not found", {
          code: "NOT_FOUND",
        });
      }

      await this.ensureCalendarAccess(context.orgId, existing.calendarId);

      // Check for overlaps with new values
      const newWeekday = input.weekday ?? existing.weekday;
      const newStartTime = input.startTime ?? existing.startTime;
      const newEndTime = input.endTime ?? existing.endTime;

      const others = await availabilityManagementRepository.findRulesByWeekday(
        tx,
        context.orgId,
        existing.calendarId,
        newWeekday,
      );

      for (const other of others) {
        if (other.id === id) continue;
        if (hasOverlap(newStartTime, newEndTime, other.startTime, other.endTime)) {
          throw new ApplicationError(
            `Overlapping rule exists for weekday ${newWeekday}: ${other.startTime}-${other.endTime}`,
            { code: "CONFLICT" },
          );
        }
      }

      const updated = await availabilityManagementRepository.updateRule(
        tx,
        context.orgId,
        id,
        {
          weekday: input.weekday ?? existing.weekday,
          startTime: input.startTime ?? existing.startTime,
          endTime: input.endTime ?? existing.endTime,
          intervalMin: input.intervalMin !== undefined ? input.intervalMin : existing.intervalMin,
          groupId: input.groupId !== undefined ? input.groupId : existing.groupId,
        },
      );
      return updated!;
    });
  }

  async deleteRule(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await availabilityManagementRepository.findRuleById(
        tx,
        context.orgId,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability rule not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, existing.calendarId);
      await availabilityManagementRepository.deleteRule(tx, context.orgId, id);
      return { success: true };
    });
  }

  async setWeeklyAvailability(
    calendarId: string,
    rules: RuleCreateInput[],
    context: ServiceContext,
  ): Promise<{ rules: AvailabilityRule[] }> {
    await this.ensureCalendarAccess(context.orgId, calendarId);

    // Validate no overlaps within the new rules
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i]!;
        const b = rules[j]!;
        if (
          a.weekday === b.weekday &&
          hasOverlap(a.startTime, a.endTime, b.startTime, b.endTime)
        ) {
          throw new ApplicationError(
            `Overlapping rules for weekday ${a.weekday}`,
            { code: "BAD_REQUEST" },
          );
        }
      }
    }

    return withOrg(context.orgId, async (tx) => {
      await availabilityManagementRepository.deleteRulesByCalendar(
        tx,
        context.orgId,
        calendarId,
      );
      const inserted = await availabilityManagementRepository.createRulesBatch(
        tx,
        context.orgId,
        calendarId,
        rules,
      );
      return { rules: inserted };
    });
  }

  // ============================================================================
  // AVAILABILITY OVERRIDES
  // ============================================================================

  async listOverrides(
    calendarId: string,
    input: PaginationInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<AvailabilityOverride>> {
    await this.ensureCalendarAccess(context.orgId, calendarId);
    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.findOverridesByCalendar(
        tx,
        context.orgId,
        calendarId,
        input,
      ),
    );
  }

  async getOverride(
    id: string,
    context: ServiceContext,
  ): Promise<AvailabilityOverride> {
    return withOrg(context.orgId, async (tx) => {
      const override = await availabilityManagementRepository.findOverrideById(
        tx,
        context.orgId,
        id,
      );
      if (!override) {
        throw new ApplicationError("Availability override not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, override.calendarId);
      return override;
    });
  }

  async createOverride(
    calendarId: string,
    input: OverrideCreateInput,
    context: ServiceContext,
  ): Promise<AvailabilityOverride> {
    await this.ensureCalendarAccess(context.orgId, calendarId);

    return withOrg(context.orgId, async (tx) => {
      const existing = await availabilityManagementRepository.findOverrideByDate(
        tx,
        context.orgId,
        calendarId,
        input.date,
      );
      if (existing) {
        throw new ApplicationError(
          `Override already exists for date ${input.date}`,
          { code: "CONFLICT" },
        );
      }
      return availabilityManagementRepository.createOverride(
        tx,
        context.orgId,
        calendarId,
        input,
      );
    });
  }

  async updateOverride(
    id: string,
    input: OverrideUpdateInput,
    context: ServiceContext,
  ): Promise<AvailabilityOverride> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await availabilityManagementRepository.findOverrideById(
        tx,
        context.orgId,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability override not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, existing.calendarId);

      // Check for date conflicts if changing date
      if (input.date && input.date !== existing.date) {
        const conflicting = await availabilityManagementRepository.findOverrideByDate(
          tx,
          context.orgId,
          existing.calendarId,
          input.date,
        );
        if (conflicting) {
          throw new ApplicationError(
            `Override already exists for date ${input.date}`,
            { code: "CONFLICT" },
          );
        }
      }

      const updated = await availabilityManagementRepository.updateOverride(
        tx,
        context.orgId,
        id,
        {
          date: input.date ?? existing.date,
          startTime: input.startTime !== undefined ? input.startTime : existing.startTime,
          endTime: input.endTime !== undefined ? input.endTime : existing.endTime,
          isBlocked: input.isBlocked ?? existing.isBlocked ?? false,
          intervalMin: input.intervalMin !== undefined ? input.intervalMin : existing.intervalMin,
          groupId: input.groupId !== undefined ? input.groupId : existing.groupId,
        },
      );
      return updated!;
    });
  }

  async deleteOverride(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await availabilityManagementRepository.findOverrideById(
        tx,
        context.orgId,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability override not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, existing.calendarId);
      await availabilityManagementRepository.deleteOverride(tx, context.orgId, id);
      return { success: true };
    });
  }

  // ============================================================================
  // BLOCKED TIME
  // ============================================================================

  async listBlockedTime(
    calendarId: string,
    input: PaginationInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<BlockedTime>> {
    await this.ensureCalendarAccess(context.orgId, calendarId);
    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.findBlockedTimeByCalendar(
        tx,
        context.orgId,
        calendarId,
        input,
      ),
    );
  }

  async getBlockedTime(id: string, context: ServiceContext): Promise<BlockedTime> {
    return withOrg(context.orgId, async (tx) => {
      const block = await availabilityManagementRepository.findBlockedTimeById(
        tx,
        context.orgId,
        id,
      );
      if (!block) {
        throw new ApplicationError("Blocked time not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, block.calendarId);
      return block;
    });
  }

  async createBlockedTime(
    calendarId: string,
    input: BlockedTimeCreateInput,
    context: ServiceContext,
  ): Promise<BlockedTime> {
    await this.ensureCalendarAccess(context.orgId, calendarId);
    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.createBlockedTime(
        tx,
        context.orgId,
        calendarId,
        input,
      ),
    );
  }

  async updateBlockedTime(
    id: string,
    input: BlockedTimeUpdateInput,
    context: ServiceContext,
  ): Promise<BlockedTime> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await availabilityManagementRepository.findBlockedTimeById(
        tx,
        context.orgId,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Blocked time not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, existing.calendarId);

      const updated = await availabilityManagementRepository.updateBlockedTime(
        tx,
        context.orgId,
        id,
        {
          startAt: input.startAt ?? existing.startAt,
          endAt: input.endAt ?? existing.endAt,
          recurringRule: input.recurringRule !== undefined ? input.recurringRule : existing.recurringRule,
        },
      );
      return updated!;
    });
  }

  async deleteBlockedTime(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await availabilityManagementRepository.findBlockedTimeById(
        tx,
        context.orgId,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Blocked time not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, existing.calendarId);
      await availabilityManagementRepository.deleteBlockedTime(tx, context.orgId, id);
      return { success: true };
    });
  }

  // ============================================================================
  // SCHEDULING LIMITS
  // ============================================================================

  async listLimits(
    calendarId: string,
    input: PaginationInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<SchedulingLimits>> {
    await this.ensureCalendarAccess(context.orgId, calendarId);
    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.findLimitsByCalendar(
        tx,
        context.orgId,
        calendarId,
        input,
      ),
    );
  }

  async getLimits(id: string, context: ServiceContext): Promise<SchedulingLimits> {
    return withOrg(context.orgId, async (tx) => {
      const limits = await availabilityManagementRepository.findLimitsById(
        tx,
        context.orgId,
        id,
      );
      if (!limits) {
        throw new ApplicationError("Scheduling limits not found", {
          code: "NOT_FOUND",
        });
      }
      if (limits.calendarId) {
        await this.ensureCalendarAccess(context.orgId, limits.calendarId);
      }
      return limits;
    });
  }

  async createLimits(
    input: LimitsCreateInput,
    context: ServiceContext,
  ): Promise<SchedulingLimits> {
    if (input.calendarId) {
      await this.ensureCalendarAccess(context.orgId, input.calendarId);
    }
    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.createLimits(tx, context.orgId, input),
    );
  }

  async updateLimits(
    id: string,
    input: LimitsUpdateInput,
    context: ServiceContext,
  ): Promise<SchedulingLimits> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await availabilityManagementRepository.findLimitsById(
        tx,
        context.orgId,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Scheduling limits not found", {
          code: "NOT_FOUND",
        });
      }
      if (existing.calendarId) {
        await this.ensureCalendarAccess(context.orgId, existing.calendarId);
      }

      const updated = await availabilityManagementRepository.updateLimits(
        tx,
        context.orgId,
        id,
        {
          minNoticeHours: input.minNoticeHours !== undefined ? input.minNoticeHours : existing.minNoticeHours,
          maxNoticeDays: input.maxNoticeDays !== undefined ? input.maxNoticeDays : existing.maxNoticeDays,
          maxPerSlot: input.maxPerSlot !== undefined ? input.maxPerSlot : existing.maxPerSlot,
          maxPerDay: input.maxPerDay !== undefined ? input.maxPerDay : existing.maxPerDay,
          maxPerWeek: input.maxPerWeek !== undefined ? input.maxPerWeek : existing.maxPerWeek,
        },
      );
      return updated!;
    });
  }

  async deleteLimits(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await availabilityManagementRepository.findLimitsById(
        tx,
        context.orgId,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Scheduling limits not found", {
          code: "NOT_FOUND",
        });
      }
      if (existing.calendarId) {
        await this.ensureCalendarAccess(context.orgId, existing.calendarId);
      }
      await availabilityManagementRepository.deleteLimits(tx, context.orgId, id);
      return { success: true };
    });
  }
}

// Singleton instance
export const availabilityManagementService = new AvailabilityManagementService();
