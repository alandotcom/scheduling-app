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
import { withRls } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";

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

  private async ensureCalendarAccess(calendarId: string): Promise<void> {
    const exists = await withRls((tx) =>
      availabilityManagementRepository.verifyCalendarAccess(tx, calendarId),
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
  ): Promise<PaginatedResult<AvailabilityRule>> {
    await this.ensureCalendarAccess(calendarId);
    return withRls((tx) =>
      availabilityManagementRepository.findRulesByCalendar(
        tx,
        calendarId,
        input,
      ),
    );
  }

  async getRule(id: string): Promise<AvailabilityRule> {
    return withRls(async (tx) => {
      const rule = await availabilityManagementRepository.findRuleById(tx, id);
      if (!rule) {
        throw new ApplicationError("Availability rule not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(rule.calendarId);
      return rule;
    });
  }

  async createRule(
    calendarId: string,
    input: RuleCreateInput,
  ): Promise<AvailabilityRule> {
    await this.ensureCalendarAccess(calendarId);

    return withRls(async (tx) => {
      // Check for overlapping rules
      const existing =
        await availabilityManagementRepository.findRulesByWeekday(
          tx,
          calendarId,
          input.weekday,
        );

      for (const rule of existing) {
        if (
          hasOverlap(
            input.startTime,
            input.endTime,
            rule.startTime,
            rule.endTime,
          )
        ) {
          throw new ApplicationError(
            `Overlapping rule exists for weekday ${input.weekday}: ${rule.startTime}-${rule.endTime}`,
            { code: "CONFLICT" },
          );
        }
      }

      return availabilityManagementRepository.createRule(tx, calendarId, input);
    });
  }

  async updateRule(
    id: string,
    input: RuleUpdateInput,
  ): Promise<AvailabilityRule> {
    return withRls(async (tx) => {
      const existing = await availabilityManagementRepository.findRuleById(
        tx,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability rule not found", {
          code: "NOT_FOUND",
        });
      }

      await this.ensureCalendarAccess(existing.calendarId);

      // Check for overlaps with new values
      const newWeekday = input.weekday ?? existing.weekday;
      const newStartTime = input.startTime ?? existing.startTime;
      const newEndTime = input.endTime ?? existing.endTime;

      const others = await availabilityManagementRepository.findRulesByWeekday(
        tx,
        existing.calendarId,
        newWeekday,
      );

      for (const other of others) {
        if (other.id === id) continue;
        if (
          hasOverlap(newStartTime, newEndTime, other.startTime, other.endTime)
        ) {
          throw new ApplicationError(
            `Overlapping rule exists for weekday ${newWeekday}: ${other.startTime}-${other.endTime}`,
            { code: "CONFLICT" },
          );
        }
      }

      const updated = await availabilityManagementRepository.updateRule(
        tx,
        id,
        {
          weekday: input.weekday ?? existing.weekday,
          startTime: input.startTime ?? existing.startTime,
          endTime: input.endTime ?? existing.endTime,
          intervalMin:
            input.intervalMin !== undefined
              ? input.intervalMin
              : existing.intervalMin,
          groupId:
            input.groupId !== undefined ? input.groupId : existing.groupId,
        },
      );
      return updated!;
    });
  }

  async deleteRule(id: string): Promise<{ success: true }> {
    return withRls(async (tx) => {
      const existing = await availabilityManagementRepository.findRuleById(
        tx,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability rule not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(existing.calendarId);
      await availabilityManagementRepository.deleteRule(tx, id);
      return { success: true };
    });
  }

  async setWeeklyAvailability(
    calendarId: string,
    rules: RuleCreateInput[],
  ): Promise<{ rules: AvailabilityRule[] }> {
    await this.ensureCalendarAccess(calendarId);

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

    return withRls(async (tx) => {
      await availabilityManagementRepository.deleteRulesByCalendar(
        tx,
        calendarId,
      );
      const inserted = await availabilityManagementRepository.createRulesBatch(
        tx,
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
  ): Promise<PaginatedResult<AvailabilityOverride>> {
    await this.ensureCalendarAccess(calendarId);
    return withRls((tx) =>
      availabilityManagementRepository.findOverridesByCalendar(
        tx,
        calendarId,
        input,
      ),
    );
  }

  async getOverride(id: string): Promise<AvailabilityOverride> {
    return withRls(async (tx) => {
      const override = await availabilityManagementRepository.findOverrideById(
        tx,
        id,
      );
      if (!override) {
        throw new ApplicationError("Availability override not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(override.calendarId);
      return override;
    });
  }

  async createOverride(
    calendarId: string,
    input: OverrideCreateInput,
  ): Promise<AvailabilityOverride> {
    await this.ensureCalendarAccess(calendarId);

    return withRls(async (tx) => {
      const existing =
        await availabilityManagementRepository.findOverrideByDate(
          tx,
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
        calendarId,
        input,
      );
    });
  }

  async updateOverride(
    id: string,
    input: OverrideUpdateInput,
  ): Promise<AvailabilityOverride> {
    return withRls(async (tx) => {
      const existing = await availabilityManagementRepository.findOverrideById(
        tx,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability override not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(existing.calendarId);

      // Check for date conflicts if changing date
      if (input.date && input.date !== existing.date) {
        const conflicting =
          await availabilityManagementRepository.findOverrideByDate(
            tx,
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
        id,
        {
          date: input.date ?? existing.date,
          startTime:
            input.startTime !== undefined
              ? input.startTime
              : existing.startTime,
          endTime:
            input.endTime !== undefined ? input.endTime : existing.endTime,
          isBlocked: input.isBlocked ?? existing.isBlocked ?? false,
          intervalMin:
            input.intervalMin !== undefined
              ? input.intervalMin
              : existing.intervalMin,
          groupId:
            input.groupId !== undefined ? input.groupId : existing.groupId,
        },
      );
      return updated!;
    });
  }

  async deleteOverride(id: string): Promise<{ success: true }> {
    return withRls(async (tx) => {
      const existing = await availabilityManagementRepository.findOverrideById(
        tx,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability override not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(existing.calendarId);
      await availabilityManagementRepository.deleteOverride(tx, id);
      return { success: true };
    });
  }

  // ============================================================================
  // BLOCKED TIME
  // ============================================================================

  async listBlockedTime(
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<BlockedTime>> {
    await this.ensureCalendarAccess(calendarId);
    return withRls((tx) =>
      availabilityManagementRepository.findBlockedTimeByCalendar(
        tx,
        calendarId,
        input,
      ),
    );
  }

  async getBlockedTime(id: string): Promise<BlockedTime> {
    return withRls(async (tx) => {
      const block = await availabilityManagementRepository.findBlockedTimeById(
        tx,
        id,
      );
      if (!block) {
        throw new ApplicationError("Blocked time not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(block.calendarId);
      return block;
    });
  }

  async createBlockedTime(
    calendarId: string,
    input: BlockedTimeCreateInput,
  ): Promise<BlockedTime> {
    await this.ensureCalendarAccess(calendarId);
    return withRls((tx) =>
      availabilityManagementRepository.createBlockedTime(tx, calendarId, input),
    );
  }

  async updateBlockedTime(
    id: string,
    input: BlockedTimeUpdateInput,
  ): Promise<BlockedTime> {
    return withRls(async (tx) => {
      const existing =
        await availabilityManagementRepository.findBlockedTimeById(tx, id);
      if (!existing) {
        throw new ApplicationError("Blocked time not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(existing.calendarId);

      const updated = await availabilityManagementRepository.updateBlockedTime(
        tx,
        id,
        {
          startAt: input.startAt ?? existing.startAt,
          endAt: input.endAt ?? existing.endAt,
          recurringRule:
            input.recurringRule !== undefined
              ? input.recurringRule
              : existing.recurringRule,
        },
      );
      return updated!;
    });
  }

  async deleteBlockedTime(id: string): Promise<{ success: true }> {
    return withRls(async (tx) => {
      const existing =
        await availabilityManagementRepository.findBlockedTimeById(tx, id);
      if (!existing) {
        throw new ApplicationError("Blocked time not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(existing.calendarId);
      await availabilityManagementRepository.deleteBlockedTime(tx, id);
      return { success: true };
    });
  }

  // ============================================================================
  // SCHEDULING LIMITS
  // ============================================================================

  async listLimits(
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<SchedulingLimits>> {
    await this.ensureCalendarAccess(calendarId);
    return withRls((tx) =>
      availabilityManagementRepository.findLimitsByCalendar(
        tx,
        calendarId,
        input,
      ),
    );
  }

  async getLimits(id: string): Promise<SchedulingLimits> {
    return withRls(async (tx) => {
      const limits = await availabilityManagementRepository.findLimitsById(
        tx,
        id,
      );
      if (!limits) {
        throw new ApplicationError("Scheduling limits not found", {
          code: "NOT_FOUND",
        });
      }
      if (limits.calendarId) {
        await this.ensureCalendarAccess(limits.calendarId);
      }
      return limits;
    });
  }

  async createLimits(input: LimitsCreateInput): Promise<SchedulingLimits> {
    if (input.calendarId) {
      await this.ensureCalendarAccess(input.calendarId);
    }
    return withRls((tx) =>
      availabilityManagementRepository.createLimits(tx, input),
    );
  }

  async updateLimits(
    id: string,
    input: LimitsUpdateInput,
  ): Promise<SchedulingLimits> {
    return withRls(async (tx) => {
      const existing = await availabilityManagementRepository.findLimitsById(
        tx,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Scheduling limits not found", {
          code: "NOT_FOUND",
        });
      }
      if (existing.calendarId) {
        await this.ensureCalendarAccess(existing.calendarId);
      }

      const updated = await availabilityManagementRepository.updateLimits(
        tx,
        id,
        {
          minNoticeHours:
            input.minNoticeHours !== undefined
              ? input.minNoticeHours
              : existing.minNoticeHours,
          maxNoticeDays:
            input.maxNoticeDays !== undefined
              ? input.maxNoticeDays
              : existing.maxNoticeDays,
          maxPerSlot:
            input.maxPerSlot !== undefined
              ? input.maxPerSlot
              : existing.maxPerSlot,
          maxPerDay:
            input.maxPerDay !== undefined
              ? input.maxPerDay
              : existing.maxPerDay,
          maxPerWeek:
            input.maxPerWeek !== undefined
              ? input.maxPerWeek
              : existing.maxPerWeek,
        },
      );
      return updated!;
    });
  }

  async deleteLimits(id: string): Promise<{ success: true }> {
    return withRls(async (tx) => {
      const existing = await availabilityManagementRepository.findLimitsById(
        tx,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Scheduling limits not found", {
          code: "NOT_FOUND",
        });
      }
      if (existing.calendarId) {
        await this.ensureCalendarAccess(existing.calendarId);
      }
      await availabilityManagementRepository.deleteLimits(tx, id);
      return { success: true };
    });
  }
}

// Singleton instance
export const availabilityManagementService =
  new AvailabilityManagementService();
