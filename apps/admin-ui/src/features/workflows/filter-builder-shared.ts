import type {
  JourneyTriggerFilterCondition,
  JourneyTriggerFilterTemporalUnit,
} from "@scheduling/dto";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type WorkflowFilterFieldType = "string" | "timestamp" | "boolean";

export type WorkflowFilterFieldOption = {
  label: string;
  value: string;
  type: WorkflowFilterFieldType;
};

export type WorkflowFilterValueOption = {
  value: string;
  label: string;
};

export type CustomAttributeDefinitionForFilter = {
  fieldKey: string;
  label: string;
  type: string;
};

function mapCustomAttributeTypeToFilterType(
  type: string,
): WorkflowFilterFieldType {
  if (type === "DATE" || type === "DATE_TIME") return "timestamp";
  if (type === "BOOLEAN") return "boolean";
  return "string";
}

export function getWorkflowFilterFieldOptions(
  customAttributeDefinitions?: CustomAttributeDefinitionForFilter[],
): WorkflowFilterFieldOption[] {
  if (!customAttributeDefinitions?.length) return WORKFLOW_FILTER_FIELD_OPTIONS;

  const customFields = customAttributeDefinitions.map((def) => ({
    label: def.label,
    value: `client.customAttributes.${def.fieldKey}`,
    type: mapCustomAttributeTypeToFilterType(def.type),
  }));

  return [...WORKFLOW_FILTER_FIELD_OPTIONS, ...customFields];
}

export const CLIENT_WORKFLOW_FILTER_FIELD_OPTIONS: WorkflowFilterFieldOption[] =
  [
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

export function getClientWorkflowFilterFieldOptions(
  customAttributeDefinitions?: CustomAttributeDefinitionForFilter[],
): WorkflowFilterFieldOption[] {
  if (!customAttributeDefinitions?.length)
    return CLIENT_WORKFLOW_FILTER_FIELD_OPTIONS;

  const customFields = customAttributeDefinitions.map((def) => ({
    label: def.label,
    value: `client.customAttributes.${def.fieldKey}`,
    type: mapCustomAttributeTypeToFilterType(def.type),
  }));

  return [...CLIENT_WORKFLOW_FILTER_FIELD_OPTIONS, ...customFields];
}

export const WORKFLOW_FILTER_FIELD_OPTIONS: WorkflowFilterFieldOption[] = [
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

const WORKFLOW_FILTER_LOOKUP_FIELDS = new Set<string>([
  "appointment.calendarId",
  "appointment.appointmentTypeId",
  "appointment.clientId",
  "client.id",
]);

export function isLookupWorkflowFilterField(field: string): boolean {
  return WORKFLOW_FILTER_LOOKUP_FIELDS.has(field);
}

const WORKFLOW_FILTER_ID_FIELDS = new Set<string>([
  "appointment.calendarId",
  "appointment.appointmentTypeId",
  "appointment.clientId",
  "client.id",
]);

export function isIdWorkflowFilterField(field: string): boolean {
  return WORKFLOW_FILTER_ID_FIELDS.has(field);
}

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

export type WorkflowBooleanFilterMode =
  | "is_true"
  | "is_false"
  | "is_set"
  | "is_not_set";

export const WORKFLOW_FILTER_BOOLEAN_MODE_OPTIONS: Array<{
  label: string;
  value: WorkflowBooleanFilterMode;
}> = [
  { label: "is true", value: "is_true" },
  { label: "is false", value: "is_false" },
  { label: "is set", value: "is_set" },
  { label: "is not set", value: "is_not_set" },
];

const WORKFLOW_FILTER_BOOLEAN_FALLBACK_OPERATOR_OPTIONS: Array<{
  label: string;
  value: JourneyTriggerFilterCondition["operator"];
}> = [
  { label: "is set", value: "is_set" },
  { label: "is not set", value: "is_not_set" },
];

export const WORKFLOW_FILTER_ID_OPERATOR_OPTIONS: Array<{
  label: string;
  value: JourneyTriggerFilterCondition["operator"];
}> = [
  { label: "equals", value: "equals" },
  { label: "contains", value: "in" },
];

export const WORKFLOW_FILTER_TIMESTAMP_OPERATOR_OPTIONS: Array<{
  label: string;
  value: JourneyTriggerFilterCondition["operator"];
}> = [
  { label: "is within the next", value: "within_next" },
  { label: "is more than from now", value: "more_than_from_now" },
  { label: "is less than", value: "less_than_ago" },
  { label: "is more than", value: "more_than_ago" },
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
>(["before", "after", "on_or_before", "on_or_after"]);

export function isWorkflowBooleanFilterMode(
  value: string | null,
): value is WorkflowBooleanFilterMode {
  return WORKFLOW_FILTER_BOOLEAN_MODE_OPTIONS.some(
    (option) => option.value === value,
  );
}

export function getWorkflowBooleanFilterMode(input: {
  operator: JourneyTriggerFilterCondition["operator"] | "";
  value: unknown;
}): WorkflowBooleanFilterMode | null {
  if (input.operator === "equals") {
    if (input.value === true || input.value === "true") {
      return "is_true";
    }

    if (input.value === false || input.value === "false") {
      return "is_false";
    }
  }

  if (input.operator === "is_set") {
    return "is_set";
  }

  if (input.operator === "is_not_set") {
    return "is_not_set";
  }

  return null;
}

export function toWorkflowBooleanFilterCondition(
  mode: WorkflowBooleanFilterMode,
): {
  operator: JourneyTriggerFilterCondition["operator"];
  value?: boolean;
} {
  switch (mode) {
    case "is_true":
      return { operator: "equals", value: true };
    case "is_false":
      return { operator: "equals", value: false };
    case "is_set":
      return { operator: "is_set" };
    case "is_not_set":
      return { operator: "is_not_set" };
  }
}

export function getWorkflowBooleanFilterModeLabel(
  mode: WorkflowBooleanFilterMode,
): string {
  const option = WORKFLOW_FILTER_BOOLEAN_MODE_OPTIONS.find(
    (candidate) => candidate.value === mode,
  );

  if (option) {
    return option.label;
  }

  return mode.replaceAll("_", " ");
}

export type RelativeTemporalValueDraft = {
  amount?: number;
  unit?: JourneyTriggerFilterTemporalUnit;
};

export function getWorkflowFilterFieldType(
  field: string,
  fieldOptions: WorkflowFilterFieldOption[] = WORKFLOW_FILTER_FIELD_OPTIONS,
): WorkflowFilterFieldType {
  const option = fieldOptions.find((candidate) => candidate.value === field);
  return option?.type ?? "string";
}

export function getOperatorOptionsForField(
  field: string,
  fieldOptions: WorkflowFilterFieldOption[] = WORKFLOW_FILTER_FIELD_OPTIONS,
): Array<{ label: string; value: JourneyTriggerFilterCondition["operator"] }> {
  const fieldType = getWorkflowFilterFieldType(field, fieldOptions);

  if (fieldType === "timestamp") {
    return WORKFLOW_FILTER_TIMESTAMP_OPERATOR_OPTIONS;
  }

  if (fieldType === "boolean") {
    return WORKFLOW_FILTER_BOOLEAN_FALLBACK_OPERATOR_OPTIONS;
  }

  if (isIdWorkflowFilterField(field)) {
    return WORKFLOW_FILTER_ID_OPERATOR_OPTIONS;
  }

  return WORKFLOW_FILTER_TEXT_OPERATOR_OPTIONS;
}

export function toWorkflowFilterFallbackLabel(value: string): string {
  return value.replaceAll("_", " ");
}

export function getWorkflowFilterFieldLabel(
  value: string,
  fieldOptions: WorkflowFilterFieldOption[] = WORKFLOW_FILTER_FIELD_OPTIONS,
): string | undefined {
  const option = fieldOptions.find((candidate) => candidate.value === value);
  if (option) {
    return option.label;
  }

  if (value.length === 0) {
    return undefined;
  }

  return value;
}

export function getWorkflowFilterOperatorLabel(
  input: {
    field: string;
    operator: JourneyTriggerFilterCondition["operator"] | "";
  },
  fieldOptions: WorkflowFilterFieldOption[] = WORKFLOW_FILTER_FIELD_OPTIONS,
): string | undefined {
  if (input.operator.length === 0) {
    return undefined;
  }

  const option = getOperatorOptionsForField(input.field, fieldOptions).find(
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

function toDateTimeLocalString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function toDateTimeLocalInputValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (DATETIME_LOCAL_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (DATE_ONLY_PATTERN.test(trimmed)) {
    return `${trimmed}T00:00`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return toDateTimeLocalString(parsed);
}

export function toAbsoluteTemporalComparisonValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return trimmed;
}
