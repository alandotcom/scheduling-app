// AvailabilityEngine - generates available dates and time slots with full rule enforcement

import { DateTime } from 'luxon'
import { RRule } from 'rrule'
import { eq, and, gte, lte, ne, inArray, or } from 'drizzle-orm'
import {
  appointmentTypes,
  appointmentTypeCalendars,
  appointmentTypeResources,
  availabilityRules,
  availabilityOverrides,
  blockedTime,
  schedulingLimits,
  appointments,
  resources,
} from '@scheduling/db/schema'
import type { Database } from '../../lib/db.js'
import type {
  AvailabilityQuery,
  TimeSlot,
  AvailabilityRule,
  AvailabilityOverride,
  BlockedTimeEntry,
  MergedSchedulingLimits,
  AppointmentTypeData,
  ExistingAppointment,
  ResourceConstraint,
  ResourceData,
} from './types.js'

export class AvailabilityEngine {
  constructor(private db: Database) {}

  /**
   * Get available dates in the range
   */
  async getAvailableDates(query: AvailabilityQuery): Promise<string[]> {
    const dates: string[] = []
    const { startDate, endDate, timezone } = query

    let current = DateTime.fromISO(startDate, { zone: timezone })
    const end = DateTime.fromISO(endDate, { zone: timezone })

    while (current <= end) {
      const dateStr = current.toISODate()!
      const slots = await this.getAvailableSlots({
        ...query,
        startDate: dateStr,
        endDate: dateStr,
      })

      if (slots.some((s) => s.available)) {
        dates.push(dateStr)
      }

      current = current.plus({ days: 1 })
    }

    return dates
  }

  /**
   * Get available time slots in the range
   */
  async getAvailableSlots(query: AvailabilityQuery): Promise<TimeSlot[]> {
    const { appointmentTypeId, calendarIds, startDate, endDate, timezone } = query

    // 1. Load appointment type details
    const appointmentType = await this.loadAppointmentType(appointmentTypeId)
    if (!appointmentType) {
      throw new Error(`Appointment type ${appointmentTypeId} not found`)
    }

    const durationMin = appointmentType.durationMin
    const paddingBeforeMin = appointmentType.paddingBeforeMin ?? 0
    const paddingAfterMin = appointmentType.paddingAfterMin ?? 0
    const capacity = appointmentType.capacity ?? 1

    // 2. Validate calendars are linked to this appointment type
    const validCalendarIds = await this.getValidCalendars(appointmentTypeId, calendarIds)
    if (validCalendarIds.length === 0) {
      return [] // No valid calendars for this appointment type
    }

    // 3. Load scheduling limits
    const limits = await this.loadSchedulingLimits(validCalendarIds)

    // 4. Load availability rules for all calendars
    const rules = await this.loadAvailabilityRules(validCalendarIds)

    // 5. Load overrides and blocked time
    const overrides = await this.loadOverrides(validCalendarIds, startDate, endDate)
    const blockedTimes = await this.loadBlockedTimes(validCalendarIds, startDate, endDate, timezone)

    // 6. Load existing appointments
    const existingAppointments = await this.loadExistingAppointments(
      validCalendarIds,
      startDate,
      endDate,
      timezone
    )

    // 7. Load resource constraints
    const resourceConstraints = await this.loadResourceConstraints(appointmentTypeId)
    const resourcesData = await this.loadResourcesData(resourceConstraints.map((r) => r.resourceId))

    // 8. Generate candidate slots
    const candidateSlots = this.generateCandidateSlots(
      startDate,
      endDate,
      timezone,
      rules,
      overrides,
      durationMin
    )

    // 9. Apply filters
    const now = DateTime.now()
    const slots: TimeSlot[] = []

    for (const slot of candidateSlots) {
      let available = true
      let remainingCapacity = capacity

      const slotStart = DateTime.fromJSDate(slot.start)
      const slotEnd = DateTime.fromJSDate(slot.end)

      // 9a. Check min notice
      if (available && limits.minNoticeHours != null) {
        const minNotice = now.plus({ hours: limits.minNoticeHours })
        if (slotStart < minNotice) {
          available = false
        }
      }

      // 9b. Check max notice
      if (available && limits.maxNoticeDays != null) {
        const maxNotice = now.plus({ days: limits.maxNoticeDays })
        if (slotStart > maxNotice) {
          available = false
        }
      }

      // 9c. Cannot book in the past
      if (available && slotStart < now) {
        available = false
      }

      // 9d. Check blocked times (including recurring)
      if (available) {
        for (const blocked of blockedTimes) {
          if (this.isBlockedAt(slot.start, slot.end, blocked)) {
            available = false
            break
          }
        }
      }

      // 9e. Check existing appointments (with padding)
      if (available) {
        const slotWithPadding = {
          start: slotStart.minus({ minutes: paddingBeforeMin }).toJSDate(),
          end: slotEnd.plus({ minutes: paddingAfterMin }).toJSDate(),
        }

        let overlappingCount = 0
        for (const appt of existingAppointments) {
          if (this.intervalsOverlap(slotWithPadding, { start: appt.startAt, end: appt.endAt })) {
            overlappingCount++
          }
        }

        remainingCapacity = capacity - overlappingCount
        if (remainingCapacity <= 0) {
          available = false
        }
      }

      // 9f. Check resource capacity
      if (available && resourceConstraints.length > 0) {
        const resourceAvailable = await this.checkResourceCapacity(
          slot.start,
          slot.end,
          resourceConstraints,
          resourcesData,
          existingAppointments,
          appointmentTypeId
        )
        if (!resourceAvailable) {
          available = false
        }
      }

      // 9g. Check daily limits
      if (available && limits.maxPerDay != null) {
        const dailyCount = existingAppointments.filter((a) =>
          DateTime.fromJSDate(a.startAt).hasSame(slotStart, 'day')
        ).length
        if (dailyCount >= limits.maxPerDay) {
          available = false
        }
      }

      // 9h. Check weekly limits
      if (available && limits.maxPerWeek != null) {
        const weekStart = slotStart.startOf('week')
        const weekEnd = slotStart.endOf('week')
        const weeklyCount = existingAppointments.filter((a) => {
          const apptStart = DateTime.fromJSDate(a.startAt)
          return apptStart >= weekStart && apptStart <= weekEnd
        }).length
        if (weeklyCount >= limits.maxPerWeek) {
          available = false
        }
      }

      // 9i. Check per-slot limits (maxPerSlot)
      if (available && limits.maxPerSlot != null) {
        if (capacity - remainingCapacity >= limits.maxPerSlot) {
          available = false
        }
      }

      slots.push({
        start: slot.start,
        end: slot.end,
        available,
        remainingCapacity: Math.max(0, remainingCapacity),
      })
    }

    return slots
  }

  /**
   * Check if a specific slot is available
   */
  async checkSlot(
    appointmentTypeId: string,
    calendarId: string,
    startTime: Date,
    timezone: string
  ): Promise<{ available: boolean; reason?: string }> {
    const appointmentType = await this.loadAppointmentType(appointmentTypeId)
    if (!appointmentType) {
      return { available: false, reason: 'APPOINTMENT_TYPE_NOT_FOUND' }
    }

    const endTime = DateTime.fromJSDate(startTime).plus({ minutes: appointmentType.durationMin }).toJSDate()
    const startDate = DateTime.fromJSDate(startTime, { zone: timezone }).toISODate()!

    const slots = await this.getAvailableSlots({
      appointmentTypeId,
      calendarIds: [calendarId],
      startDate,
      endDate: startDate,
      timezone,
    })

    const matchingSlot = slots.find(
      (s) => s.start.getTime() === startTime.getTime() && s.end.getTime() === endTime.getTime()
    )

    if (!matchingSlot) {
      return { available: false, reason: 'INVALID_SLOT_TIME' }
    }

    if (!matchingSlot.available) {
      return { available: false, reason: 'SLOT_UNAVAILABLE' }
    }

    return { available: true }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private async loadAppointmentType(id: string): Promise<AppointmentTypeData | null> {
    const result = await this.db.select().from(appointmentTypes).where(eq(appointmentTypes.id, id)).limit(1)

    if (result.length === 0) return null

    const at = result[0]!
    return {
      id: at.id,
      name: at.name,
      durationMin: at.durationMin,
      paddingBeforeMin: at.paddingBeforeMin,
      paddingAfterMin: at.paddingAfterMin,
      capacity: at.capacity,
    }
  }

  private async getValidCalendars(appointmentTypeId: string, requestedCalendarIds: string[]): Promise<string[]> {
    // Get calendars linked to this appointment type
    const links = await this.db
      .select({ calendarId: appointmentTypeCalendars.calendarId })
      .from(appointmentTypeCalendars)
      .where(eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId))

    const linkedCalendarIds = new Set(links.map((l) => l.calendarId))

    // Filter requested calendars to only those linked to this appointment type
    return requestedCalendarIds.filter((id) => linkedCalendarIds.has(id))
  }

  private async loadSchedulingLimits(calendarIds: string[]): Promise<MergedSchedulingLimits> {
    // Load all limits for these calendars
    const results = await this.db
      .select()
      .from(schedulingLimits)
      .where(or(inArray(schedulingLimits.calendarId, calendarIds), eq(schedulingLimits.calendarId, undefined as any)))

    // Merge limits - use the most restrictive
    const merged: MergedSchedulingLimits = {
      minNoticeHours: null,
      maxNoticeDays: null,
      maxPerSlot: null,
      maxPerDay: null,
      maxPerWeek: null,
    }

    for (const limit of results) {
      if (limit.minNoticeHours != null) {
        merged.minNoticeHours =
          merged.minNoticeHours == null ? limit.minNoticeHours : Math.max(merged.minNoticeHours, limit.minNoticeHours)
      }
      if (limit.maxNoticeDays != null) {
        merged.maxNoticeDays =
          merged.maxNoticeDays == null ? limit.maxNoticeDays : Math.min(merged.maxNoticeDays, limit.maxNoticeDays)
      }
      if (limit.maxPerSlot != null) {
        merged.maxPerSlot =
          merged.maxPerSlot == null ? limit.maxPerSlot : Math.min(merged.maxPerSlot, limit.maxPerSlot)
      }
      if (limit.maxPerDay != null) {
        merged.maxPerDay = merged.maxPerDay == null ? limit.maxPerDay : Math.min(merged.maxPerDay, limit.maxPerDay)
      }
      if (limit.maxPerWeek != null) {
        merged.maxPerWeek =
          merged.maxPerWeek == null ? limit.maxPerWeek : Math.min(merged.maxPerWeek, limit.maxPerWeek)
      }
    }

    return merged
  }

  private async loadAvailabilityRules(calendarIds: string[]): Promise<AvailabilityRule[]> {
    const results = await this.db
      .select()
      .from(availabilityRules)
      .where(inArray(availabilityRules.calendarId, calendarIds))

    return results.map((r) => ({
      id: r.id,
      calendarId: r.calendarId,
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      intervalMin: r.intervalMin,
      groupId: r.groupId,
    }))
  }

  private async loadOverrides(
    calendarIds: string[],
    startDate: string,
    endDate: string
  ): Promise<AvailabilityOverride[]> {
    const results = await this.db
      .select()
      .from(availabilityOverrides)
      .where(
        and(
          inArray(availabilityOverrides.calendarId, calendarIds),
          gte(availabilityOverrides.date, startDate),
          lte(availabilityOverrides.date, endDate)
        )
      )

    return results.map((o) => ({
      id: o.id,
      calendarId: o.calendarId,
      date: o.date,
      startTime: o.startTime,
      endTime: o.endTime,
      isBlocked: o.isBlocked,
      intervalMin: o.intervalMin,
      groupId: o.groupId,
    }))
  }

  private async loadBlockedTimes(
    calendarIds: string[],
    startDate: string,
    endDate: string,
    timezone: string
  ): Promise<BlockedTimeEntry[]> {
    // Convert dates to UTC for database query
    const startDateTime = DateTime.fromISO(startDate, { zone: timezone }).startOf('day').toUTC()
    const endDateTime = DateTime.fromISO(endDate, { zone: timezone }).endOf('day').toUTC()

    const results = await this.db
      .select()
      .from(blockedTime)
      .where(
        and(
          inArray(blockedTime.calendarId, calendarIds),
          // Include blocked times that overlap with the range or have recurring rules
          or(
            and(gte(blockedTime.startAt, startDateTime.toJSDate()), lte(blockedTime.startAt, endDateTime.toJSDate())),
            and(gte(blockedTime.endAt, startDateTime.toJSDate()), lte(blockedTime.endAt, endDateTime.toJSDate())),
            // Include entries with recurring rules that might affect the range
            ne(blockedTime.recurringRule, null as any)
          )
        )
      )

    return results.map((b) => ({
      id: b.id,
      calendarId: b.calendarId,
      startAt: b.startAt,
      endAt: b.endAt,
      recurringRule: b.recurringRule,
    }))
  }

  private async loadExistingAppointments(
    calendarIds: string[],
    startDate: string,
    endDate: string,
    timezone: string
  ): Promise<ExistingAppointment[]> {
    // Convert dates to UTC for database query
    const startDateTime = DateTime.fromISO(startDate, { zone: timezone }).startOf('day').toUTC()
    const endDateTime = DateTime.fromISO(endDate, { zone: timezone }).endOf('day').toUTC()

    const results = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          inArray(appointments.calendarId, calendarIds),
          ne(appointments.status, 'cancelled'),
          gte(appointments.startAt, startDateTime.toJSDate()),
          lte(appointments.startAt, endDateTime.toJSDate())
        )
      )

    return results.map((a) => ({
      id: a.id,
      calendarId: a.calendarId,
      appointmentTypeId: a.appointmentTypeId,
      startAt: a.startAt,
      endAt: a.endAt,
      status: a.status,
    }))
  }

  private async loadResourceConstraints(appointmentTypeId: string): Promise<ResourceConstraint[]> {
    const results = await this.db
      .select()
      .from(appointmentTypeResources)
      .where(eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId))

    return results.map((r) => ({
      resourceId: r.resourceId,
      quantityRequired: r.quantityRequired,
    }))
  }

  private async loadResourcesData(resourceIds: string[]): Promise<ResourceData[]> {
    if (resourceIds.length === 0) return []

    const results = await this.db.select().from(resources).where(inArray(resources.id, resourceIds))

    return results.map((r) => ({
      id: r.id,
      name: r.name,
      quantity: r.quantity,
    }))
  }

  private generateCandidateSlots(
    startDate: string,
    endDate: string,
    timezone: string,
    rules: AvailabilityRule[],
    overrides: AvailabilityOverride[],
    durationMin: number
  ): Array<{ start: Date; end: Date }> {
    const slots: Array<{ start: Date; end: Date }> = []

    let current = DateTime.fromISO(startDate, { zone: timezone }).startOf('day')
    const end = DateTime.fromISO(endDate, { zone: timezone }).endOf('day')

    while (current <= end) {
      const dateStr = current.toISODate()!
      // Luxon weekday: 1 = Monday, 7 = Sunday
      // We need 0 = Sunday, 1 = Monday, etc.
      const weekday = current.weekday % 7

      // Check for override on this date
      const override = overrides.find((o) => o.date === dateStr)

      if (override?.isBlocked) {
        // Entire day is blocked
        current = current.plus({ days: 1 })
        continue
      }

      // Get hours for this day (override or regular rule)
      let dayStart: string | undefined
      let dayEnd: string | undefined
      let interval: number

      if (override && override.startTime && override.endTime) {
        dayStart = override.startTime
        dayEnd = override.endTime
        interval = override.intervalMin ?? 15
      } else {
        // Find all rules for this weekday and use the first one
        // In a more complete implementation, we might merge multiple rules
        const rule = rules.find((r) => r.weekday === weekday)
        if (!rule) {
          current = current.plus({ days: 1 })
          continue
        }
        dayStart = rule.startTime
        dayEnd = rule.endTime
        interval = rule.intervalMin ?? 15
      }

      if (dayStart && dayEnd) {
        // Generate slots for this day
        const [startHour, startMin] = dayStart.split(':').map(Number)
        const [endHour, endMin] = dayEnd.split(':').map(Number)

        let slotStart = current.set({ hour: startHour, minute: startMin })
        const dayEndTime = current.set({ hour: endHour, minute: endMin })

        while (slotStart.plus({ minutes: durationMin }) <= dayEndTime) {
          const slotEnd = slotStart.plus({ minutes: durationMin })
          slots.push({
            start: slotStart.toJSDate(),
            end: slotEnd.toJSDate(),
          })
          slotStart = slotStart.plus({ minutes: interval })
        }
      }

      current = current.plus({ days: 1 })
    }

    return slots
  }

  private isBlockedAt(start: Date, end: Date, blocked: BlockedTimeEntry): boolean {
    // Handle recurring blocked time
    if (blocked.recurringRule) {
      try {
        const rrule = RRule.fromString(blocked.recurringRule)
        const occurrences = rrule.between(
          DateTime.fromJSDate(start).minus({ days: 1 }).toJSDate(),
          DateTime.fromJSDate(end).plus({ days: 1 }).toJSDate(),
          true
        )

        const blockDuration = blocked.endAt.getTime() - blocked.startAt.getTime()

        for (const occurrence of occurrences) {
          const blockStart = DateTime.fromJSDate(occurrence)
          const blockEnd = blockStart.plus({ milliseconds: blockDuration })

          if (this.intervalsOverlap({ start, end }, { start: blockStart.toJSDate(), end: blockEnd.toJSDate() })) {
            return true
          }
        }
        return false
      } catch {
        // If RRULE parsing fails, fall back to simple check
        return this.intervalsOverlap({ start, end }, { start: blocked.startAt, end: blocked.endAt })
      }
    }

    // Simple blocked time
    return this.intervalsOverlap({ start, end }, { start: blocked.startAt, end: blocked.endAt })
  }

  private intervalsOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
    return a.start < b.end && b.start < a.end
  }

  private async checkResourceCapacity(
    start: Date,
    end: Date,
    resourceConstraints: ResourceConstraint[],
    resourcesData: ResourceData[],
    existingAppointments: ExistingAppointment[],
    appointmentTypeId: string
  ): Promise<boolean> {
    // For each resource, check if adding this appointment would exceed capacity
    for (const constraint of resourceConstraints) {
      const resource = resourcesData.find((r) => r.id === constraint.resourceId)
      if (!resource) continue

      // Count how much of this resource is already allocated during this time
      // We need to look at appointments that use this resource
      const overlappingAppointments = existingAppointments.filter((a) =>
        this.intervalsOverlap({ start, end }, { start: a.startAt, end: a.endAt })
      )

      // For now, assume each appointment of this type uses the same resource requirements
      // A more complete implementation would track actual resource allocations per appointment
      const usedQuantity = overlappingAppointments.filter((a) => a.appointmentTypeId === appointmentTypeId).length * constraint.quantityRequired

      if (usedQuantity + constraint.quantityRequired > resource.quantity) {
        return false
      }
    }

    return true
  }
}
