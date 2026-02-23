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
import type { DbClient } from "../lib/db.js";
import { paginate, setOrgContext } from "./base.js";

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
    tx: DbClient,
    orgId: string,
    calendarId: string,
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<AvailabilityRule | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.id, id))
      .limit(1);
    return result ?? null;
  }

  async findRulesByCalendar(
    tx: DbClient,
    orgId: string,
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<AvailabilityRule>> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    calendarIds: string[],
  ): Promise<AvailabilityRule[]> {
    if (calendarIds.length === 0) return [];
    await setOrgContext(tx, orgId);
    return tx
      .select()
      .from(availabilityRules)
      .where(inArray(availabilityRules.calendarId, calendarIds))
      .orderBy(availabilityRules.weekday, availabilityRules.startTime);
  }

  async findRulesByWeekday(
    tx: DbClient,
    orgId: string,
    calendarId: string,
    weekday: number,
  ): Promise<AvailabilityRule[]> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    calendarId: string,
    input: RuleCreateInput,
  ): Promise<AvailabilityRule> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    id: string,
    input: RuleUpdateInput,
  ): Promise<AvailabilityRule | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .update(availabilityRules)
      .set(input)
      .where(eq(availabilityRules.id, id))
      .returning();
    return result ?? null;
  }

  async deleteRule(tx: DbClient, orgId: string, id: string): Promise<boolean> {
    await setOrgContext(tx, orgId);
    const result = await tx
      .delete(availabilityRules)
      .where(eq(availabilityRules.id, id))
      .returning({ id: availabilityRules.id });
    return result.length > 0;
  }

  async deleteRulesByCalendar(
    tx: DbClient,
    orgId: string,
    calendarId: string,
  ): Promise<void> {
    await setOrgContext(tx, orgId);
    await tx
      .delete(availabilityRules)
      .where(eq(availabilityRules.calendarId, calendarId));
  }

  async createRulesBatch(
    tx: DbClient,
    orgId: string,
    calendarId: string,
    rules: RuleCreateInput[],
  ): Promise<AvailabilityRule[]> {
    if (rules.length === 0) return [];
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<AvailabilityOverride | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .select()
      .from(availabilityOverrides)
      .where(eq(availabilityOverrides.id, id))
      .limit(1);
    return result ?? null;
  }

  async findOverridesByCalendar(
    tx: DbClient,
    orgId: string,
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<AvailabilityOverride>> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    calendarIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<AvailabilityOverride[]> {
    if (calendarIds.length === 0) return [];
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    calendarId: string,
    date: string,
  ): Promise<AvailabilityOverride | null> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    calendarId: string,
    input: OverrideCreateInput,
  ): Promise<AvailabilityOverride> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    id: string,
    input: OverrideUpdateInput,
  ): Promise<AvailabilityOverride | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .update(availabilityOverrides)
      .set(input)
      .where(eq(availabilityOverrides.id, id))
      .returning();
    return result ?? null;
  }

  async deleteOverride(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<BlockedTime | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .select()
      .from(blockedTime)
      .where(eq(blockedTime.id, id))
      .limit(1);
    return result ?? null;
  }

  async findBlockedTimeByCalendar(
    tx: DbClient,
    orgId: string,
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<BlockedTime>> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    calendarIds: string[],
    startAt: Date,
    endAt: Date,
  ): Promise<BlockedTime[]> {
    if (calendarIds.length === 0) return [];
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    calendarId: string,
    input: BlockedTimeCreateInput,
  ): Promise<BlockedTime> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    id: string,
    input: BlockedTimeUpdateInput,
  ): Promise<BlockedTime | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .update(blockedTime)
      .set(input)
      .where(eq(blockedTime.id, id))
      .returning();
    return result ?? null;
  }

  async deleteBlockedTime(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
  ): Promise<SchedulingLimits | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .select()
      .from(schedulingLimits)
      .where(isNull(schedulingLimits.calendarId))
      .limit(1);
    return result ?? null;
  }

  async findLimitsByCalendarId(
    tx: DbClient,
    orgId: string,
    calendarId: string,
  ): Promise<SchedulingLimits | null> {
    await setOrgContext(tx, orgId);
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
    tx: DbClient,
    orgId: string,
    input: LimitsUpdateInput,
  ): Promise<SchedulingLimits> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .insert(schedulingLimits)
      .values({
        orgId,
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
    tx: DbClient,
    orgId: string,
    calendarId: string,
    input: LimitsUpdateInput,
  ): Promise<SchedulingLimits> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .insert(schedulingLimits)
      .values({
        orgId,
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
