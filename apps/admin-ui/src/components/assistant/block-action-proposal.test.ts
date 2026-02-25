import { describe, expect, test } from "bun:test";
import { formatPayloadEntries } from "./block-action-proposal";

describe("formatPayloadEntries", () => {
  test("hides fields ending with Id", () => {
    const entries = formatPayloadEntries({
      calendarId: "abc-123",
      appointmentTypeId: "def-456",
      clientName: "Ada Lovelace",
    });
    expect(entries).toEqual([{ label: "Client", value: "Ada Lovelace" }]);
  });

  test("hides the 'id' field", () => {
    const entries = formatPayloadEntries({
      id: "abc-123",
      clientName: "Ada Lovelace",
    });
    expect(entries).toEqual([{ label: "Client", value: "Ada Lovelace" }]);
  });

  test("hides proposalId and timezone keys", () => {
    const entries = formatPayloadEntries({
      proposalId: "hidden",
      timezone: "America/New_York",
      clientName: "Ada Lovelace",
    });
    expect(entries).toEqual([{ label: "Client", value: "Ada Lovelace" }]);
  });

  test("skips null and undefined values", () => {
    const entries = formatPayloadEntries({
      present: "yes",
      nullField: null,
      undefinedField: undefined,
    });
    expect(entries).toEqual([{ label: "Present", value: "yes" }]);
  });

  test("formats number values as string", () => {
    const entries = formatPayloadEntries({ count: 42 });
    expect(entries).toEqual([{ label: "Count", value: "42" }]);
  });

  test("formats boolean values as string", () => {
    const entries = formatPayloadEntries({ active: true });
    expect(entries).toEqual([{ label: "Active", value: "true" }]);
  });

  test("JSON-stringifies complex values", () => {
    const entries = formatPayloadEntries({ nested: { a: 1 } });
    expect(entries).toEqual([{ label: "Nested", value: '{"a":1}' }]);
  });

  test("returns empty array for empty payload", () => {
    expect(formatPayloadEntries({})).toEqual([]);
  });

  test("returns empty array for payload with only null values", () => {
    expect(formatPayloadEntries({ a: null, b: undefined })).toEqual([]);
  });

  test("handles single-word keys", () => {
    const entries = formatPayloadEntries({ reason: "Patient requested" });
    expect(entries).toEqual([{ label: "Reason", value: "Patient requested" }]);
  });

  test("preserves order of payload entries (excluding hidden keys)", () => {
    const entries = formatPayloadEntries({
      clientId: "hidden",
      first: "1",
      second: "2",
      third: "3",
    });
    expect(entries.map((e) => e.label)).toEqual(["First", "Second", "Third"]);
  });

  test("formats ISO timestamp strings to readable dates", () => {
    const entries = formatPayloadEntries({
      startTime: "2026-02-26T14:30:00.000Z",
    });
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.label).toBe("Start Time");
    // The exact format depends on locale, but it should NOT be the raw ISO string
    expect(entry.value).not.toBe("2026-02-26T14:30:00.000Z");
    expect(entry.value).toContain("2026");
  });

  test("leaves non-ISO strings as-is", () => {
    const entries = formatPayloadEntries({ reason: "Patient requested" });
    expect(entries).toEqual([{ label: "Reason", value: "Patient requested" }]);
  });

  test("returns only human-readable fields for a typical book proposal", () => {
    const entries = formatPayloadEntries({
      calendarId: "cal-uuid",
      appointmentTypeId: "type-uuid",
      startTime: "2026-02-26T14:30:00.000Z",
      timezone: "America/New_York",
      clientId: "client-uuid",
      notes: null,
    });
    // timezone is hidden (used for formatting), IDs hidden, null notes hidden
    expect(entries).toHaveLength(1);
    expect(entries.map((e) => e.label)).toEqual(["Start Time"]);
  });

  test("shows display name fields with clean labels", () => {
    const entries = formatPayloadEntries({
      calendarId: "cal-uuid",
      appointmentTypeId: "type-uuid",
      startTime: "2026-02-26T14:30:00.000Z",
      timezone: "America/New_York",
      clientId: "client-uuid",
      notes: null,
      clientName: "Ada Lovelace",
      calendarName: "Dr. Smith",
      appointmentTypeName: "Initial Consultation",
    });
    const labels = entries.map((e) => e.label);
    expect(labels).toContain("Client");
    expect(labels).toContain("Calendar");
    expect(labels).toContain("Type");
    expect(entries.find((e) => e.label === "Client")?.value).toBe(
      "Ada Lovelace",
    );
    expect(entries.find((e) => e.label === "Calendar")?.value).toBe(
      "Dr. Smith",
    );
    expect(entries.find((e) => e.label === "Type")?.value).toBe(
      "Initial Consultation",
    );
  });

  test("shows current time label for reschedule proposals", () => {
    const entries = formatPayloadEntries({
      appointmentId: "appt-uuid",
      newStartTime: "2026-03-22T10:00:00.000Z",
      timezone: "America/New_York",
      currentStartTime: "2026-03-15T10:00:00.000Z",
    });
    const labels = entries.map((e) => e.label);
    expect(labels).toContain("New Start Time");
    expect(labels).toContain("Current Time");
  });
});
