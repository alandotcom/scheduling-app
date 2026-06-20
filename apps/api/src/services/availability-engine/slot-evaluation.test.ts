import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";
import {
  checkResourceCapacity,
  evaluateSlot,
  intervalsOverlap,
  isBlockedAt,
  type SlotConstraints,
} from "./slot-evaluation.js";
import type {
  BlockedTimeEntry,
  ExistingAppointment,
  MergedSchedulingLimits,
  ResourceConstraint,
  ResourceData,
} from "./types.js";

const NOW = DateTime.fromISO("2026-06-20T08:00:00", { zone: "utc" });

function slotAt(hour: number, durationMin = 60): { start: Date; end: Date } {
  const start = DateTime.fromISO("2026-06-22T00:00:00", { zone: "utc" }).set({
    hour,
  });
  return {
    start: start.toJSDate(),
    end: start.plus({ minutes: durationMin }).toJSDate(),
  };
}

const NO_LIMITS: MergedSchedulingLimits = {
  minNoticeMinutes: null,
  maxNoticeDays: null,
  maxPerSlot: null,
  maxPerDay: null,
  maxPerWeek: null,
};

function appt(
  startHour: number,
  durationMin = 60,
  overrides: Partial<ExistingAppointment> = {},
): ExistingAppointment {
  const start = DateTime.fromISO("2026-06-22T00:00:00", { zone: "utc" }).set({
    hour: startHour,
  });
  return {
    id: `appt-${startHour}`,
    calendarId: "cal-1",
    appointmentTypeId: "type-1",
    startAt: start.toJSDate(),
    endAt: start.plus({ minutes: durationMin }).toJSDate(),
    status: "scheduled",
    ...overrides,
  };
}

describe("intervalsOverlap", () => {
  test("detects overlap and abutment as non-overlapping", () => {
    const a = {
      start: new Date("2026-06-22T09:00:00Z"),
      end: new Date("2026-06-22T10:00:00Z"),
    };
    const overlapping = {
      start: new Date("2026-06-22T09:30:00Z"),
      end: new Date("2026-06-22T10:30:00Z"),
    };
    const abutting = {
      start: new Date("2026-06-22T10:00:00Z"),
      end: new Date("2026-06-22T11:00:00Z"),
    };
    expect(intervalsOverlap(a, overlapping)).toBe(true);
    expect(intervalsOverlap(a, abutting)).toBe(false);
  });
});

describe("isBlockedAt", () => {
  test("simple blocked window overlaps", () => {
    const blocked: BlockedTimeEntry = {
      id: "b1",
      calendarId: "cal-1",
      startAt: new Date("2026-06-22T09:00:00Z"),
      endAt: new Date("2026-06-22T10:00:00Z"),
      recurringRule: null,
    };
    expect(
      isBlockedAt(
        new Date("2026-06-22T09:30:00Z"),
        new Date("2026-06-22T10:30:00Z"),
        blocked,
      ),
    ).toBe(true);
    expect(
      isBlockedAt(
        new Date("2026-06-22T11:00:00Z"),
        new Date("2026-06-22T12:00:00Z"),
        blocked,
      ),
    ).toBe(false);
  });
});

describe("checkResourceCapacity", () => {
  const resources: ResourceData[] = [{ id: "r1", name: "Room", quantity: 1 }];
  const constraints: ResourceConstraint[] = [
    { resourceId: "r1", quantityRequired: 1 },
  ];
  const byType = new Map<string, ResourceConstraint[]>([
    ["type-1", constraints],
  ]);

  test("blocks when the resource is fully consumed by an overlapping appointment", () => {
    const existing = [appt(9)];
    const ok = checkResourceCapacity(
      slotAt(9).start,
      slotAt(9).end,
      constraints,
      resources,
      existing,
      byType,
    );
    expect(ok).toBe(false);
  });

  test("allows when no overlap", () => {
    const existing = [appt(11)];
    const ok = checkResourceCapacity(
      slotAt(9).start,
      slotAt(9).end,
      constraints,
      resources,
      existing,
      byType,
    );
    expect(ok).toBe(true);
  });
});

describe("evaluateSlot — type kind", () => {
  function typeConstraints(
    limits: MergedSchedulingLimits,
    capacity = 1,
  ): SlotConstraints {
    return {
      limits,
      blockedTimes: [],
      capacity: {
        kind: "type",
        capacity,
        paddingBeforeMin: 0,
        paddingAfterMin: 0,
        resourceConstraints: [],
        resourcesData: [],
        resourceConstraintsByAppointmentTypeId: new Map(),
      },
    };
  }

  test("available with full remaining capacity when unconstrained", () => {
    const result = evaluateSlot(
      slotAt(9),
      typeConstraints(NO_LIMITS, 3),
      [],
      NOW,
    );
    expect(result.available).toBe(true);
    expect(result.remainingCapacity).toBe(3);
  });

  test("past slot is unavailable", () => {
    const past = {
      start: NOW.minus({ hours: 2 }).toJSDate(),
      end: NOW.minus({ hours: 1 }).toJSDate(),
    };
    const result = evaluateSlot(past, typeConstraints(NO_LIMITS), [], NOW);
    expect(result.available).toBe(false);
  });

  test("overlap exhausts capacity 1", () => {
    const result = evaluateSlot(
      slotAt(9),
      typeConstraints(NO_LIMITS, 1),
      [appt(9)],
      NOW,
    );
    expect(result.available).toBe(false);
    expect(result.remainingCapacity).toBe(0);
  });

  test("min notice excludes a too-soon slot", () => {
    const soon = {
      start: NOW.plus({ minutes: 10 }).toJSDate(),
      end: NOW.plus({ minutes: 70 }).toJSDate(),
    };
    const result = evaluateSlot(
      soon,
      typeConstraints({ ...NO_LIMITS, minNoticeMinutes: 60 }),
      [],
      NOW,
    );
    expect(result.available).toBe(false);
  });
});

describe("evaluateSlot — perSlot kind", () => {
  function perSlot(limits: MergedSchedulingLimits): SlotConstraints {
    return { limits, blockedTimes: [], capacity: { kind: "perSlot" } };
  }

  test("available with remainingCapacity 1 when no maxPerSlot", () => {
    const result = evaluateSlot(slotAt(9), perSlot(NO_LIMITS), [appt(9)], NOW);
    // perSlot ignores overlap entirely when maxPerSlot is null
    expect(result.available).toBe(true);
    expect(result.remainingCapacity).toBe(1);
  });

  test("maxPerSlot counts overlaps", () => {
    const result = evaluateSlot(
      slotAt(9),
      perSlot({ ...NO_LIMITS, maxPerSlot: 1 }),
      [appt(9)],
      NOW,
    );
    expect(result.available).toBe(false);
    expect(result.remainingCapacity).toBe(0);
  });
});
