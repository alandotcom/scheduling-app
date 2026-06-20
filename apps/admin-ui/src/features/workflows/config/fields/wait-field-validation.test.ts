import { describe, expect, test } from "bun:test";
import type { EventAttributeSuggestion } from "../event-attribute-suggestions";
import {
  validateWaitAllowedTimeValue,
  validateWaitTimezoneValue,
  validateWaitUntilValue,
} from "./wait-field-validation";

const datetimeSuggestion: EventAttributeSuggestion = {
  value: "Appointment.startAt",
  label: "Start",
  type: "datetime",
  isDateTime: true,
};

describe("validateWaitUntilValue", () => {
  test("accepts an empty value", () => {
    expect(validateWaitUntilValue("", [])).toBeNull();
  });

  test("accepts a datetime attribute reference", () => {
    expect(
      validateWaitUntilValue("@Appointment.startAt", [datetimeSuggestion]),
    ).toBeNull();
  });

  test("rejects a reference that is not a datetime attribute", () => {
    expect(
      validateWaitUntilValue("@Appointment.title", [datetimeSuggestion]),
    ).toContain("not a datetime attribute");
  });

  test("rejects free text with no reference", () => {
    expect(validateWaitUntilValue("tomorrow", [])).toContain("ISO timestamp");
  });
});

describe("validateWaitAllowedTimeValue", () => {
  test("ignores fields that are not allowed-time fields", () => {
    expect(
      validateWaitAllowedTimeValue({
        fieldKey: "waitDuration",
        value: "",
        config: { waitAllowedHoursMode: "daily_window" },
      }),
    ).toBeNull();
  });

  test("ignores allowed-time fields when mode is off", () => {
    expect(
      validateWaitAllowedTimeValue({
        fieldKey: "waitAllowedStartTime",
        value: "",
        config: { waitAllowedHoursMode: "off" },
      }),
    ).toBeNull();
  });

  test("requires a value when the daily window is enabled", () => {
    expect(
      validateWaitAllowedTimeValue({
        fieldKey: "waitAllowedStartTime",
        value: "",
        config: { waitAllowedHoursMode: "daily_window" },
      }),
    ).toContain("Required");
  });

  test("rejects a malformed time", () => {
    expect(
      validateWaitAllowedTimeValue({
        fieldKey: "waitAllowedStartTime",
        value: "9am",
        config: { waitAllowedHoursMode: "daily_window" },
      }),
    ).toContain("HH:MM");
  });

  test("rejects a window whose start is not before its end", () => {
    expect(
      validateWaitAllowedTimeValue({
        fieldKey: "waitAllowedEndTime",
        value: "08:00",
        config: {
          waitAllowedHoursMode: "daily_window",
          waitAllowedStartTime: "10:00",
        },
      }),
    ).toContain("earlier");
  });

  test("accepts a valid window", () => {
    expect(
      validateWaitAllowedTimeValue({
        fieldKey: "waitAllowedEndTime",
        value: "17:00",
        config: {
          waitAllowedHoursMode: "daily_window",
          waitAllowedStartTime: "09:00",
        },
      }),
    ).toBeNull();
  });
});

describe("validateWaitTimezoneValue", () => {
  test("ignores non-timezone fields", () => {
    expect(
      validateWaitTimezoneValue({
        fieldKey: "waitDuration",
        value: "nonsense",
      }),
    ).toBeNull();
  });

  test("accepts an empty timezone", () => {
    expect(
      validateWaitTimezoneValue({ fieldKey: "waitTimezone", value: "" }),
    ).toBeNull();
  });

  test("rejects an invalid IANA timezone", () => {
    expect(
      validateWaitTimezoneValue({
        fieldKey: "waitTimezone",
        value: "Mars/Olympus",
      }),
    ).toContain("IANA");
  });

  test("accepts a valid IANA timezone", () => {
    expect(
      validateWaitTimezoneValue({
        fieldKey: "waitTimezone",
        value: "America/New_York",
      }),
    ).toBeNull();
  });
});
