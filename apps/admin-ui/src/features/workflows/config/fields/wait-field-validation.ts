import { isValidIanaTimeZone, parseTimeOfDayMinutes } from "@scheduling/dto";
import type { EventAttributeSuggestion } from "../event-attribute-suggestions";
import { parseTimestampWithTimezone } from "../../wait-time";
import { extractAttributeReferences } from "./field-helpers";

export function validateWaitUntilValue(
  value: string,
  suggestions: EventAttributeSuggestion[],
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (parseTimestampWithTimezone(trimmed)) {
    return null;
  }

  const datetimeAttributes = new Set(
    suggestions
      .filter((suggestion) => suggestion.isDateTime)
      .map((suggestion) => suggestion.value),
  );
  const references = extractAttributeReferences(trimmed);

  if (references.length === 0) {
    return "Use an ISO timestamp or a datetime attribute reference.";
  }

  const invalidReference = references.find(
    (reference) => !datetimeAttributes.has(reference),
  );

  if (!invalidReference) {
    return null;
  }

  return `"${invalidReference}" is not a datetime attribute.`;
}

export function validateWaitAllowedTimeValue(input: {
  fieldKey: string;
  value: string;
  config: Record<string, unknown>;
}): string | null {
  if (
    input.fieldKey !== "waitAllowedStartTime" &&
    input.fieldKey !== "waitAllowedEndTime"
  ) {
    return null;
  }

  const mode =
    typeof input.config.waitAllowedHoursMode === "string"
      ? input.config.waitAllowedHoursMode
      : "off";
  if (mode !== "daily_window") {
    return null;
  }

  const trimmed = input.value.trim();
  if (trimmed.length === 0) {
    return "Required when daily window mode is enabled.";
  }

  const selfMinutes = parseTimeOfDayMinutes(trimmed);
  if (selfMinutes === null) {
    return "Use HH:MM in 24-hour format.";
  }

  const startRaw =
    input.fieldKey === "waitAllowedStartTime"
      ? trimmed
      : input.config.waitAllowedStartTime;
  const endRaw =
    input.fieldKey === "waitAllowedEndTime"
      ? trimmed
      : input.config.waitAllowedEndTime;
  const startMinutes = parseTimeOfDayMinutes(startRaw);
  const endMinutes = parseTimeOfDayMinutes(endRaw);

  if (
    startMinutes !== null &&
    endMinutes !== null &&
    startMinutes >= endMinutes
  ) {
    return "Window start must be earlier than window end.";
  }

  return null;
}

export function validateWaitTimezoneValue(input: {
  fieldKey: string;
  value: string;
}): string | null {
  if (input.fieldKey !== "waitTimezone") {
    return null;
  }

  const trimmed = input.value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return isValidIanaTimeZone(trimmed)
    ? null
    : "Use a valid IANA timezone, like America/New_York.";
}
