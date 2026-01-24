import { sql } from "../db";

// Types
interface TimeRange {
  start: string; // HH:MM format
  end: string;   // HH:MM format
}

interface AvailabilityRule {
  weekday: number;
  start_time: string;
  end_time: string;
  interval_min: number;
}

interface AvailabilityOverride {
  date: string;
  start_time: string | null;
  end_time: string | null;
  is_unavailable: boolean;
  interval_min: number | null;
}

interface BlockedTime {
  start_at: Date;
  end_at: Date;
}

interface SchedulingLimits {
  min_notice_hours: number | null;
  max_notice_days: number | null;
  max_per_slot: number | null;
  max_per_day: number | null;
  max_per_week: number | null;
}

interface AppointmentType {
  id: string;
  duration_min: number;
  padding_before_min: number;
  padding_after_min: number;
  capacity: number;
}

interface Appointment {
  id: string;
  start_at: Date;
  end_at: Date;
  status: string;
}

interface ResourceRequirement {
  resource_id: string;
  quantity_required: number;
  resource_quantity: number; // Total available
}

export interface AvailabilityCheckResult {
  available: boolean;
  reason?: "time_unavailable" | "outside_hours" | "min_notice" | "max_notice" | "capacity_exceeded" | "resource_unavailable" | "blocked";
}

// Convert HH:MM to minutes since midnight
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Convert minutes since midnight to HH:MM
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

// Get the weekday (0=Sunday, 6=Saturday) in a specific timezone
function getWeekdayInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const dayName = formatter.format(date);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return dayMap[dayName];
}

// Format date as YYYY-MM-DD in a specific timezone
function formatDateInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

// Parse a date string (YYYY-MM-DD) and time (HH:MM) in a specific timezone to UTC Date
function parseLocalDateTime(dateStr: string, timeStr: string, timezone: string): Date {
  // Create ISO string and parse it with the timezone
  const localDateTimeStr = `${dateStr}T${timeStr}:00`;
  const date = new Date(localDateTimeStr);

  // Get the offset for this date/time in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Parse the local time as if it were in the given timezone
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "0";

  // We need to construct a date that represents the local time in the timezone
  // Use a different approach: construct the date string with timezone info
  const tzDate = new Date(`${dateStr}T${timeStr}:00`);

  // Get offset by comparing UTC representation
  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const tzFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Create a reference point to calculate offset
  const refDate = new Date(`${dateStr}T12:00:00Z`);
  const tzParts = tzFormatter.formatToParts(refDate);
  const tzHour = parseInt(tzParts.find(p => p.type === "hour")?.value || "0");
  const tzMin = parseInt(tzParts.find(p => p.type === "minute")?.value || "0");

  // UTC is always 12:00 for our reference
  const offsetMinutes = (tzHour - 12) * 60 + tzMin;

  // Parse the target time
  const [targetHour, targetMin] = timeStr.split(":").map(Number);
  const targetMinutes = targetHour * 60 + targetMin;

  // Convert local time to UTC by subtracting offset
  const utcMinutes = targetMinutes - offsetMinutes;

  // Create the final date
  const result = new Date(`${dateStr}T00:00:00Z`);
  result.setUTCMinutes(result.getUTCMinutes() + utcMinutes);

  return result;
}

// Get available dates for a month
export async function getAvailableDates(
  appointmentTypeId: string,
  calendarId: string,
  month: string, // YYYY-MM
  timezone?: string
): Promise<string[]> {
  // Get calendar and appointment type data
  const [calendarResult, appointmentTypeResult] = await Promise.all([
    sql`SELECT id, timezone FROM calendars WHERE id = ${calendarId} AND deleted_at IS NULL`,
    sql`
      SELECT at.id, at.duration_min, at.padding_before_min, at.padding_after_min, at.capacity
      FROM appointment_types at
      JOIN appointment_type_calendars atc ON atc.appointment_type_id = at.id
      WHERE at.id = ${appointmentTypeId}
        AND atc.calendar_id = ${calendarId}
        AND at.deleted_at IS NULL
    `,
  ]);

  if (calendarResult.length === 0 || appointmentTypeResult.length === 0) {
    return [];
  }

  const calendar = calendarResult[0];
  const appointmentType = appointmentTypeResult[0] as AppointmentType;
  const effectiveTimezone = timezone || calendar.timezone;

  // Parse month to get date range
  const [year, monthNum] = month.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 0)); // Last day of month

  // Get availability rules
  const rules = await sql`
    SELECT weekday, start_time::text, end_time::text, interval_min
    FROM availability_rules
    WHERE calendar_id = ${calendarId}
  ` as AvailabilityRule[];

  // Get overrides for the month
  const overrides = await sql`
    SELECT date::text, start_time::text, end_time::text, is_unavailable, interval_min
    FROM availability_overrides
    WHERE calendar_id = ${calendarId}
      AND date >= ${month + "-01"}
      AND date <= ${month + "-31"}
  ` as AvailabilityOverride[];

  // Get blocked time for the month
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);

  const blockedPeriods = await sql`
    SELECT start_at, end_at
    FROM blocked_time
    WHERE calendar_id = ${calendarId}
      AND start_at <= ${monthEnd.toISOString()}
      AND end_at >= ${monthStart.toISOString()}
  ` as BlockedTime[];

  // Get scheduling limits
  const limitsResult = await sql`
    SELECT min_notice_hours, max_notice_days, max_per_slot, max_per_day, max_per_week
    FROM scheduling_limits
    WHERE calendar_id = ${calendarId} OR (calendar_id IS NULL AND org_id = (SELECT org_id FROM calendars WHERE id = ${calendarId}))
    ORDER BY calendar_id NULLS LAST
    LIMIT 1
  `;
  const limits: SchedulingLimits = limitsResult[0] || {
    min_notice_hours: null,
    max_notice_days: null,
    max_per_slot: null,
    max_per_day: null,
    max_per_week: null,
  };

  // Build map of rules by weekday
  const rulesByWeekday = new Map<number, AvailabilityRule[]>();
  for (const rule of rules) {
    const existing = rulesByWeekday.get(rule.weekday) || [];
    existing.push(rule);
    rulesByWeekday.set(rule.weekday, existing);
  }

  // Build map of overrides by date
  const overridesByDate = new Map<string, AvailabilityOverride>();
  for (const override of overrides) {
    overridesByDate.set(override.date, override);
  }

  const now = new Date();
  const availableDates: string[] = [];

  // Iterate through each day of the month
  for (let day = 1; day <= endDate.getUTCDate(); day++) {
    const dateStr = `${month}-${day.toString().padStart(2, "0")}`;
    const dateInTz = parseLocalDateTime(dateStr, "00:00", effectiveTimezone);

    // Check max_notice_days
    if (limits.max_notice_days !== null) {
      const maxDate = new Date(now);
      maxDate.setDate(maxDate.getDate() + limits.max_notice_days);
      if (dateInTz > maxDate) {
        continue;
      }
    }

    // Check min_notice_hours (skip dates that are too soon)
    if (limits.min_notice_hours !== null) {
      const minDate = new Date(now);
      minDate.setHours(minDate.getHours() + limits.min_notice_hours);
      const endOfDay = parseLocalDateTime(dateStr, "23:59", effectiveTimezone);
      if (endOfDay < minDate) {
        continue;
      }
    }

    // Check override for this date
    const override = overridesByDate.get(dateStr);
    if (override) {
      if (override.is_unavailable) {
        continue;
      }
      // If override has times, this date has availability
      if (override.start_time && override.end_time) {
        availableDates.push(dateStr);
        continue;
      }
    }

    // Check weekly rules for this weekday
    const weekday = getWeekdayInTimezone(dateInTz, effectiveTimezone);
    const dayRules = rulesByWeekday.get(weekday);

    if (!dayRules || dayRules.length === 0) {
      continue;
    }

    // Check if entire day is blocked
    const dayStart = parseLocalDateTime(dateStr, "00:00", effectiveTimezone);
    const dayEnd = parseLocalDateTime(dateStr, "23:59", effectiveTimezone);

    const isEntirelyBlocked = blockedPeriods.some(
      (block) => new Date(block.start_at) <= dayStart && new Date(block.end_at) >= dayEnd
    );

    if (isEntirelyBlocked) {
      continue;
    }

    availableDates.push(dateStr);
  }

  return availableDates;
}

// Get available time slots for a specific date
export async function getAvailableTimes(
  appointmentTypeId: string,
  calendarId: string,
  date: string, // YYYY-MM-DD
  timezone?: string
): Promise<string[]> {
  // Get calendar and appointment type data
  const [calendarResult, appointmentTypeResult] = await Promise.all([
    sql`SELECT id, timezone, org_id FROM calendars WHERE id = ${calendarId} AND deleted_at IS NULL`,
    sql`
      SELECT at.id, at.duration_min, at.padding_before_min, at.padding_after_min, at.capacity
      FROM appointment_types at
      JOIN appointment_type_calendars atc ON atc.appointment_type_id = at.id
      WHERE at.id = ${appointmentTypeId}
        AND atc.calendar_id = ${calendarId}
        AND at.deleted_at IS NULL
    `,
  ]);

  if (calendarResult.length === 0 || appointmentTypeResult.length === 0) {
    return [];
  }

  const calendar = calendarResult[0];
  const appointmentType = appointmentTypeResult[0] as AppointmentType;
  const effectiveTimezone = timezone || calendar.timezone;

  // Get the weekday for this date
  const dateObj = parseLocalDateTime(date, "12:00", effectiveTimezone);
  const weekday = getWeekdayInTimezone(dateObj, effectiveTimezone);

  // Get availability rules for this weekday
  const rules = await sql`
    SELECT weekday, start_time::text, end_time::text, interval_min
    FROM availability_rules
    WHERE calendar_id = ${calendarId} AND weekday = ${weekday}
  ` as AvailabilityRule[];

  // Check for override on this date
  const overrides = await sql`
    SELECT date::text, start_time::text, end_time::text, is_unavailable, interval_min
    FROM availability_overrides
    WHERE calendar_id = ${calendarId} AND date = ${date}
  ` as AvailabilityOverride[];

  const override = overrides[0];

  // If marked as unavailable, no times available
  if (override?.is_unavailable) {
    return [];
  }

  // Determine time windows for this date
  let timeWindows: { start: string; end: string; interval: number }[] = [];

  if (override?.start_time && override?.end_time) {
    // Use override times
    timeWindows.push({
      start: override.start_time,
      end: override.end_time,
      interval: override.interval_min || 15,
    });
  } else if (rules.length > 0) {
    // Use weekly rules
    for (const rule of rules) {
      timeWindows.push({
        start: rule.start_time,
        end: rule.end_time,
        interval: rule.interval_min,
      });
    }
  }

  if (timeWindows.length === 0) {
    return [];
  }

  // Get blocked time periods for this date
  const dayStart = parseLocalDateTime(date, "00:00", effectiveTimezone);
  const dayEnd = parseLocalDateTime(date, "23:59", effectiveTimezone);

  const blockedPeriods = await sql`
    SELECT start_at, end_at
    FROM blocked_time
    WHERE calendar_id = ${calendarId}
      AND start_at <= ${dayEnd.toISOString()}
      AND end_at >= ${dayStart.toISOString()}
  ` as BlockedTime[];

  // Get existing appointments for this date (non-cancelled)
  const existingAppointments = await sql`
    SELECT id, start_at, end_at, status
    FROM appointments
    WHERE calendar_id = ${calendarId}
      AND appointment_type_id = ${appointmentTypeId}
      AND start_at >= ${dayStart.toISOString()}
      AND start_at <= ${dayEnd.toISOString()}
      AND status NOT IN ('cancelled')
  ` as Appointment[];

  // Get scheduling limits
  const limitsResult = await sql`
    SELECT min_notice_hours, max_notice_days, max_per_slot, max_per_day, max_per_week
    FROM scheduling_limits
    WHERE calendar_id = ${calendarId} OR (calendar_id IS NULL AND org_id = ${calendar.org_id})
    ORDER BY calendar_id NULLS LAST
    LIMIT 1
  `;
  const limits: SchedulingLimits = limitsResult[0] || {
    min_notice_hours: null,
    max_notice_days: null,
    max_per_slot: null,
    max_per_day: null,
    max_per_week: null,
  };

  // Check max_per_day
  if (limits.max_per_day !== null && existingAppointments.length >= limits.max_per_day) {
    return [];
  }

  // Get resource requirements for this appointment type
  const resourceRequirements = await sql`
    SELECT atr.resource_id, atr.quantity_required, r.quantity as resource_quantity
    FROM appointment_type_resources atr
    JOIN resources r ON r.id = atr.resource_id AND r.deleted_at IS NULL
    WHERE atr.appointment_type_id = ${appointmentTypeId}
  ` as ResourceRequirement[];

  const now = new Date();
  const totalSlotDuration = appointmentType.duration_min + appointmentType.padding_before_min + appointmentType.padding_after_min;

  // Generate time slots
  const availableTimes: string[] = [];

  for (const window of timeWindows) {
    const windowStartMinutes = timeToMinutes(window.start);
    const windowEndMinutes = timeToMinutes(window.end);

    for (let slotStart = windowStartMinutes; slotStart + totalSlotDuration <= windowEndMinutes; slotStart += window.interval) {
      const slotTime = minutesToTime(slotStart);
      const slotDateTime = parseLocalDateTime(date, slotTime, effectiveTimezone);
      const slotEndDateTime = new Date(slotDateTime.getTime() + totalSlotDuration * 60 * 1000);

      // Check min_notice_hours
      if (limits.min_notice_hours !== null) {
        const minAllowedTime = new Date(now.getTime() + limits.min_notice_hours * 60 * 60 * 1000);
        if (slotDateTime < minAllowedTime) {
          continue;
        }
      }

      // Check max_notice_days
      if (limits.max_notice_days !== null) {
        const maxAllowedTime = new Date(now.getTime() + limits.max_notice_days * 24 * 60 * 60 * 1000);
        if (slotDateTime > maxAllowedTime) {
          continue;
        }
      }

      // Check if slot is blocked
      const isBlocked = blockedPeriods.some((block) => {
        const blockStart = new Date(block.start_at);
        const blockEnd = new Date(block.end_at);
        return slotDateTime < blockEnd && slotEndDateTime > blockStart;
      });

      if (isBlocked) {
        continue;
      }

      // Check existing appointments for this slot (capacity check)
      const overlappingAppointments = existingAppointments.filter((appt) => {
        const apptStart = new Date(appt.start_at);
        const apptEnd = new Date(appt.end_at);
        return slotDateTime < apptEnd && slotEndDateTime > apptStart;
      });

      const effectiveCapacity = limits.max_per_slot ?? appointmentType.capacity;
      if (overlappingAppointments.length >= effectiveCapacity) {
        continue;
      }

      // Check resource availability
      if (resourceRequirements.length > 0) {
        const resourcesAvailable = await checkResourceAvailability(
          resourceRequirements,
          slotDateTime,
          slotEndDateTime,
          null // No appointment to ignore
        );
        if (!resourcesAvailable) {
          continue;
        }
      }

      availableTimes.push(slotTime);
    }
  }

  return availableTimes;
}

// Check if a specific datetime is available
export async function checkAvailability(
  appointmentTypeId: string,
  calendarId: string,
  datetime: string, // ISO 8601
  ignoreAppointmentId?: string
): Promise<AvailabilityCheckResult> {
  const requestedTime = new Date(datetime);

  // Get calendar and appointment type data
  const [calendarResult, appointmentTypeResult] = await Promise.all([
    sql`SELECT id, timezone, org_id FROM calendars WHERE id = ${calendarId} AND deleted_at IS NULL`,
    sql`
      SELECT at.id, at.duration_min, at.padding_before_min, at.padding_after_min, at.capacity
      FROM appointment_types at
      JOIN appointment_type_calendars atc ON atc.appointment_type_id = at.id
      WHERE at.id = ${appointmentTypeId}
        AND atc.calendar_id = ${calendarId}
        AND at.deleted_at IS NULL
    `,
  ]);

  if (calendarResult.length === 0 || appointmentTypeResult.length === 0) {
    return { available: false, reason: "time_unavailable" };
  }

  const calendar = calendarResult[0];
  const appointmentType = appointmentTypeResult[0] as AppointmentType;
  const totalSlotDuration = appointmentType.duration_min + appointmentType.padding_before_min + appointmentType.padding_after_min;
  const slotEndTime = new Date(requestedTime.getTime() + totalSlotDuration * 60 * 1000);

  // Get scheduling limits
  const limitsResult = await sql`
    SELECT min_notice_hours, max_notice_days, max_per_slot, max_per_day, max_per_week
    FROM scheduling_limits
    WHERE calendar_id = ${calendarId} OR (calendar_id IS NULL AND org_id = ${calendar.org_id})
    ORDER BY calendar_id NULLS LAST
    LIMIT 1
  `;
  const limits: SchedulingLimits = limitsResult[0] || {
    min_notice_hours: null,
    max_notice_days: null,
    max_per_slot: null,
    max_per_day: null,
    max_per_week: null,
  };

  const now = new Date();

  // Check min_notice_hours
  if (limits.min_notice_hours !== null) {
    const minAllowedTime = new Date(now.getTime() + limits.min_notice_hours * 60 * 60 * 1000);
    if (requestedTime < minAllowedTime) {
      return { available: false, reason: "min_notice" };
    }
  }

  // Check max_notice_days
  if (limits.max_notice_days !== null) {
    const maxAllowedTime = new Date(now.getTime() + limits.max_notice_days * 24 * 60 * 60 * 1000);
    if (requestedTime > maxAllowedTime) {
      return { available: false, reason: "max_notice" };
    }
  }

  // Get the date and weekday
  const dateStr = formatDateInTimezone(requestedTime, calendar.timezone);
  const weekday = getWeekdayInTimezone(requestedTime, calendar.timezone);

  // Format time in calendar timezone
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: calendar.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timeParts = timeFormatter.formatToParts(requestedTime);
  const requestedHour = timeParts.find(p => p.type === "hour")?.value || "00";
  const requestedMinute = timeParts.find(p => p.type === "minute")?.value || "00";
  const requestedTimeStr = `${requestedHour}:${requestedMinute}`;
  const requestedMinutes = timeToMinutes(requestedTimeStr);

  // Check for override on this date
  const overrides = await sql`
    SELECT date::text, start_time::text, end_time::text, is_unavailable, interval_min
    FROM availability_overrides
    WHERE calendar_id = ${calendarId} AND date = ${dateStr}
  ` as AvailabilityOverride[];

  const override = overrides[0];

  if (override?.is_unavailable) {
    return { available: false, reason: "outside_hours" };
  }

  // Check if time falls within availability windows
  let withinAvailability = false;

  if (override?.start_time && override?.end_time) {
    const overrideStart = timeToMinutes(override.start_time);
    const overrideEnd = timeToMinutes(override.end_time);
    const endMinutes = requestedMinutes + totalSlotDuration;
    if (requestedMinutes >= overrideStart && endMinutes <= overrideEnd) {
      withinAvailability = true;
    }
  } else {
    // Check weekly rules
    const rules = await sql`
      SELECT weekday, start_time::text, end_time::text, interval_min
      FROM availability_rules
      WHERE calendar_id = ${calendarId} AND weekday = ${weekday}
    ` as AvailabilityRule[];

    for (const rule of rules) {
      const ruleStart = timeToMinutes(rule.start_time);
      const ruleEnd = timeToMinutes(rule.end_time);
      const endMinutes = requestedMinutes + totalSlotDuration;
      if (requestedMinutes >= ruleStart && endMinutes <= ruleEnd) {
        withinAvailability = true;
        break;
      }
    }
  }

  if (!withinAvailability) {
    return { available: false, reason: "outside_hours" };
  }

  // Check blocked time periods
  const blockedPeriods = await sql`
    SELECT start_at, end_at
    FROM blocked_time
    WHERE calendar_id = ${calendarId}
      AND start_at <= ${slotEndTime.toISOString()}
      AND end_at >= ${requestedTime.toISOString()}
  ` as BlockedTime[];

  if (blockedPeriods.length > 0) {
    return { available: false, reason: "blocked" };
  }

  // Check existing appointments (capacity)
  const dayStart = parseLocalDateTime(dateStr, "00:00", calendar.timezone);
  const dayEnd = parseLocalDateTime(dateStr, "23:59", calendar.timezone);

  let appointmentQuery = sql`
    SELECT id, start_at, end_at, status
    FROM appointments
    WHERE calendar_id = ${calendarId}
      AND appointment_type_id = ${appointmentTypeId}
      AND status NOT IN ('cancelled')
      AND start_at <= ${slotEndTime.toISOString()}
      AND end_at >= ${requestedTime.toISOString()}
  `;

  if (ignoreAppointmentId) {
    appointmentQuery = sql`
      SELECT id, start_at, end_at, status
      FROM appointments
      WHERE calendar_id = ${calendarId}
        AND appointment_type_id = ${appointmentTypeId}
        AND status NOT IN ('cancelled')
        AND start_at <= ${slotEndTime.toISOString()}
        AND end_at >= ${requestedTime.toISOString()}
        AND id != ${ignoreAppointmentId}
    `;
  }

  const overlappingAppointments = await appointmentQuery as Appointment[];
  const effectiveCapacity = limits.max_per_slot ?? appointmentType.capacity;

  if (overlappingAppointments.length >= effectiveCapacity) {
    return { available: false, reason: "capacity_exceeded" };
  }

  // Check max_per_day
  if (limits.max_per_day !== null) {
    let dailyQuery = sql`
      SELECT COUNT(*)::int as count
      FROM appointments
      WHERE calendar_id = ${calendarId}
        AND appointment_type_id = ${appointmentTypeId}
        AND status NOT IN ('cancelled')
        AND start_at >= ${dayStart.toISOString()}
        AND start_at <= ${dayEnd.toISOString()}
    `;

    if (ignoreAppointmentId) {
      dailyQuery = sql`
        SELECT COUNT(*)::int as count
        FROM appointments
        WHERE calendar_id = ${calendarId}
          AND appointment_type_id = ${appointmentTypeId}
          AND status NOT IN ('cancelled')
          AND start_at >= ${dayStart.toISOString()}
          AND start_at <= ${dayEnd.toISOString()}
          AND id != ${ignoreAppointmentId}
      `;
    }

    const dailyCount = await dailyQuery;
    if ((dailyCount[0]?.count ?? 0) >= limits.max_per_day) {
      return { available: false, reason: "capacity_exceeded" };
    }
  }

  // Check resource availability
  const resourceRequirements = await sql`
    SELECT atr.resource_id, atr.quantity_required, r.quantity as resource_quantity
    FROM appointment_type_resources atr
    JOIN resources r ON r.id = atr.resource_id AND r.deleted_at IS NULL
    WHERE atr.appointment_type_id = ${appointmentTypeId}
  ` as ResourceRequirement[];

  if (resourceRequirements.length > 0) {
    const resourcesAvailable = await checkResourceAvailability(
      resourceRequirements,
      requestedTime,
      slotEndTime,
      ignoreAppointmentId || null
    );
    if (!resourcesAvailable) {
      return { available: false, reason: "resource_unavailable" };
    }
  }

  return { available: true };
}

// Helper to check resource availability
async function checkResourceAvailability(
  requirements: ResourceRequirement[],
  startTime: Date,
  endTime: Date,
  ignoreAppointmentId: string | null
): Promise<boolean> {
  for (const req of requirements) {
    // Count concurrent resource usage
    let usageQuery = sql`
      SELECT COALESCE(SUM(ar.quantity), 0)::int as used
      FROM appointment_resources ar
      JOIN appointments a ON a.id = ar.appointment_id
      WHERE ar.resource_id = ${req.resource_id}
        AND a.status NOT IN ('cancelled')
        AND a.start_at < ${endTime.toISOString()}
        AND a.end_at > ${startTime.toISOString()}
    `;

    if (ignoreAppointmentId) {
      usageQuery = sql`
        SELECT COALESCE(SUM(ar.quantity), 0)::int as used
        FROM appointment_resources ar
        JOIN appointments a ON a.id = ar.appointment_id
        WHERE ar.resource_id = ${req.resource_id}
          AND a.status NOT IN ('cancelled')
          AND a.start_at < ${endTime.toISOString()}
          AND a.end_at > ${startTime.toISOString()}
          AND a.id != ${ignoreAppointmentId}
      `;
    }

    const usage = await usageQuery;
    const usedQuantity = usage[0]?.used ?? 0;
    const availableQuantity = req.resource_quantity - usedQuantity;

    if (availableQuantity < req.quantity_required) {
      return false;
    }
  }

  return true;
}
