// Availability management service - business logic for rules, overrides, blocked time, limits

import { DateTime } from "luxon";
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
  LimitsUpdateInput,
} from "../repositories/availability-management.js";
import type { PaginationInput, PaginatedResult } from "../repositories/base.js";
import { withOrg, type OrgScopedTx } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import {
  parseHm,
  setZonedTime,
  sundayZeroWeekday,
} from "./availability-engine/calendar-time.js";
import type { ServiceContext } from "./locations.js";
import type {
  AvailabilityFeedItem,
  AvailabilityFeedQuery,
} from "@scheduling/dto";

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
    tx?: OrgScopedTx,
  ): Promise<void> {
    const exists = tx
      ? await availabilityManagementRepository.verifyCalendarAccess(
          tx,
          calendarId,
        )
      : await withOrg(orgId, (orgTx) =>
          availabilityManagementRepository.verifyCalendarAccess(
            orgTx,
            calendarId,
          ),
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
        calendarId,
        input,
      ),
    );
  }

  async getRule(
    id: string,
    context: ServiceContext,
  ): Promise<AvailabilityRule> {
    return withOrg(context.orgId, async (tx) => {
      const rule = await availabilityManagementRepository.findRuleById(tx, id);
      if (!rule) {
        throw new ApplicationError("Availability rule not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, rule.calendarId, tx);
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
    context: ServiceContext,
  ): Promise<AvailabilityRule> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await availabilityManagementRepository.findRuleById(
        tx,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability rule not found", {
          code: "NOT_FOUND",
        });
      }

      await this.ensureCalendarAccess(context.orgId, existing.calendarId, tx);

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
          groupId:
            input.groupId !== undefined ? input.groupId : existing.groupId,
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
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability rule not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, existing.calendarId, tx);
      await availabilityManagementRepository.deleteRule(tx, id);
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
    context: ServiceContext,
  ): Promise<PaginatedResult<AvailabilityOverride>> {
    await this.ensureCalendarAccess(context.orgId, calendarId);
    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.findOverridesByCalendar(
        tx,
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
        id,
      );
      if (!override) {
        throw new ApplicationError("Availability override not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, override.calendarId, tx);
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
    context: ServiceContext,
  ): Promise<AvailabilityOverride> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await availabilityManagementRepository.findOverrideById(
        tx,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability override not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, existing.calendarId, tx);

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
          timeRanges:
            input.timeRanges !== undefined
              ? input.timeRanges
              : existing.timeRanges,
          groupId:
            input.groupId !== undefined ? input.groupId : existing.groupId,
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
        id,
      );
      if (!existing) {
        throw new ApplicationError("Availability override not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, existing.calendarId, tx);
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
    context: ServiceContext,
  ): Promise<PaginatedResult<BlockedTime>> {
    await this.ensureCalendarAccess(context.orgId, calendarId);
    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.findBlockedTimeByCalendar(
        tx,
        calendarId,
        input,
      ),
    );
  }

  async getBlockedTime(
    id: string,
    context: ServiceContext,
  ): Promise<BlockedTime> {
    return withOrg(context.orgId, async (tx) => {
      const block = await availabilityManagementRepository.findBlockedTimeById(
        tx,
        id,
      );
      if (!block) {
        throw new ApplicationError("Blocked time not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, block.calendarId, tx);
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
      availabilityManagementRepository.createBlockedTime(tx, calendarId, input),
    );
  }

  async updateBlockedTime(
    id: string,
    input: BlockedTimeUpdateInput,
    context: ServiceContext,
  ): Promise<BlockedTime> {
    return withOrg(context.orgId, async (tx) => {
      const existing =
        await availabilityManagementRepository.findBlockedTimeById(tx, id);
      if (!existing) {
        throw new ApplicationError("Blocked time not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, existing.calendarId, tx);

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

  async deleteBlockedTime(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      const existing =
        await availabilityManagementRepository.findBlockedTimeById(tx, id);
      if (!existing) {
        throw new ApplicationError("Blocked time not found", {
          code: "NOT_FOUND",
        });
      }
      await this.ensureCalendarAccess(context.orgId, existing.calendarId, tx);
      await availabilityManagementRepository.deleteBlockedTime(tx, id);
      return { success: true };
    });
  }

  // ============================================================================
  // SCHEDULING LIMITS
  // ============================================================================

  async getOrgDefaultLimits(
    context: ServiceContext,
  ): Promise<SchedulingLimits | null> {
    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.findOrgDefaultLimits(tx),
    );
  }

  async getCalendarLimits(
    calendarId: string,
    context: ServiceContext,
  ): Promise<SchedulingLimits | null> {
    await this.ensureCalendarAccess(context.orgId, calendarId);
    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.findLimitsByCalendarId(tx, calendarId),
    );
  }

  async upsertOrgDefaultLimits(
    input: LimitsUpdateInput,
    context: ServiceContext,
  ): Promise<SchedulingLimits> {
    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.upsertOrgDefaultLimits(tx, input),
    );
  }

  async upsertCalendarLimits(
    calendarId: string,
    input: LimitsUpdateInput,
    context: ServiceContext,
  ): Promise<SchedulingLimits> {
    await this.ensureCalendarAccess(context.orgId, calendarId);

    return withOrg(context.orgId, (tx) =>
      availabilityManagementRepository.upsertCalendarLimits(
        tx,
        calendarId,
        input,
      ),
    );
  }

  // ============================================================================
  // AVAILABILITY FEED (Schedule shading)
  // ============================================================================

  async getAvailabilityFeed(
    input: AvailabilityFeedQuery,
    context: ServiceContext,
  ): Promise<{ items: AvailabilityFeedItem[] }> {
    const { calendarIds, startAt, endAt, timezone } = input;

    await Promise.all(
      calendarIds.map((calendarId) =>
        this.ensureCalendarAccess(context.orgId, calendarId),
      ),
    );

    const rangeStart = DateTime.fromJSDate(startAt, { zone: timezone });
    const rangeEnd = DateTime.fromJSDate(endAt, { zone: timezone });
    const rangeStartMillis = rangeStart.toMillis();
    const rangeEndMillis = rangeEnd.toMillis();
    const startDate = rangeStart.toISODate();
    const endDate = rangeEnd.toISODate();

    if (!startDate || !endDate) {
      throw new ApplicationError("Invalid date range", {
        code: "INVALID_DATE_RANGE",
      });
    }

    const [rules, overrides, blocked] = await withOrg(
      context.orgId,
      async (tx) => {
        const [rulesResult, overridesResult, blockedResult] = await Promise.all(
          [
            availabilityManagementRepository.findRulesByCalendarIds(
              tx,
              calendarIds,
            ),
            availabilityManagementRepository.findOverridesByCalendarIdsInRange(
              tx,
              calendarIds,
              startDate,
              endDate,
            ),
            availabilityManagementRepository.findBlockedTimeByCalendarIdsInRange(
              tx,
              calendarIds,
              startAt,
              endAt,
            ),
          ],
        );

        return [rulesResult, overridesResult, blockedResult] as const;
      },
    );

    const items: AvailabilityFeedItem[] = [];

    const dayStart = rangeStart.startOf("day");
    const dayEnd = rangeEnd.startOf("day");

    for (const rule of rules) {
      for (
        let cursor = dayStart;
        cursor.toMillis() <= dayEnd.toMillis();
        cursor = cursor.plus({ days: 1 })
      ) {
        const weekday = sundayZeroWeekday(cursor);
        if (weekday !== rule.weekday) continue;

        const start = setZonedTime(cursor, parseHm(rule.startTime));
        const end = setZonedTime(cursor, parseHm(rule.endTime));

        if (end.toMillis() <= start.toMillis()) continue;
        if (
          end.toMillis() <= rangeStartMillis ||
          start.toMillis() >= rangeEndMillis
        ) {
          continue;
        }

        items.push({
          type: "working_hours",
          startAt: start.toJSDate(),
          endAt: end.toJSDate(),
          calendarId: rule.calendarId,
          label: "Working hours",
          reason: null,
          sourceId: rule.id,
        });
      }
    }

    for (const override of overrides) {
      const day = DateTime.fromISO(override.date, { zone: timezone });
      if (override.timeRanges.length === 0) {
        const start = day.startOf("day");
        const end = day.endOf("day");

        if (
          end.toMillis() <= rangeStartMillis ||
          start.toMillis() >= rangeEndMillis
        ) {
          continue;
        }

        items.push({
          type: "override_closed",
          startAt: start.toJSDate(),
          endAt: end.toJSDate(),
          calendarId: override.calendarId,
          label: "Override (closed)",
          reason: null,
          sourceId: override.id,
        });
        continue;
      }

      for (const timeRange of override.timeRanges) {
        const start = setZonedTime(day, parseHm(timeRange.startTime));
        const end = setZonedTime(day, parseHm(timeRange.endTime));

        if (end.toMillis() <= start.toMillis()) continue;
        if (
          end.toMillis() <= rangeStartMillis ||
          start.toMillis() >= rangeEndMillis
        ) {
          continue;
        }

        items.push({
          type: "override_open",
          startAt: start.toJSDate(),
          endAt: end.toJSDate(),
          calendarId: override.calendarId,
          label: "Override (open)",
          reason: null,
          sourceId: override.id,
        });
      }
    }

    for (const block of blocked) {
      items.push({
        type: "blocked_time",
        startAt: block.startAt,
        endAt: block.endAt,
        calendarId: block.calendarId,
        label: "Blocked time",
        reason: null,
        sourceId: block.id,
      });
    }

    items.sort((a, b) => {
      const startDiff = a.startAt.getTime() - b.startAt.getTime();
      if (startDiff !== 0) return startDiff;
      return (a.sourceId ?? "").localeCompare(b.sourceId ?? "");
    });

    return { items };
  }
}

// Singleton instance
export const availabilityManagementService =
  new AvailabilityManagementService();
