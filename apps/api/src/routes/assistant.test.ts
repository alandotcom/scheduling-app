import { describe, expect, test } from "bun:test";
import {
  buildProposal,
  buildSystemPrompt,
  findAppointmentsInputSchema,
  findAppointmentTypesInputSchema,
  findCalendarsInputSchema,
  findClientsInputSchema,
  getAppointmentInputSchema,
  getAvailableSlotsInputSchema,
  MAX_SLOT_RANGE_DAYS,
  proposeBookAppointmentInputSchema,
  proposeCancelAppointmentInputSchema,
  proposeConfirmAppointmentInputSchema,
  proposeNoShowAppointmentInputSchema,
  proposeRescheduleAppointmentInputSchema,
  toAppointmentTableRow,
  toClientTableRow,
  toIsoString,
} from "./assistant.js";

const VALID_UUID = "019458d5-b070-7f8e-be2d-0242ac120002";
const VALID_UUID_2 = "019458d5-b070-7f8e-be2d-0242ac120003";

describe("toIsoString", () => {
  test("returns ISO string from Date object", () => {
    const date = new Date("2026-03-15T10:30:00.000Z");
    expect(toIsoString(date)).toBe("2026-03-15T10:30:00.000Z");
  });

  test("returns ISO string from valid date string", () => {
    expect(toIsoString("2026-03-15T10:30:00Z")).toBe(
      "2026-03-15T10:30:00.000Z",
    );
  });

  test("returns original string for unparseable value", () => {
    expect(toIsoString("not-a-date")).toBe("not-a-date");
  });

  test("normalizes partial date strings", () => {
    // "2026-03-15" is parseable by new Date() — should produce an ISO string
    const result = toIsoString("2026-03-15");
    expect(result).toContain("2026-03-15");
    expect(result).toContain("T");
  });
});

describe("toClientTableRow", () => {
  test("transforms client with full data", () => {
    const row = toClientTableRow({
      id: VALID_UUID,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+1-555-0100",
      relationshipCounts: { appointments: 5 },
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(row).toEqual({
      id: VALID_UUID,
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+1-555-0100",
      appointmentCount: 5,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  test("falls back to 'Unknown Client' when both names are empty", () => {
    const row = toClientTableRow({
      id: VALID_UUID,
      firstName: "",
      lastName: "",
      email: null,
      phone: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    expect(row.fullName).toBe("Unknown Client");
  });

  test("trims whitespace-only names to 'Unknown Client'", () => {
    const row = toClientTableRow({
      id: VALID_UUID,
      firstName: " ",
      lastName: " ",
      email: null,
      phone: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    expect(row.fullName).toBe("Unknown Client");
  });

  test("handles first name only", () => {
    const row = toClientTableRow({
      id: VALID_UUID,
      firstName: "Ada",
      lastName: "",
      email: null,
      phone: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    expect(row.fullName).toBe("Ada");
  });

  test("handles last name only", () => {
    const row = toClientTableRow({
      id: VALID_UUID,
      firstName: "",
      lastName: "Lovelace",
      email: null,
      phone: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    expect(row.fullName).toBe("Lovelace");
  });

  test("defaults appointmentCount to 0 when relationshipCounts is missing", () => {
    const row = toClientTableRow({
      id: VALID_UUID,
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      phone: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    expect(row.appointmentCount).toBe(0);
  });

  test("handles createdAt as string", () => {
    const row = toClientTableRow({
      id: VALID_UUID,
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      phone: null,
      createdAt: "2026-06-15T12:00:00.000Z",
    });

    expect(row.createdAt).toBe("2026-06-15T12:00:00.000Z");
  });

  test("allows null email and phone", () => {
    const row = toClientTableRow({
      id: VALID_UUID,
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      phone: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
  });
});

describe("toAppointmentTableRow", () => {
  test("transforms appointment with full data", () => {
    const row = toAppointmentTableRow({
      id: VALID_UUID,
      clientId: VALID_UUID_2,
      calendarId: VALID_UUID,
      appointmentTypeId: VALID_UUID_2,
      startAt: new Date("2026-03-15T10:00:00Z"),
      endAt: new Date("2026-03-15T10:30:00Z"),
      timezone: "America/New_York",
      status: "scheduled",
      calendar: { name: "Dr. Smith" },
      appointmentType: { name: "Initial Consultation" },
      client: { firstName: "Ada", lastName: "Lovelace" },
    });

    expect(row).toEqual({
      id: VALID_UUID,
      clientId: VALID_UUID_2,
      clientName: "Ada Lovelace",
      calendarId: VALID_UUID,
      appointmentTypeId: VALID_UUID_2,
      startAt: "2026-03-15T10:00:00.000Z",
      endAt: "2026-03-15T10:30:00.000Z",
      timezone: "America/New_York",
      status: "scheduled",
      calendarName: "Dr. Smith",
      appointmentTypeName: "Initial Consultation",
    });
  });

  test("falls back to 'Unknown Client' when client names are empty", () => {
    const row = toAppointmentTableRow({
      id: VALID_UUID,
      clientId: VALID_UUID_2,
      startAt: "2026-03-15T10:00:00Z",
      endAt: "2026-03-15T10:30:00Z",
      timezone: "America/New_York",
      status: "confirmed",
      client: { firstName: "", lastName: "" },
    });

    expect(row.clientName).toBe("Unknown Client");
  });

  test("defaults calendarName and IDs to null when calendar/type is undefined", () => {
    const row = toAppointmentTableRow({
      id: VALID_UUID,
      clientId: VALID_UUID_2,
      startAt: "2026-03-15T10:00:00Z",
      endAt: "2026-03-15T10:30:00Z",
      timezone: "America/New_York",
      status: "scheduled",
      client: { firstName: "Ada", lastName: "Lovelace" },
    });

    expect(row.calendarName).toBeNull();
    expect(row.appointmentTypeName).toBeNull();
    expect(row.calendarId).toBeNull();
    expect(row.appointmentTypeId).toBeNull();
  });

  test("handles all status values", () => {
    const statuses = [
      "scheduled",
      "confirmed",
      "cancelled",
      "no_show",
    ] as const;
    for (const status of statuses) {
      const row = toAppointmentTableRow({
        id: VALID_UUID,
        clientId: VALID_UUID_2,
        startAt: "2026-03-15T10:00:00Z",
        endAt: "2026-03-15T10:30:00Z",
        timezone: "America/New_York",
        status,
        client: { firstName: "Ada", lastName: "Lovelace" },
      });
      expect(row.status).toBe(status);
    }
  });

  test("handles date strings for startAt and endAt", () => {
    const row = toAppointmentTableRow({
      id: VALID_UUID,
      clientId: VALID_UUID_2,
      startAt: "2026-03-15T10:00:00.000Z",
      endAt: "2026-03-15T10:30:00.000Z",
      timezone: "America/New_York",
      status: "scheduled",
      client: { firstName: "Ada", lastName: "Lovelace" },
    });

    expect(row.startAt).toBe("2026-03-15T10:00:00.000Z");
    expect(row.endAt).toBe("2026-03-15T10:30:00.000Z");
  });
});

describe("buildProposal", () => {
  test("builds a confirm proposal with correct structure", () => {
    const result = buildProposal({
      actionType: "confirm",
      summary: "Confirm appointment ABC",
      payload: { appointmentId: VALID_UUID },
    });

    expect(result.proposal).toMatchObject({
      actionType: "confirm",
      summary: "Confirm appointment ABC",
      payload: { appointmentId: VALID_UUID },
    });
    expect(result.proposal.proposalId).toBeTruthy();
    expect(typeof result.proposal.proposalId).toBe("string");
  });

  test("builds a book proposal with full payload", () => {
    const result = buildProposal({
      actionType: "book",
      summary: "Book new appointment",
      payload: {
        calendarId: VALID_UUID,
        appointmentTypeId: VALID_UUID_2,
        startTime: "2026-03-15T10:00:00.000Z",
        timezone: "America/New_York",
        clientId: VALID_UUID,
        notes: null,
      },
    });

    expect(result.proposal.actionType).toBe("book");
    expect(result.proposal.payload).toEqual({
      calendarId: VALID_UUID,
      appointmentTypeId: VALID_UUID_2,
      startTime: "2026-03-15T10:00:00.000Z",
      timezone: "America/New_York",
      clientId: VALID_UUID,
      notes: null,
    });
  });

  test("builds a cancel proposal with reason", () => {
    const result = buildProposal({
      actionType: "cancel",
      summary: "Cancel appointment",
      payload: {
        appointmentId: VALID_UUID,
        reason: "Patient requested cancellation",
      },
    });

    expect(result.proposal.actionType).toBe("cancel");
    expect(result.proposal.payload).toHaveProperty("appointmentId", VALID_UUID);
    expect(result.proposal.payload).toHaveProperty(
      "reason",
      "Patient requested cancellation",
    );
  });

  test("builds a reschedule proposal", () => {
    const result = buildProposal({
      actionType: "reschedule",
      summary: "Reschedule to next week",
      payload: {
        appointmentId: VALID_UUID,
        newStartTime: "2026-03-22T10:00:00.000Z",
        timezone: "America/New_York",
      },
    });

    expect(result.proposal.actionType).toBe("reschedule");
  });

  test("builds a no_show proposal", () => {
    const result = buildProposal({
      actionType: "no_show",
      summary: "Mark as no-show",
      payload: { appointmentId: VALID_UUID },
    });

    expect(result.proposal.actionType).toBe("no_show");
  });

  test("generates unique proposalIds", () => {
    const a = buildProposal({
      actionType: "confirm",
      summary: "A",
      payload: { appointmentId: VALID_UUID },
    });
    const b = buildProposal({
      actionType: "confirm",
      summary: "B",
      payload: { appointmentId: VALID_UUID },
    });

    expect(a.proposal.proposalId).not.toBe(b.proposal.proposalId);
  });

  test("rejects invalid payload via schema validation", () => {
    expect(() =>
      buildProposal({
        actionType: "confirm",
        summary: "Confirm",
        payload: { invalidField: "oops" },
      }),
    ).toThrow();
  });

  test("rejects empty summary", () => {
    expect(() =>
      buildProposal({
        actionType: "confirm",
        summary: "",
        payload: { appointmentId: VALID_UUID },
      }),
    ).toThrow();
  });
});

describe("buildSystemPrompt", () => {
  test("includes the formatted date", () => {
    const prompt = buildSystemPrompt(new Date("2026-03-15T10:00:00Z"));
    expect(prompt).toContain("2026-03-15");
  });

  test("identifies as scheduling assistant", () => {
    const prompt = buildSystemPrompt(new Date());
    expect(prompt).toContain("scheduling assistant");
  });

  test("instructs not to execute changes directly", () => {
    const prompt = buildSystemPrompt(new Date());
    expect(prompt).toContain("do not execute changes directly");
  });

  test("mentions proposal confirmation in UI", () => {
    const prompt = buildSystemPrompt(new Date());
    expect(prompt).toContain("confirm in the UI");
  });

  test("includes response format guidance", () => {
    const prompt = buildSystemPrompt(new Date());
    expect(prompt).toContain(
      "NEVER repeat, restate, list, summarize, or tabulate the data",
    );
  });

  test("allows parallel resolution when user provides details upfront", () => {
    const prompt = buildSystemPrompt(new Date());
    expect(prompt).toContain("resolve as many steps as possible in parallel");
  });

  test("requires human-readable summaries for proposals", () => {
    const prompt = buildSystemPrompt(new Date());
    expect(prompt).toContain("Never include UUIDs in summaries");
  });
});

// ---------- Tool input schema tests ----------

describe("getAvailableSlotsInputSchema", () => {
  const validInput = {
    calendarId: VALID_UUID,
    appointmentTypeId: VALID_UUID_2,
    startDate: "2026-03-15",
    endDate: "2026-03-20",
  };

  test("accepts valid date range within limit", () => {
    const result = getAvailableSlotsInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  test("accepts same-day range (0-day span)", () => {
    const result = getAvailableSlotsInputSchema.safeParse({
      ...validInput,
      startDate: "2026-03-15",
      endDate: "2026-03-15",
    });
    expect(result.success).toBe(true);
  });

  test("accepts exactly MAX_SLOT_RANGE_DAYS span", () => {
    const result = getAvailableSlotsInputSchema.safeParse({
      ...validInput,
      startDate: "2026-03-15",
      endDate: "2026-03-22", // 7 days later
    });
    expect(result.success).toBe(true);
  });

  test("rejects range exceeding MAX_SLOT_RANGE_DAYS", () => {
    const result = getAvailableSlotsInputSchema.safeParse({
      ...validInput,
      startDate: "2026-03-15",
      endDate: "2026-03-23", // 8 days later
    });
    expect(result.success).toBe(false);
  });

  test("rejects endDate before startDate", () => {
    const result = getAvailableSlotsInputSchema.safeParse({
      ...validInput,
      startDate: "2026-03-20",
      endDate: "2026-03-15",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid date format for startDate", () => {
    const result = getAvailableSlotsInputSchema.safeParse({
      ...validInput,
      startDate: "03-15-2026",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid date format for endDate", () => {
    const result = getAvailableSlotsInputSchema.safeParse({
      ...validInput,
      endDate: "2026/03/20",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing calendarId", () => {
    const { calendarId: _, ...rest } = validInput;
    const result = getAvailableSlotsInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test("rejects missing appointmentTypeId", () => {
    const { appointmentTypeId: _, ...rest } = validInput;
    const result = getAvailableSlotsInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test("rejects non-UUID calendarId", () => {
    const result = getAvailableSlotsInputSchema.safeParse({
      ...validInput,
      calendarId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  test("MAX_SLOT_RANGE_DAYS is 7", () => {
    expect(MAX_SLOT_RANGE_DAYS).toBe(7);
  });
});

describe("findClientsInputSchema", () => {
  test("accepts empty input (all defaults)", () => {
    const result = findClientsInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
      expect(result.data.query).toBeUndefined();
    }
  });

  test("accepts query and custom limit", () => {
    const result = findClientsInputSchema.safeParse({
      query: "Ada",
      limit: 5,
    });
    expect(result.success).toBe(true);
  });

  test("trims query whitespace", () => {
    const result = findClientsInputSchema.safeParse({ query: "  Ada  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("Ada");
    }
  });

  test("rejects limit above max (25)", () => {
    const result = findClientsInputSchema.safeParse({ limit: 26 });
    expect(result.success).toBe(false);
  });

  test("rejects limit below min (1)", () => {
    const result = findClientsInputSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  test("rejects non-integer limit", () => {
    const result = findClientsInputSchema.safeParse({ limit: 5.5 });
    expect(result.success).toBe(false);
  });
});

describe("findAppointmentsInputSchema", () => {
  test("accepts empty input with defaults", () => {
    const result = findAppointmentsInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope).toBe("upcoming");
      expect(result.data.limit).toBe(10);
    }
  });

  test("accepts all valid status values", () => {
    for (const status of ["scheduled", "confirmed", "cancelled", "no_show"]) {
      const result = findAppointmentsInputSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid status", () => {
    const result = findAppointmentsInputSchema.safeParse({
      status: "completed",
    });
    expect(result.success).toBe(false);
  });

  test("accepts all valid scope values", () => {
    for (const scope of ["upcoming", "history", "all"]) {
      const result = findAppointmentsInputSchema.safeParse({ scope });
      expect(result.success).toBe(true);
    }
  });

  test("accepts date filters with YYYY-MM-DD format", () => {
    const result = findAppointmentsInputSchema.safeParse({
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid date format", () => {
    const result = findAppointmentsInputSchema.safeParse({
      startDate: "03-15-2026",
    });
    expect(result.success).toBe(false);
  });

  test("accepts clientId as UUID", () => {
    const result = findAppointmentsInputSchema.safeParse({
      clientId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  test("rejects non-UUID clientId", () => {
    const result = findAppointmentsInputSchema.safeParse({
      clientId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("getAppointmentInputSchema", () => {
  test("accepts valid UUID", () => {
    const result = getAppointmentInputSchema.safeParse({
      appointmentId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  test("rejects non-UUID", () => {
    const result = getAppointmentInputSchema.safeParse({
      appointmentId: "bad",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing appointmentId", () => {
    const result = getAppointmentInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("findCalendarsInputSchema", () => {
  test("accepts empty input with defaults", () => {
    const result = findCalendarsInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  test("accepts appointmentTypeId filter", () => {
    const result = findCalendarsInputSchema.safeParse({
      appointmentTypeId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  test("rejects non-UUID appointmentTypeId", () => {
    const result = findCalendarsInputSchema.safeParse({
      appointmentTypeId: "bad",
    });
    expect(result.success).toBe(false);
  });
});

describe("findAppointmentTypesInputSchema", () => {
  test("accepts empty input with defaults", () => {
    const result = findAppointmentTypesInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  test("accepts query string", () => {
    const result = findAppointmentTypesInputSchema.safeParse({
      query: "consultation",
    });
    expect(result.success).toBe(true);
  });
});

describe("proposeBookAppointmentInputSchema", () => {
  const validInput = {
    calendarId: VALID_UUID,
    appointmentTypeId: VALID_UUID_2,
    startTime: "2026-03-15T10:00:00.000Z",
    timezone: "America/New_York",
    clientId: VALID_UUID,
  };

  test("accepts valid book input", () => {
    const result = proposeBookAppointmentInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  test("accepts optional notes", () => {
    const result = proposeBookAppointmentInputSchema.safeParse({
      ...validInput,
      notes: "First visit",
    });
    expect(result.success).toBe(true);
  });

  test("accepts null notes", () => {
    const result = proposeBookAppointmentInputSchema.safeParse({
      ...validInput,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  test("accepts optional summary", () => {
    const result = proposeBookAppointmentInputSchema.safeParse({
      ...validInput,
      summary: "Book initial consult for Ada Lovelace",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty startTime", () => {
    const result = proposeBookAppointmentInputSchema.safeParse({
      ...validInput,
      startTime: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty timezone", () => {
    const result = proposeBookAppointmentInputSchema.safeParse({
      ...validInput,
      timezone: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing required fields", () => {
    const result = proposeBookAppointmentInputSchema.safeParse({
      calendarId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });
});

describe("proposeRescheduleAppointmentInputSchema", () => {
  test("accepts valid reschedule input", () => {
    const result = proposeRescheduleAppointmentInputSchema.safeParse({
      appointmentId: VALID_UUID,
      newStartTime: "2026-03-22T10:00:00.000Z",
      timezone: "America/New_York",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing appointmentId", () => {
    const result = proposeRescheduleAppointmentInputSchema.safeParse({
      newStartTime: "2026-03-22T10:00:00.000Z",
      timezone: "America/New_York",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty newStartTime", () => {
    const result = proposeRescheduleAppointmentInputSchema.safeParse({
      appointmentId: VALID_UUID,
      newStartTime: "",
      timezone: "America/New_York",
    });
    expect(result.success).toBe(false);
  });
});

describe("proposeConfirmAppointmentInputSchema", () => {
  test("accepts valid confirm input", () => {
    const result = proposeConfirmAppointmentInputSchema.safeParse({
      appointmentId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  test("accepts optional summary", () => {
    const result = proposeConfirmAppointmentInputSchema.safeParse({
      appointmentId: VALID_UUID,
      summary: "Confirm Ada's appointment",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing appointmentId", () => {
    const result = proposeConfirmAppointmentInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("proposeCancelAppointmentInputSchema", () => {
  test("accepts valid cancel input with reason", () => {
    const result = proposeCancelAppointmentInputSchema.safeParse({
      appointmentId: VALID_UUID,
      reason: "Patient requested",
    });
    expect(result.success).toBe(true);
  });

  test("accepts null reason", () => {
    const result = proposeCancelAppointmentInputSchema.safeParse({
      appointmentId: VALID_UUID,
      reason: null,
    });
    expect(result.success).toBe(true);
  });

  test("accepts omitted reason", () => {
    const result = proposeCancelAppointmentInputSchema.safeParse({
      appointmentId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });
});

describe("proposeNoShowAppointmentInputSchema", () => {
  test("accepts valid no_show input", () => {
    const result = proposeNoShowAppointmentInputSchema.safeParse({
      appointmentId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  test("rejects non-UUID appointmentId", () => {
    const result = proposeNoShowAppointmentInputSchema.safeParse({
      appointmentId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
