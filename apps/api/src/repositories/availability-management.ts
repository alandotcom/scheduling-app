// Availability management repository - CRUD for rules, overrides, blocked time, limits

import { eq, and, gt } from "drizzle-orm";
import {
  availabilityRules,
  availabilityOverrides,
  blockedTime,
  schedulingLimits,
  calendars,
} from "@scheduling/db/schema";
import type { PaginationInput, PaginatedResult } from "./base.js";
import type { DbClient } from "../lib/db.js";
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
  intervalMin?: number | null | undefined;
  groupId?: string | null | undefined;
}

export interface RuleUpdateInput {
  weekday?: number | undefined;
  startTime?: string | undefined;
  endTime?: string | undefined;
  intervalMin?: number | null | undefined;
  groupId?: string | null | undefined;
}

// Input types for overrides
export interface OverrideCreateInput {
  date: string;
  startTime?: string | null | undefined;
  endTime?: string | null | undefined;
  isBlocked?: boolean | undefined;
  intervalMin?: number | null | undefined;
  groupId?: string | null | undefined;
}

export interface OverrideUpdateInput {
  date?: string | undefined;
  startTime?: string | null | undefined;
  endTime?: string | null | undefined;
  isBlocked?: boolean | undefined;
  intervalMin?: number | null | undefined;
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

// Input types for scheduling limits
export interface LimitsCreateInput {
  calendarId?: string | null | undefined;
  groupId?: string | null | undefined;
  minNoticeHours?: number | null | undefined;
  maxNoticeDays?: number | null | undefined;
  maxPerSlot?: number | null | undefined;
  maxPerDay?: number | null | undefined;
  maxPerWeek?: number | null | undefined;
}

export interface LimitsUpdateInput {
  minNoticeHours?: number | null | undefined;
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
    calendarId: string,
  ): Promise<boolean> {
    // RLS already set by withRls() in service layer
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
    id: string,
  ): Promise<AvailabilityRule | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.id, id))
      .limit(1);
    return result ?? null;
  }

  async findRulesByCalendar(
    tx: DbClient,
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<AvailabilityRule>> {
    // RLS already set by withRls() in service layer
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
      .orderBy(availabilityRules.weekday, availabilityRules.startTime);

    return paginate(results, limit);
  }

  async findRulesByWeekday(
    tx: DbClient,
    calendarId: string,
    weekday: number,
  ): Promise<AvailabilityRule[]> {
    // RLS already set by withRls() in service layer
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
    calendarId: string,
    input: RuleCreateInput,
  ): Promise<AvailabilityRule> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .insert(availabilityRules)
      .values({
        calendarId,
        weekday: input.weekday,
        startTime: input.startTime,
        endTime: input.endTime,
        intervalMin: input.intervalMin ?? null,
        groupId: input.groupId ?? null,
      })
      .returning();
    return result!;
  }

  async updateRule(
    tx: DbClient,
    id: string,
    input: RuleUpdateInput,
  ): Promise<AvailabilityRule | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .update(availabilityRules)
      .set(input)
      .where(eq(availabilityRules.id, id))
      .returning();
    return result ?? null;
  }

  async deleteRule(tx: DbClient, id: string): Promise<boolean> {
    // RLS already set by withRls() in service layer
    const result = await tx
      .delete(availabilityRules)
      .where(eq(availabilityRules.id, id))
      .returning({ id: availabilityRules.id });
    return result.length > 0;
  }

  async deleteRulesByCalendar(tx: DbClient, calendarId: string): Promise<void> {
    // RLS already set by withRls() in service layer
    await tx
      .delete(availabilityRules)
      .where(eq(availabilityRules.calendarId, calendarId));
  }

  async createRulesBatch(
    tx: DbClient,
    calendarId: string,
    rules: RuleCreateInput[],
  ): Promise<AvailabilityRule[]> {
    if (rules.length === 0) return [];
    // RLS already set by withRls() in service layer
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
  }

  // ============================================================================
  // AVAILABILITY OVERRIDES
  // ============================================================================

  async findOverrideById(
    tx: DbClient,
    id: string,
  ): Promise<AvailabilityOverride | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .select()
      .from(availabilityOverrides)
      .where(eq(availabilityOverrides.id, id))
      .limit(1);
    return result ?? null;
  }

  async findOverridesByCalendar(
    tx: DbClient,
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<AvailabilityOverride>> {
    // RLS already set by withRls() in service layer
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
      .orderBy(availabilityOverrides.date);

    return paginate(results, limit);
  }

  async findOverrideByDate(
    tx: DbClient,
    calendarId: string,
    date: string,
  ): Promise<AvailabilityOverride | null> {
    // RLS already set by withRls() in service layer
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
    calendarId: string,
    input: OverrideCreateInput,
  ): Promise<AvailabilityOverride> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .insert(availabilityOverrides)
      .values({
        calendarId,
        date: input.date,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        isBlocked: input.isBlocked ?? false,
        intervalMin: input.intervalMin ?? null,
        groupId: input.groupId ?? null,
      })
      .returning();
    return result!;
  }

  async updateOverride(
    tx: DbClient,
    id: string,
    input: OverrideUpdateInput,
  ): Promise<AvailabilityOverride | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .update(availabilityOverrides)
      .set(input)
      .where(eq(availabilityOverrides.id, id))
      .returning();
    return result ?? null;
  }

  async deleteOverride(tx: DbClient, id: string): Promise<boolean> {
    // RLS already set by withRls() in service layer
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
    id: string,
  ): Promise<BlockedTime | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .select()
      .from(blockedTime)
      .where(eq(blockedTime.id, id))
      .limit(1);
    return result ?? null;
  }

  async findBlockedTimeByCalendar(
    tx: DbClient,
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<BlockedTime>> {
    // RLS already set by withRls() in service layer
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
      .orderBy(blockedTime.startAt);

    return paginate(results, limit);
  }

  async createBlockedTime(
    tx: DbClient,
    calendarId: string,
    input: BlockedTimeCreateInput,
  ): Promise<BlockedTime> {
    // RLS already set by withRls() in service layer
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
    id: string,
    input: BlockedTimeUpdateInput,
  ): Promise<BlockedTime | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .update(blockedTime)
      .set(input)
      .where(eq(blockedTime.id, id))
      .returning();
    return result ?? null;
  }

  async deleteBlockedTime(tx: DbClient, id: string): Promise<boolean> {
    // RLS already set by withRls() in service layer
    const result = await tx
      .delete(blockedTime)
      .where(eq(blockedTime.id, id))
      .returning({ id: blockedTime.id });
    return result.length > 0;
  }

  // ============================================================================
  // SCHEDULING LIMITS
  // ============================================================================

  async findLimitsById(
    tx: DbClient,
    id: string,
  ): Promise<SchedulingLimits | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .select()
      .from(schedulingLimits)
      .where(eq(schedulingLimits.id, id))
      .limit(1);
    return result ?? null;
  }

  async findLimitsByCalendar(
    tx: DbClient,
    calendarId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<SchedulingLimits>> {
    // RLS already set by withRls() in service layer
    const { cursor, limit } = input;

    const results = await tx
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

    return paginate(results, limit);
  }

  async createLimits(
    tx: DbClient,
    input: LimitsCreateInput,
  ): Promise<SchedulingLimits> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .insert(schedulingLimits)
      .values({
        calendarId: input.calendarId ?? null,
        groupId: input.groupId ?? null,
        minNoticeHours: input.minNoticeHours ?? null,
        maxNoticeDays: input.maxNoticeDays ?? null,
        maxPerSlot: input.maxPerSlot ?? null,
        maxPerDay: input.maxPerDay ?? null,
        maxPerWeek: input.maxPerWeek ?? null,
      })
      .returning();
    return result!;
  }

  async updateLimits(
    tx: DbClient,
    id: string,
    input: LimitsUpdateInput,
  ): Promise<SchedulingLimits | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .update(schedulingLimits)
      .set(input)
      .where(eq(schedulingLimits.id, id))
      .returning();
    return result ?? null;
  }

  async deleteLimits(tx: DbClient, id: string): Promise<boolean> {
    // RLS already set by withRls() in service layer
    const result = await tx
      .delete(schedulingLimits)
      .where(eq(schedulingLimits.id, id))
      .returning({ id: schedulingLimits.id });
    return result.length > 0;
  }
}

// Singleton instance
export const availabilityManagementRepository =
  new AvailabilityManagementRepository();
