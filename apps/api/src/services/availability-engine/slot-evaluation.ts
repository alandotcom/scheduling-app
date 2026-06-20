// The single per-slot evaluator shared by booking (typed) and the calendar
// editor preview (type-agnostic). Both callers generate candidate slots, then
// run each one through evaluateSlot. The only difference is the capacity model,
// expressed as a discriminated SlotCapacityConstraint rather than two copied
// filter chains. Pure: no DB, no time source beyond the injected `now`.

import { DateTime } from "luxon";
import { RRule } from "rrule";
import type {
  BlockedTimeEntry,
  ExistingAppointment,
  MergedSchedulingLimits,
  ResourceConstraint,
  ResourceData,
  TimeSlot,
} from "./types.js";

export function intervalsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return a.start < b.end && b.start < a.end;
}

export function isBlockedAt(
  start: Date,
  end: Date,
  blocked: BlockedTimeEntry,
): boolean {
  // Handle recurring blocked time
  if (blocked.recurringRule) {
    try {
      const rruleOptions = RRule.parseString(blocked.recurringRule);
      // Anchor recurrence to the block's configured start timestamp.
      rruleOptions.dtstart = blocked.startAt;
      const rrule = new RRule(rruleOptions);
      const occurrences = rrule.between(
        DateTime.fromJSDate(start).minus({ days: 1 }).toJSDate(),
        DateTime.fromJSDate(end).plus({ days: 1 }).toJSDate(),
        true,
      );

      const blockDuration = blocked.endAt.getTime() - blocked.startAt.getTime();

      for (const occurrence of occurrences) {
        const blockStart = DateTime.fromJSDate(occurrence);
        const blockEnd = blockStart.plus({ milliseconds: blockDuration });

        if (
          intervalsOverlap(
            { start, end },
            { start: blockStart.toJSDate(), end: blockEnd.toJSDate() },
          )
        ) {
          return true;
        }
      }
      return false;
    } catch {
      // If RRULE parsing fails, fall back to simple check
      return intervalsOverlap(
        { start, end },
        { start: blocked.startAt, end: blocked.endAt },
      );
    }
  }

  // Simple blocked time
  return intervalsOverlap(
    { start, end },
    { start: blocked.startAt, end: blocked.endAt },
  );
}

export function checkResourceCapacity(
  start: Date,
  end: Date,
  resourceConstraints: ResourceConstraint[],
  resourcesData: ResourceData[],
  existingAppointments: ExistingAppointment[],
  resourceConstraintsByAppointmentTypeId: Map<string, ResourceConstraint[]>,
): boolean {
  // For each resource, check if adding this appointment would exceed capacity
  for (const constraint of resourceConstraints) {
    const resource = resourcesData.find((r) => r.id === constraint.resourceId);
    if (!resource) continue;

    // Count how much of this resource is already allocated during this time
    // We need to look at appointments that use this resource
    const overlappingAppointments = existingAppointments.filter((a) =>
      intervalsOverlap({ start, end }, { start: a.startAt, end: a.endAt }),
    );

    let usedQuantity = 0;
    for (const appointment of overlappingAppointments) {
      const appointmentConstraints =
        resourceConstraintsByAppointmentTypeId.get(
          appointment.appointmentTypeId,
        ) ?? [];
      const matchingConstraint = appointmentConstraints.find(
        (appointmentConstraint) =>
          appointmentConstraint.resourceId === constraint.resourceId,
      );
      if (matchingConstraint) {
        usedQuantity += matchingConstraint.quantityRequired;
      }
    }

    if (usedQuantity + constraint.quantityRequired > resource.quantity) {
      return false;
    }
  }

  return true;
}

// The capacity rule differs by caller:
// - "type": booking with a chosen appointment type — padding, per-type capacity,
//   and resource constraints all apply.
// - "perSlot": the type-agnostic calendar editor preview — only maxPerSlot, no
//   padding and no resource constraints (no appointment type is chosen yet).
export type SlotCapacityConstraint =
  | {
      kind: "type";
      capacity: number;
      paddingBeforeMin: number;
      paddingAfterMin: number;
      resourceConstraints: ResourceConstraint[];
      resourcesData: ResourceData[];
      resourceConstraintsByAppointmentTypeId: Map<string, ResourceConstraint[]>;
    }
  | { kind: "perSlot" };

export interface SlotConstraints {
  limits: MergedSchedulingLimits;
  blockedTimes: BlockedTimeEntry[];
  capacity: SlotCapacityConstraint;
}

export function evaluateSlot(
  slot: { start: Date; end: Date },
  constraints: SlotConstraints,
  existingAppointments: ExistingAppointment[],
  now: DateTime,
): TimeSlot {
  const { limits, blockedTimes, capacity } = constraints;
  const slotStart = DateTime.fromJSDate(slot.start);
  const slotEnd = DateTime.fromJSDate(slot.end);
  let available = true;

  // Shared filters: notice window, no past slots, blocked time.
  if (available && limits.minNoticeMinutes != null) {
    if (slotStart < now.plus({ minutes: limits.minNoticeMinutes })) {
      available = false;
    }
  }

  if (available && limits.maxNoticeDays != null) {
    if (slotStart > now.plus({ days: limits.maxNoticeDays })) {
      available = false;
    }
  }

  if (available && slotStart < now) {
    available = false;
  }

  if (available) {
    for (const blocked of blockedTimes) {
      if (isBlockedAt(slot.start, slot.end, blocked)) {
        available = false;
        break;
      }
    }
  }

  if (capacity.kind === "type") {
    let remainingCapacity = capacity.capacity;

    // Existing appointments (with padding) consume capacity.
    if (available) {
      const slotWithPadding = {
        start: slotStart
          .minus({ minutes: capacity.paddingBeforeMin })
          .toJSDate(),
        end: slotEnd.plus({ minutes: capacity.paddingAfterMin }).toJSDate(),
      };

      let overlappingCount = 0;
      for (const appt of existingAppointments) {
        if (
          intervalsOverlap(slotWithPadding, {
            start: appt.startAt,
            end: appt.endAt,
          })
        ) {
          overlappingCount++;
        }
      }

      remainingCapacity = capacity.capacity - overlappingCount;
      if (remainingCapacity <= 0) {
        available = false;
      }
    }

    if (available && capacity.resourceConstraints.length > 0) {
      const resourceAvailable = checkResourceCapacity(
        slot.start,
        slot.end,
        capacity.resourceConstraints,
        capacity.resourcesData,
        existingAppointments,
        capacity.resourceConstraintsByAppointmentTypeId,
      );
      if (!resourceAvailable) {
        available = false;
      }
    }

    if (available && limits.maxPerDay != null) {
      const dailyCount = existingAppointments.filter((a) =>
        DateTime.fromJSDate(a.startAt).hasSame(slotStart, "day"),
      ).length;
      if (dailyCount >= limits.maxPerDay) {
        available = false;
      }
    }

    if (available && limits.maxPerWeek != null) {
      const weekStart = slotStart.startOf("week");
      const weekEnd = slotStart.endOf("week");
      const weeklyCount = existingAppointments.filter((a) => {
        const apptStart = DateTime.fromJSDate(a.startAt);
        return apptStart >= weekStart && apptStart <= weekEnd;
      }).length;
      if (weeklyCount >= limits.maxPerWeek) {
        available = false;
      }
    }

    if (available && limits.maxPerSlot != null) {
      if (capacity.capacity - remainingCapacity >= limits.maxPerSlot) {
        available = false;
      }
    }

    return {
      start: slot.start,
      end: slot.end,
      available,
      remainingCapacity: Math.max(0, remainingCapacity),
    };
  }

  // perSlot: type-agnostic preview. Overlap counts only against maxPerSlot.
  let overlappingCount = 0;
  if (available && limits.maxPerSlot != null) {
    for (const appointment of existingAppointments) {
      if (
        intervalsOverlap(
          { start: slotStart.toJSDate(), end: slotEnd.toJSDate() },
          { start: appointment.startAt, end: appointment.endAt },
        )
      ) {
        overlappingCount++;
      }
    }
    if (overlappingCount >= limits.maxPerSlot) {
      available = false;
    }
  }

  if (available && limits.maxPerDay != null) {
    const dailyCount = existingAppointments.filter((a) =>
      DateTime.fromJSDate(a.startAt).hasSame(slotStart, "day"),
    ).length;
    if (dailyCount >= limits.maxPerDay) {
      available = false;
    }
  }

  if (available && limits.maxPerWeek != null) {
    const weekStart = slotStart.startOf("week");
    const weekEnd = slotStart.endOf("week");
    const weeklyCount = existingAppointments.filter((a) => {
      const apptStart = DateTime.fromJSDate(a.startAt);
      return apptStart >= weekStart && apptStart <= weekEnd;
    }).length;
    if (weeklyCount >= limits.maxPerWeek) {
      available = false;
    }
  }

  const remainingCapacity =
    limits.maxPerSlot != null
      ? Math.max(0, limits.maxPerSlot - overlappingCount)
      : available
        ? 1
        : 0;

  return {
    start: slot.start,
    end: slot.end,
    available,
    remainingCapacity,
  };
}
