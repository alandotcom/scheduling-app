import type {
  JourneyTriggerFilterCondition,
  JourneyTriggerFilterTemporalUnit,
} from "@scheduling/dto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type WorkflowFilterFieldType = "string" | "timestamp";

export type WorkflowFilterFieldOption = {
  label: string;
  value: string;
  type: WorkflowFilterFieldType;
};

export const WORKFLOW_FILTER_FIELD_OPTIONS: WorkflowFilterFieldOption[] = [
  {
    label: "Appointment ID",
    value: "appointment.appointmentId",
    type: "string",
  },
  {
    label: "Calendar ID",
    value: "appointment.calendarId",
    type: "string",
  },
  {
    label: "Appointment Type ID",
    value: "appointment.appointmentTypeId",
    type: "string",
  },
  {
    label: "Client ID",
    value: "appointment.clientId",
    type: "string",
  },
  {
    label: "Start Time",
    value: "appointment.startAt",
    type: "timestamp",
  },
  {
    label: "End Time",
    value: "appointment.endAt",
    type: "timestamp",
  },
  {
    label: "Timezone",
    value: "appointment.timezone",
    type: "string",
  },
  {
    label: "Appointment Status",
    value: "appointment.status",
    type: "string",
  },
  {
    label: "Notes",
    value: "appointment.notes",
    type: "string",
  },
  {
    label: "Client Record ID",
    value: "client.id",
    type: "string",
  },
  {
    label: "Client First Name",
    value: "client.firstName",
    type: "string",
  },
  {
    label: "Client Last Name",
    value: "client.lastName",
    type: "string",
  },
  {
    label: "Client Email",
    value: "client.email",
    type: "string",
  },
  {
    label: "Client Phone",
    value: "client.phone",
    type: "string",
  },
];

export const WORKFLOW_FILTER_TEMPORAL_UNIT_OPTIONS: Array<{
  label: string;
  value: JourneyTriggerFilterTemporalUnit;
}> = [
  { label: "minutes", value: "minutes" },
  { label: "hours", value: "hours" },
  { label: "days", value: "days" },
  { label: "weeks", value: "weeks" },
];

export const WORKFLOW_FILTER_TEXT_OPERATOR_OPTIONS: Array<{
  label: string;
  value: JourneyTriggerFilterCondition["operator"];
}> = [
  { label: "equals", value: "equals" },
  { label: "does not equal", value: "not_equals" },
  { label: "contains", value: "contains" },
  { label: "does not contain", value: "not_contains" },
  { label: "starts with", value: "starts_with" },
  { label: "ends with", value: "ends_with" },
  { label: "is set", value: "is_set" },
  { label: "is not set", value: "is_not_set" },
];

export const WORKFLOW_FILTER_TIMESTAMP_OPERATOR_OPTIONS: Array<{
  label: string;
  value: JourneyTriggerFilterCondition["operator"];
}> = [
  { label: "is within the next", value: "within_next" },
  { label: "is more than from now", value: "more_than_from_now" },
  { label: "is less than ago", value: "less_than_ago" },
  { label: "is more than ago", value: "more_than_ago" },
  { label: "is before", value: "before" },
  { label: "is after", value: "after" },
  { label: "is set", value: "is_set" },
  { label: "is not set", value: "is_not_set" },
];

export const VALUELESS_OPERATORS = new Set<
  JourneyTriggerFilterCondition["operator"]
>(["is_set", "is_not_set"]);

export const RELATIVE_TEMPORAL_OPERATORS = new Set<
  JourneyTriggerFilterCondition["operator"]
>(["within_next", "more_than_from_now", "less_than_ago", "more_than_ago"]);

export const ABSOLUTE_TEMPORAL_OPERATORS = new Set<
  JourneyTriggerFilterCondition["operator"]
>(["before", "after"]);

export type RelativeTemporalValueDraft = {
  amount?: number;
  unit?: JourneyTriggerFilterTemporalUnit;
};

export function getWorkflowFilterFieldType(
  field: string,
): WorkflowFilterFieldType {
  const option = WORKFLOW_FILTER_FIELD_OPTIONS.find(
    (candidate) => candidate.value === field,
  );
  return option?.type ?? "string";
}

export function getOperatorOptionsForField(
  field: string,
): Array<{ label: string; value: JourneyTriggerFilterCondition["operator"] }> {
  return getWorkflowFilterFieldType(field) === "timestamp"
    ? WORKFLOW_FILTER_TIMESTAMP_OPERATOR_OPTIONS
    : WORKFLOW_FILTER_TEXT_OPERATOR_OPTIONS;
}

export function toWorkflowFilterFallbackLabel(value: string): string {
  return value.replaceAll("_", " ");
}

export function getWorkflowFilterFieldLabel(value: string): string | undefined {
  const option = WORKFLOW_FILTER_FIELD_OPTIONS.find(
    (candidate) => candidate.value === value,
  );
  if (option) {
    return option.label;
  }

  if (value.length === 0) {
    return undefined;
  }

  return value;
}

export function getWorkflowFilterOperatorLabel(input: {
  field: string;
  operator: JourneyTriggerFilterCondition["operator"] | "";
}): string | undefined {
  if (input.operator.length === 0) {
    return undefined;
  }

  const option = getOperatorOptionsForField(input.field).find(
    (candidate) => candidate.value === input.operator,
  );
  if (option) {
    return option.label;
  }

  return toWorkflowFilterFallbackLabel(input.operator);
}

export function getWorkflowFilterTemporalUnitLabel(
  value: JourneyTriggerFilterTemporalUnit | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const option = WORKFLOW_FILTER_TEMPORAL_UNIT_OPTIONS.find(
    (candidate) => candidate.value === value,
  );
  if (option) {
    return option.label;
  }

  return value;
}

export function toRelativeTemporalValueDraft(
  value: unknown,
): RelativeTemporalValueDraft {
  if (!isRecord(value)) {
    return {};
  }

  const amount = value["amount"];
  const unit = value["unit"];

  return {
    amount:
      typeof amount === "number" && Number.isInteger(amount)
        ? amount
        : undefined,
    unit:
      unit === "minutes" ||
      unit === "hours" ||
      unit === "days" ||
      unit === "weeks"
        ? unit
        : undefined,
  };
}

export function toDateInputValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}
