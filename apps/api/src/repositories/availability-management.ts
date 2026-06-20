// Availability management repository - CRUD for rules, overrides, blocked time, limits

import { eq, and, gt, gte, lte, inArray, isNull, sql } from "drizzle-orm";
import {
  availabilityRules,
  availabilityOverrides,
  blockedTime,
  schedulingLimits,
  calendars,
} from "@scheduling/db/schema";
import type { PaginationInput, PaginatedResult } from "./base.js";
import type { OrgScopedTx } from "../lib/db.js";
import { paginate } from "./base.js";

// Types inferred from schema
export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type AvailabilityOverride = typeof availabilityOverrides.$inferSelect;
export type BlockedTime = typeof blockedTime.$inferSelect;
export type SchedulingLimits = typeof schedulingLimits.$inferSelect;

// Input types for rules
export interface RuleCreateInput {
  weekday: number;
  startTime: string;
  endTime: string;
  groupId?: string | null | undefined;
}

export interface RuleUpdateInput {
  weekday?: number | undefined;
  startTime?: string | undefined;
  endTime?: string | undefined;
  groupId?: string | null | undefined;
}

// Input types for overrides
export interface OverrideCreateInput {
  date: string;
  timeRanges: Array<{ startTime: string; endTime: string }>;
  groupId?: string | null | undefined;
}

export interface OverrideUpdateInput {
  date?: string | undefined;
  timeRanges?: Array<{ startTime: string; endTime: string }> | undefined;
  groupId?: string | null | undefined;
}

// Input types for blocked time
export interface BlockedTimeCreateInput {
  startAt: Date;
  endAt: Date;
  recurringRule?: string | null | undefined;
}

export interface BlockedTimeUpdateInput {
  startAt?: Date | undefined;
  endAt?: Date | undefined;
  recurringRule?: string | null | undefined;
}

export interface LimitsUpdateInput {
  groupId?: string | null | undefined;
  minNoticeMinutes?: number | null | undefined;
  maxNoticeDays?: number | null | undefined;
  maxPerSlot?: number | null | undefined;
  maxPerDay?: number | null | undefined;
  maxPerWeek?: number | null | undefined;
}

export class AvailabilityManagementRepository {
  // ============================================================================
  // CALENDAR ACCESS
  // ============================================================================

  async verifyCalendarAccess(
    tx: OrgScopedTx,
    calendarId: string,
  ): Promise<boolean> {
    const [calendar] = await tx
      .select({ id: calendars.id })
      .from(calendars)
      .where(eq(calendars.id, calendarId))
      .limit(1);
    return !!calendar;
  }

  // ============================================================================
  // AVAILABILITY RULES
  // ============================================================================

  async findRuleById(
    tx: OrgScopedTx,
    id: string,
  ): Promise<AvailabilityRule | null> {
    const [result] = await tx
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.id, id))
      .limit(1);
    return result ?? null;
  }

  async findRulesByCalendar(
    tx: OrgScopedTx,
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<AvailabilityRule>> {
    const { cursor, limit } = input;

    const results = await tx
      .select()
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.calendarId, calendarId),
          cursor ? gt(availabilityRules.id, cursor) : undefined,
        ),
      )
      .limit(limit + 1)
      .orderBy(availabilityRules.id);

    return paginate(results, limit);
  }

  async findRulesByCalendarIds(
    tx: OrgScopedTx,
    calendarIds: string[],
  ): Promise<AvailabilityRule[]> {
    if (calendarIds.length === 0) return [];
    return tx
      .select()
      .from(availabilityRules)
      .where(inArray(availabilityRules.calendarId, calendarIds))
      .orderBy(availabilityRules.weekday, availabilityRules.startTime);
  }

  async findRulesByWeekday(
    tx: OrgScopedTx,
    calendarId: string,
    weekday: number,
  ): Promise<AvailabilityRule[]> {
    return tx
      .select()
      .from(availabilityRules)
      .where(
        and(
          eq(availabilityRules.calendarId, calendarId),
          eq(availabilityRules.weekday, weekday),
        ),
      );
  }

  async createRule(
    tx: OrgScopedTx,
    calendarId: string,
    input: RuleCreateInput,
  ): Promise<AvailabilityRule> {
    const [result] = await tx
      .insert(availabilityRules)
      .values({
        calendarId,
        weekday: input.weekday,
        startTime: input.startTime,
        endTime: input.endTime,
        groupId: input.groupId ?? null,
      })
      .returning();
    return result!;
  }

  async updateRule(
    tx: OrgScopedTx,
    id: string,
    input: RuleUpdateInput,
  ): Promise<AvailabilityRule | null> {
    const [result] = await tx
      .update(availabilityRules)
      .set(input)
      .where(eq(availabilityRules.id, id))
      .returning();
    return result ?? null;
  }

  async deleteRule(tx: OrgScopedTx, id: string): Promise<boolean> {
    const result = await tx
      .delete(availabilityRules)
      .where(eq(availabilityRules.id, id))
      .returning({ id: availabilityRules.id });
    return result.length > 0;
  }

  async deleteRulesByCalendar(
    tx: OrgScopedTx,
    calendarId: string,
  ): Promise<void> {
    await tx
      .delete(availabilityRules)
      .where(eq(availabilityRules.calendarId, calendarId));
  }

  async createRulesBatch(
    tx: OrgScopedTx,
    calendarId: string,
    rules: RuleCreateInput[],
  ): Promise<AvailabilityRule[]> {
    if (rules.length === 0) return [];
    return tx
      .insert(availabilityRules)
      .values(
        rules.map((rule) => ({
          calendarId,
          weekday: rule.weekday,
          startTime: rule.startTime,
          endTime: rule.endTime,
          groupId: rule.groupId ?? null,
        })),
      )
      .returning();
  }

  // ============================================================================
  // AVAILABILITY OVERRIDES
  // ============================================================================

  async findOverrideById(
    tx: OrgScopedTx,
    id: string,
  ): Promise<AvailabilityOverride | null> {
    const [result] = await tx
      .select()
      .from(availabilityOverrides)
      .where(eq(availabilityOverrides.id, id))
      .limit(1);
    return result ?? null;
  }

  async findOverridesByCalendar(
    tx: OrgScopedTx,
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<AvailabilityOverride>> {
    const { cursor, limit } = input;

    const results = await tx
      .select()
      .from(availabilityOverrides)
      .where(
        and(
          eq(availabilityOverrides.calendarId, calendarId),
          cursor ? gt(availabilityOverrides.id, cursor) : undefined,
        ),
      )
      .limit(limit + 1)
      .orderBy(availabilityOverrides.id);

    return paginate(results, limit);
  }

  async findOverridesByCalendarIdsInRange(
    tx: OrgScopedTx,
    calendarIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<AvailabilityOverride[]> {
    if (calendarIds.length === 0) return [];
    return tx
      .select()
      .from(availabilityOverrides)
      .where(
        and(
          inArray(availabilityOverrides.calendarId, calendarIds),
          gte(availabilityOverrides.date, startDate),
          lte(availabilityOverrides.date, endDate),
        ),
      )
      .orderBy(availabilityOverrides.date);
  }

  async findOverrideByDate(
    tx: OrgScopedTx,
    calendarId: string,
    date: string,
  ): Promise<AvailabilityOverride | null> {
    const [result] = await tx
      .select()
      .from(availabilityOverrides)
      .where(
        and(
          eq(availabilityOverrides.calendarId, calendarId),
          eq(availabilityOverrides.date, date),
        ),
      )
      .limit(1);
    return result ?? null;
  }

  async createOverride(
    tx: OrgScopedTx,
    calendarId: string,
    input: OverrideCreateInput,
  ): Promise<AvailabilityOverride> {
    const [result] = await tx
      .insert(availabilityOverrides)
      .values({
        calendarId,
        date: input.date,
        timeRanges: input.timeRanges,
        groupId: input.groupId ?? null,
      })
      .returning();
    return result!;
  }

  async updateOverride(
    tx: OrgScopedTx,
    id: string,
    input: OverrideUpdateInput,
  ): Promise<AvailabilityOverride | null> {
    const [result] = await tx
      .update(availabilityOverrides)
      .set(input)
      .where(eq(availabilityOverrides.id, id))
      .returning();
    return result ?? null;
  }

  async deleteOverride(tx: OrgScopedTx, id: string): Promise<boolean> {
    const result = await tx
      .delete(availabilityOverrides)
      .where(eq(availabilityOverrides.id, id))
      .returning({ id: availabilityOverrides.id });
    return result.length > 0;
  }

  // ============================================================================
  // BLOCKED TIME
  // ============================================================================

  async findBlockedTimeById(
    tx: OrgScopedTx,
    id: string,
  ): Promise<BlockedTime | null> {
    const [result] = await tx
      .select()
      .from(blockedTime)
      .where(eq(blockedTime.id, id))
      .limit(1);
    return result ?? null;
  }

  async findBlockedTimeByCalendar(
    tx: OrgScopedTx,
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<BlockedTime>> {
    const { cursor, limit } = input;

    const results = await tx
      .select()
      .from(blockedTime)
      .where(
        and(
          eq(blockedTime.calendarId, calendarId),
          cursor ? gt(blockedTime.id, cursor) : undefined,
        ),
      )
      .limit(limit + 1)
      .orderBy(blockedTime.id);

    return paginate(results, limit);
  }

  async findBlockedTimeByCalendarIdsInRange(
    tx: OrgScopedTx,
    calendarIds: string[],
    startAt: Date,
    endAt: Date,
  ): Promise<BlockedTime[]> {
    if (calendarIds.length === 0) return [];
    return tx
      .select()
      .from(blockedTime)
      .where(
        and(
          inArray(blockedTime.calendarId, calendarIds),
          sql`tstzrange(${blockedTime.startAt}, ${blockedTime.endAt}, '[)') && tstzrange(${startAt}, ${endAt}, '[)')`,
        ),
      );
  }

  async createBlockedTime(
    tx: OrgScopedTx,
    calendarId: string,
    input: BlockedTimeCreateInput,
  ): Promise<BlockedTime> {
    const [result] = await tx
      .insert(blockedTime)
      .values({
        calendarId,
        startAt: input.startAt,
        endAt: input.endAt,
        recurringRule: input.recurringRule ?? null,
      })
      .returning();
    return result!;
  }

  async updateBlockedTime(
    tx: OrgScopedTx,
    id: string,
    input: BlockedTimeUpdateInput,
  ): Promise<BlockedTime | null> {
    const [result] = await tx
      .update(blockedTime)
      .set(input)
      .where(eq(blockedTime.id, id))
      .returning();
    return result ?? null;
  }

  async deleteBlockedTime(tx: OrgScopedTx, id: string): Promise<boolean> {
    const result = await tx
      .delete(blockedTime)
      .where(eq(blockedTime.id, id))
      .returning({ id: blockedTime.id });
    return result.length > 0;
  }

  // ============================================================================
  // SCHEDULING LIMITS
  // ============================================================================

  async findOrgDefaultLimits(
    tx: OrgScopedTx,
  ): Promise<SchedulingLimits | null> {
    const [result] = await tx
      .select()
      .from(schedulingLimits)
      .where(isNull(schedulingLimits.calendarId))
      .limit(1);
    return result ?? null;
  }

  async findLimitsByCalendarId(
    tx: OrgScopedTx,
    calendarId: string,
  ): Promise<SchedulingLimits | null> {
    const [result] = await tx
      .select()
      .from(schedulingLimits)
      .where(eq(schedulingLimits.calendarId, calendarId))
      .limit(1);
    return result ?? null;
  }

  private buildLimitsUpsertSet(
    input: LimitsUpdateInput,
    noOp: Record<string, unknown>,
  ): Record<string, unknown> {
    const set: Record<string, unknown> = {};
    if (input.groupId !== undefined) set["groupId"] = input.groupId;
    if (input.minNoticeMinutes !== undefined) {
      set["minNoticeMinutes"] = input.minNoticeMinutes;
    }
    if (input.maxNoticeDays !== undefined) {
      set["maxNoticeDays"] = input.maxNoticeDays;
    }
    if (input.maxPerSlot !== undefined) {
      set["maxPerSlot"] = input.maxPerSlot;
    }
    if (input.maxPerDay !== undefined) {
      set["maxPerDay"] = input.maxPerDay;
    }
    if (input.maxPerWeek !== undefined) {
      set["maxPerWeek"] = input.maxPerWeek;
    }

    return Object.keys(set).length > 0 ? set : noOp;
  }

  async upsertOrgDefaultLimits(
    tx: OrgScopedTx,
    input: LimitsUpdateInput,
  ): Promise<SchedulingLimits> {
    const [result] = await tx
      .insert(schedulingLimits)
      .values({
        calendarId: null,
        groupId: input.groupId ?? null,
        minNoticeMinutes: input.minNoticeMinutes ?? null,
        maxNoticeDays: input.maxNoticeDays ?? null,
        maxPerSlot: input.maxPerSlot ?? null,
        maxPerDay: input.maxPerDay ?? null,
        maxPerWeek: input.maxPerWeek ?? null,
      })
      .onConflictDoUpdate({
        target: [schedulingLimits.orgId],
        targetWhere: isNull(schedulingLimits.calendarId),
        set: this.buildLimitsUpsertSet(input, {
          orgId: sql`${schedulingLimits.orgId}`,
        }),
      })
      .returning();

    return result!;
  }

  async upsertCalendarLimits(
    tx: OrgScopedTx,
    calendarId: string,
    input: LimitsUpdateInput,
  ): Promise<SchedulingLimits> {
    const [result] = await tx
      .insert(schedulingLimits)
      .values({
        calendarId,
        groupId: input.groupId ?? null,
        minNoticeMinutes: input.minNoticeMinutes ?? null,
        maxNoticeDays: input.maxNoticeDays ?? null,
        maxPerSlot: input.maxPerSlot ?? null,
        maxPerDay: input.maxPerDay ?? null,
        maxPerWeek: input.maxPerWeek ?? null,
      })
      .onConflictDoUpdate({
        target: [schedulingLimits.orgId, schedulingLimits.calendarId],
        targetWhere: sql`${schedulingLimits.calendarId} is not null`,
        set: this.buildLimitsUpsertSet(input, {
          calendarId: sql`${schedulingLimits.calendarId}`,
        }),
      })
      .returning();

    return result!;
  }
}

// Singleton instance
export const availabilityManagementRepository =
  new AvailabilityManagementRepository();
