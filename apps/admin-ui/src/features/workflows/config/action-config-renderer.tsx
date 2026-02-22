import { useEffect, useMemo, useRef, useState } from "react";
import {
  Add01Icon,
  ArrowDown01Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import {
  isValidIanaTimeZone,
  journeyTriggerFilterAstSchema,
  parseTimeOfDayMinutes,
  type JourneyTriggerFilterAst,
  type JourneyTriggerFilterCondition,
} from "@scheduling/dto";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MultiSelectCombobox,
  type MultiSelectComboboxOption,
} from "@/components/ui/multi-select-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TIMEZONES } from "@/lib/constants";
import { formatTimezonePickerLabel } from "@/lib/date-utils";
import type {
  ActionConfigField,
  ActionConfigFieldBase,
  ActionConfigFieldGroup,
} from "../action-registry";
import { isFieldGroup } from "../action-registry";
import type { EventAttributeSuggestion } from "./event-attribute-suggestions";
import { ExpressionInput } from "./expression-input";
import { parseTimestampWithTimezone } from "../wait-time";
import {
  ABSOLUTE_TEMPORAL_OPERATORS,
  RELATIVE_TEMPORAL_OPERATORS,
  WORKFLOW_FILTER_BOOLEAN_MODE_OPTIONS,
  VALUELESS_OPERATORS,
  WORKFLOW_FILTER_FIELD_OPTIONS,
  WORKFLOW_FILTER_TEMPORAL_UNIT_OPTIONS,
  type WorkflowFilterFieldOption,
  type WorkflowFilterValueOption,
  getWorkflowBooleanFilterMode,
  getWorkflowBooleanFilterModeLabel,
  getWorkflowFilterFieldLabel,
  getWorkflowFilterOperatorLabel,
  getWorkflowFilterTemporalUnitLabel,
  getOperatorOptionsForField,
  getWorkflowFilterFieldType,
  isWorkflowBooleanFilterMode,
  isIdWorkflowFilterField,
  toWorkflowBooleanFilterCondition,
  toAbsoluteTemporalComparisonValue,
  toDateTimeLocalInputValue,
  toRelativeTemporalValueDraft,
  toWorkflowFilterFallbackLabel,
} from "../filter-builder-shared";

interface ActionConfigRendererProps {
  fields: ActionConfigField[];
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch: (patch: Record<string, unknown>) => void;
  configScopeKey: string;
  disabled?: boolean;
  expressionSuggestions?: EventAttributeSuggestion[];
  fieldOptions?: WorkflowFilterFieldOption[];
  selectOptionsByKey?: Record<string, Array<{ value: string; label: string }>>;
  conditionValueOptionsByField?: Record<string, WorkflowFilterValueOption[]>;
  defaultTimezone?: string;
}

type KeyValueRow = {
  id: string;
  key: string;
  value: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createKeyValueRow(input?: {
  key?: string;
  value?: string;
}): KeyValueRow {
  return {
    id: crypto.randomUUID(),
    key: input?.key ?? "",
    value: input?.value ?? "",
  };
}

function collectFieldDefaults(
  fields: ActionConfigField[],
): Record<string, string> {
  const defaults: Record<string, string> = {};

  for (const field of fields) {
    if (isFieldGroup(field)) {
      const nestedDefaults = collectFieldDefaults(field.fields);
      for (const [key, value] of Object.entries(nestedDefaults)) {
        defaults[key] = value;
      }
      continue;
    }

    if (typeof field.defaultValue === "string") {
      defaults[field.key] = field.defaultValue;
    }
  }

  return defaults;
}

function normalizeAttributeReference(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

function formatFallbackSelectLabel(value: string): string {
  const parts = value
    .trim()
    .split(/[_-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return value;
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractAttributeReferences(value: string): string[] {
  const pattern = /@?[A-Z][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+/g;
  return Array.from(value.matchAll(pattern), (match) =>
    normalizeAttributeReference(match[0]),
  );
}

function getExpressionSuggestionsForField(
  fieldKey: string,
  suggestions: EventAttributeSuggestion[],
): EventAttributeSuggestion[] {
  if (fieldKey === "waitUntil") {
    return suggestions.filter((suggestion) => suggestion.isDateTime);
  }

  if (fieldKey === "waitDuration" || fieldKey === "waitOffset") {
    return [];
  }

  if (
    fieldKey === "waitAllowedStartTime" ||
    fieldKey === "waitAllowedEndTime"
  ) {
    return [];
  }

  return suggestions;
}

function validateWaitUntilValue(
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

function validateWaitAllowedTimeValue(input: {
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

function validateWaitTimezoneValue(input: {
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

function isJourneyFilterOperator(
  value: string,
): value is JourneyTriggerFilterCondition["operator"] {
  return (
    value === "equals" ||
    value === "not_equals" ||
    value === "in" ||
    value === "not_in" ||
    value === "contains" ||
    value === "not_contains" ||
    value === "starts_with" ||
    value === "ends_with" ||
    value === "before" ||
    value === "after" ||
    value === "on_or_before" ||
    value === "on_or_after" ||
    value === "within_next" ||
    value === "more_than_from_now" ||
    value === "less_than_ago" ||
    value === "more_than_ago" ||
    value === "is_set" ||
    value === "is_not_set"
  );
}

function isValuelessOperator(
  operator: JourneyTriggerFilterCondition["operator"],
): boolean {
  return VALUELESS_OPERATORS.has(operator);
}

function isRelativeTemporalOperator(
  operator: JourneyTriggerFilterCondition["operator"],
): boolean {
  return RELATIVE_TEMPORAL_OPERATORS.has(operator);
}

function isAbsoluteTemporalOperator(
  operator: JourneyTriggerFilterCondition["operator"],
): boolean {
  return ABSOLUTE_TEMPORAL_OPERATORS.has(operator);
}

function toDurationLiteral(input: { amount: number; unit: string }): string {
  if (input.unit === "minutes") {
    return `${input.amount}m`;
  }

  if (input.unit === "hours") {
    return `${input.amount}h`;
  }

  if (input.unit === "days") {
    return `${input.amount * 24}h`;
  }

  return `${input.amount * 7 * 24}h`;
}

function toPrimitiveListValue(
  value: unknown,
): Array<string | number | boolean> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is string | number | boolean =>
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean",
  );
}

function toStringListValue(value: unknown): string[] {
  return toPrimitiveListValue(value).map((entry) => String(entry));
}

function isPrimitiveLiteralValue(
  value: unknown,
): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function toValueOptionsWithFallback(input: {
  options: WorkflowFilterValueOption[];
  selectedValues: string[];
}): MultiSelectComboboxOption[] {
  const optionMap = new Map(
    input.options.map((option) => [option.value, option]),
  );

  for (const selectedValue of input.selectedValues) {
    if (optionMap.has(selectedValue)) {
      continue;
    }

    optionMap.set(selectedValue, {
      value: selectedValue,
      label: selectedValue,
    });
  }

  return [...optionMap.values()];
}

export function compileConditionBuilderExpression(
  input: {
    field: string;
    operator: JourneyTriggerFilterCondition["operator"] | "";
    value: unknown;
    timezone?: string;
  },
  fieldOptions?: WorkflowFilterFieldOption[],
): string {
  if (input.field.length === 0 || input.operator.length === 0) {
    return "";
  }

  if (!isJourneyFilterOperator(input.operator)) {
    return "";
  }

  const left = input.field;
  const isTimestampField =
    getWorkflowFilterFieldType(input.field, fieldOptions) === "timestamp";

  if (isValuelessOperator(input.operator)) {
    return input.operator === "is_set" ? `${left} != null` : `${left} == null`;
  }

  if (isTimestampField && isRelativeTemporalOperator(input.operator)) {
    const relativeValue = toRelativeTemporalValueDraft(input.value);
    if (
      !relativeValue.amount ||
      !relativeValue.unit ||
      relativeValue.amount <= 0
    ) {
      return "";
    }

    const duration = JSON.stringify(
      toDurationLiteral({
        amount: relativeValue.amount,
        unit: relativeValue.unit,
      }),
    );
    const timestampLeft = `timestamp(string(${left}))`;

    if (input.operator === "within_next") {
      return `${left} != null && ${timestampLeft} > now && ${timestampLeft} < now + duration(${duration})`;
    }

    if (input.operator === "more_than_from_now") {
      return `${left} != null && ${timestampLeft} > now + duration(${duration})`;
    }

    if (input.operator === "less_than_ago") {
      return `${left} != null && ${timestampLeft} > now - duration(${duration})`;
    }

    return `${left} != null && ${timestampLeft} < now - duration(${duration})`;
  }

  if (isTimestampField && isAbsoluteTemporalOperator(input.operator)) {
    const temporalValue = toAbsoluteTemporalComparisonValue(input.value);
    if (!temporalValue) {
      return "";
    }

    const timestampLeft = `timestamp(string(${left}))`;
    const timezoneLiteral =
      typeof input.timezone === "string" && input.timezone.trim().length > 0
        ? JSON.stringify(input.timezone)
        : "orgTimezone";
    const right = `date(${JSON.stringify(temporalValue)}, ${timezoneLiteral})`;

    if (input.operator === "before") {
      return `${left} != null && ${timestampLeft} < ${right}`;
    }

    if (input.operator === "after") {
      return `${left} != null && ${timestampLeft} > ${right}`;
    }

    if (input.operator === "on_or_before") {
      return `${left} != null && ${timestampLeft} <= ${right}`;
    }

    return `${left} != null && ${timestampLeft} >= ${right}`;
  }

  if (input.operator === "in" || input.operator === "not_in") {
    const values = toPrimitiveListValue(input.value);
    if (values.length === 0) {
      return "";
    }

    const right = `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
    if (input.operator === "in") {
      return `${left} in ${right}`;
    }

    return `!(${left} in ${right})`;
  }

  if (input.operator === "equals") {
    if (!isPrimitiveLiteralValue(input.value)) {
      return "";
    }

    if (typeof input.value === "string" && input.value.length === 0) {
      return "";
    }

    return `${left} == ${JSON.stringify(input.value)}`;
  }

  if (input.operator === "not_equals") {
    if (!isPrimitiveLiteralValue(input.value)) {
      return "";
    }

    if (typeof input.value === "string" && input.value.length === 0) {
      return "";
    }

    return `${left} != ${JSON.stringify(input.value)}`;
  }

  const stringValue = typeof input.value === "string" ? input.value : "";
  if (stringValue.length === 0) {
    return "";
  }

  if (input.operator === "contains") {
    return `${left} != null && string(${left}).contains(${JSON.stringify(stringValue)})`;
  }

  if (input.operator === "not_contains") {
    return `${left} == null || !string(${left}).contains(${JSON.stringify(stringValue)})`;
  }

  if (input.operator === "starts_with") {
    return `${left} != null && string(${left}).startsWith(${JSON.stringify(stringValue)})`;
  }

  if (input.operator === "ends_with") {
    return `${left} != null && string(${left}).endsWith(${JSON.stringify(stringValue)})`;
  }

  return "";
}

type LogicOperator = JourneyTriggerFilterAst["logic"];
type ConditionFilterConditionDraft = Omit<
  JourneyTriggerFilterCondition,
  "operator"
> & {
  operator: JourneyTriggerFilterCondition["operator"] | "";
};
type ConditionFilterGroupDraft = {
  logic: LogicOperator;
  not?: boolean;
  conditions: ConditionFilterConditionDraft[];
};
type ConditionFilterDraft = {
  logic: LogicOperator;
  groups: ConditionFilterGroupDraft[];
};
type ConditionFilterDraftState = {
  sourceKey: string;
  draft: ConditionFilterDraft | null;
};

const MAX_CONDITION_FILTER_GROUPS = 4;
const MAX_CONDITION_FILTER_CONDITIONS = 12;
const EMPTY_CONDITION_FILTER_SOURCE_KEY = "__empty_condition_filter_source__";

function createEmptyConditionFilterCondition(): ConditionFilterConditionDraft {
  return {
    field: "",
    operator: "",
    value: undefined,
  };
}

function createDefaultConditionFilter(): ConditionFilterDraft {
  return {
    logic: "and",
    groups: [
      {
        logic: "and",
        conditions: [createEmptyConditionFilterCondition()],
      },
    ],
  };
}

function toConditionFilterSourceKey(
  filter: ConditionFilterDraft | null,
): string {
  return filter ? JSON.stringify(filter) : EMPTY_CONDITION_FILTER_SOURCE_KEY;
}

function toConditionFilterDraft(value: unknown): ConditionFilterDraft | null {
  const parsed = journeyTriggerFilterAstSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

function toConditionFilterSourceState(
  value: unknown,
): ConditionFilterDraftState {
  const draft = toConditionFilterDraft(value);

  return {
    sourceKey: toConditionFilterSourceKey(draft),
    draft,
  };
}

function countConditionFilterConditions(
  filter: ConditionFilterDraft | null,
): number {
  if (!filter) {
    return 0;
  }

  return filter.groups.reduce(
    (total, group) => total + group.conditions.length,
    0,
  );
}

function toConditionStableKey(
  condition: ConditionFilterConditionDraft,
): string {
  const value = JSON.stringify(condition.value);
  return `${condition.field}|${condition.operator}|${value ?? "undefined"}`;
}

function toConditionGroupStableKey(group: ConditionFilterGroupDraft): string {
  return `${group.logic}|${group.conditions
    .map((condition) => toConditionStableKey(condition))
    .join("||")}`;
}

export function compileConditionFilterBuilderExpression(
  filter: ConditionFilterDraft,
  fieldOptions?: WorkflowFilterFieldOption[],
): string {
  if (filter.groups.length === 0) {
    return "";
  }

  const groupExpressions: string[] = [];

  for (const group of filter.groups) {
    if (group.conditions.length === 0) {
      return "";
    }

    const conditionExpressions = group.conditions.map((condition) =>
      compileConditionBuilderExpression(
        {
          field: condition.field,
          operator: condition.operator,
          value: condition.value,
          timezone: condition.timezone,
        },
        fieldOptions,
      ),
    );

    if (conditionExpressions.some((expression) => expression.length === 0)) {
      return "";
    }

    const groupOperator = group.logic === "or" ? " || " : " && ";
    const joinedGroupExpression =
      conditionExpressions.length === 1
        ? conditionExpressions[0]!
        : `(${conditionExpressions.join(groupOperator)})`;
    groupExpressions.push(
      group.not ? `!(${joinedGroupExpression})` : joinedGroupExpression,
    );
  }

  if (groupExpressions.length === 1) {
    return groupExpressions[0]!;
  }

  const rootOperator = filter.logic === "or" ? " || " : " && ";
  return `(${groupExpressions.join(rootOperator)})`;
}

function toKeyValueRows(value: unknown): KeyValueRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows: KeyValueRow[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const key = typeof entry["key"] === "string" ? entry["key"] : "";
    const itemValue = typeof entry["value"] === "string" ? entry["value"] : "";
    rows.push(createKeyValueRow({ key, value: itemValue }));
  }

  return rows;
}

function serializeConfigValueForKey(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "unserializable";
  }
}

function serializeKeyValueRowsForDraft(rows: KeyValueRow[]): Array<{
  key: string;
  value: string;
}> {
  return rows.map((row) => ({
    key: row.key,
    value: row.value,
  }));
}

function TextFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
  suggestions,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  suggestions: EventAttributeSuggestion[];
}) {
  const configValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const [localValue, setLocalValue] = useState(configValue);
  const scopedSuggestions = useMemo(
    () => getExpressionSuggestionsForField(field.key, suggestions),
    [field.key, suggestions],
  );
  const validationError = useMemo(() => {
    const waitAllowedError = validateWaitAllowedTimeValue({
      fieldKey: field.key,
      value: localValue,
      config,
    });
    if (waitAllowedError) {
      return waitAllowedError;
    }

    return validateWaitTimezoneValue({
      fieldKey: field.key,
      value: localValue,
    });
  }, [field.key, localValue, config]);

  useEffect(() => {
    setLocalValue(configValue);
  }, [configValue]);

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <ExpressionInput
        disabled={disabled}
        onChange={(nextValue) => setLocalValue(nextValue)}
        onBlur={() => {
          if (validationError) {
            return;
          }
          onUpdateConfig(field.key, localValue);
        }}
        placeholder={field.placeholder}
        suggestions={scopedSuggestions}
        value={localValue}
      />
      {validationError ? (
        <p className="text-destructive text-xs">{validationError}</p>
      ) : null}
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function TextareaFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
  suggestions,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  suggestions: EventAttributeSuggestion[];
}) {
  const configValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const [localValue, setLocalValue] = useState(configValue);
  const scopedSuggestions = useMemo(
    () => getExpressionSuggestionsForField(field.key, suggestions),
    [field.key, suggestions],
  );

  useEffect(() => {
    setLocalValue(configValue);
  }, [configValue]);

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <ExpressionInput
        disabled={disabled}
        multiline
        onChange={(nextValue) => setLocalValue(nextValue)}
        onBlur={() => onUpdateConfig(field.key, localValue)}
        placeholder={field.placeholder}
        rows={field.rows}
        suggestions={scopedSuggestions}
        value={localValue}
      />
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function NumberFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const configValue =
    config[field.key] != null
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const [localValue, setLocalValue] = useState(configValue);

  useEffect(() => {
    setLocalValue(configValue);
  }, [configValue]);

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <Input
        disabled={disabled}
        min={field.min}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={() => onUpdateConfig(field.key, localValue)}
        placeholder={field.placeholder}
        type="number"
        value={localValue}
      />
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function SelectFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
  selectOptionsByKey,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  selectOptionsByKey: Record<string, Array<{ value: string; label: string }>>;
}) {
  const currentValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");

  const options =
    field.options && field.options.length > 0
      ? field.options
      : (selectOptionsByKey[field.key] ?? []);
  const optionsWithCurrent =
    currentValue.length > 0 &&
    !options.some((option) => option.value === currentValue)
      ? [
          {
            value: currentValue,
            label: formatFallbackSelectLabel(currentValue),
          },
          ...options,
        ]
      : options;
  const selectedOptionLabel = optionsWithCurrent.find(
    (option) => option.value === currentValue,
  )?.label;

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <Select
        disabled={disabled}
        value={currentValue}
        onValueChange={(val) => onUpdateConfig(field.key, val)}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder={field.placeholder ?? "Select..."}>
            {selectedOptionLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {optionsWithCurrent.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function ExpressionFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
  suggestions,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  suggestions: EventAttributeSuggestion[];
}) {
  const configValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const [localValue, setLocalValue] = useState(configValue);
  const scopedSuggestions = useMemo(
    () => getExpressionSuggestionsForField(field.key, suggestions),
    [field.key, suggestions],
  );
  const validationError = useMemo(() => {
    if (field.key !== "waitUntil") {
      return null;
    }

    return validateWaitUntilValue(localValue, suggestions);
  }, [field.key, localValue, suggestions]);

  useEffect(() => {
    setLocalValue(configValue);
  }, [configValue]);

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <ExpressionInput
        disabled={disabled}
        onBlur={() => {
          if (validationError) {
            return;
          }

          onUpdateConfig(field.key, localValue);
        }}
        onChange={(nextValue) => setLocalValue(nextValue)}
        placeholder={field.placeholder}
        suggestions={scopedSuggestions}
        value={localValue}
      />
      {validationError ? (
        <p className="text-destructive text-xs">{validationError}</p>
      ) : null}
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}

interface ConditionLogicConnectorProps {
  ariaLabel: string;
  disabled: boolean;
  onChange: (logic: LogicOperator) => void;
  orientation?: "vertical" | "horizontal";
  value: LogicOperator;
}

function ConditionLogicConnector({
  ariaLabel,
  disabled,
  onChange,
  orientation = "vertical",
  value,
}: ConditionLogicConnectorProps) {
  return (
    <div
      className={cn(
        "flex items-center",
        orientation === "vertical" ? "flex-col gap-1" : "flex-row gap-2",
      )}
    >
      {orientation === "vertical" ? (
        <div className="h-2 w-px bg-border" />
      ) : null}
      <div className="inline-flex items-center rounded-full border border-border bg-background p-0.5">
        <button
          aria-label={`${ariaLabel} AND`}
          className={cn(
            "rounded-full px-2.5 py-0.5 font-medium text-xs transition-colors",
            value === "and"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
          disabled={disabled}
          onClick={() => onChange("and")}
          type="button"
        >
          AND
        </button>
        <button
          aria-label={`${ariaLabel} OR`}
          className={cn(
            "rounded-full px-2.5 py-0.5 font-medium text-xs transition-colors",
            value === "or"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
          disabled={disabled}
          onClick={() => onChange("or")}
          type="button"
        >
          OR
        </button>
      </div>
      {orientation === "vertical" ? (
        <div className="h-2 w-px bg-border" />
      ) : null}
    </div>
  );
}

function getConditionControlAriaLabel(input: {
  groupIndex: number;
  conditionIndex: number;
  legacyLabel: string;
  suffix: string;
}): string {
  if (input.groupIndex === 0 && input.conditionIndex === 0) {
    return input.legacyLabel;
  }

  return `Group ${input.groupIndex + 1} condition ${input.conditionIndex + 1} ${input.suffix}`;
}

interface ConditionFilterConditionRowProps {
  canRemove: boolean;
  condition: ConditionFilterConditionDraft;
  conditionIndex: number;
  defaultTimezone: string;
  disabled: boolean;
  fieldOptions: WorkflowFilterFieldOption[];
  groupIndex: number;
  onChange: (
    groupIndex: number,
    conditionIndex: number,
    patch: Partial<ConditionFilterConditionDraft>,
  ) => void;
  onRemove: (groupIndex: number, conditionIndex: number) => void;
  valueOptionsByField: Record<string, WorkflowFilterValueOption[]>;
}

function ConditionFilterConditionRow({
  canRemove,
  condition,
  conditionIndex,
  defaultTimezone,
  disabled,
  fieldOptions,
  groupIndex,
  onChange,
  onRemove,
  valueOptionsByField,
}: ConditionFilterConditionRowProps) {
  const conditionFieldType = getWorkflowFilterFieldType(
    condition.field,
    fieldOptions,
  );
  const isTimestampField = conditionFieldType === "timestamp";
  const isBooleanField = conditionFieldType === "boolean";
  const isIdField = isIdWorkflowFilterField(condition.field);
  const baseOperatorOptions = getOperatorOptionsForField(
    condition.field,
    fieldOptions,
  );
  const operatorOptions =
    condition.operator.length > 0 &&
    isJourneyFilterOperator(condition.operator) &&
    !baseOperatorOptions.some((option) => option.value === condition.operator)
      ? [
          {
            label: toWorkflowFilterFallbackLabel(condition.operator),
            value: condition.operator,
          },
          ...baseOperatorOptions,
        ]
      : baseOperatorOptions;
  const booleanOperatorMode = getWorkflowBooleanFilterMode({
    operator: condition.operator,
    value: condition.value,
  });
  const parsedConditionOperator = isJourneyFilterOperator(condition.operator)
    ? condition.operator
    : null;
  const relativeTemporalValue = toRelativeTemporalValueDraft(condition.value);
  const selectedFieldLabel = getWorkflowFilterFieldLabel(
    condition.field,
    fieldOptions,
  );
  const selectedOperatorLabel = isBooleanField
    ? booleanOperatorMode
      ? getWorkflowBooleanFilterModeLabel(booleanOperatorMode)
      : condition.operator.length > 0
        ? toWorkflowFilterFallbackLabel(condition.operator)
        : undefined
    : getWorkflowFilterOperatorLabel(
        {
          field: condition.field,
          operator: condition.operator,
        },
        fieldOptions,
      );
  const isAgoOperator =
    condition.operator === "less_than_ago" ||
    condition.operator === "more_than_ago";
  const selectedUnitLabelBase = getWorkflowFilterTemporalUnitLabel(
    relativeTemporalValue.unit,
  );
  const selectedUnitLabel =
    selectedUnitLabelBase && isAgoOperator
      ? `${selectedUnitLabelBase} ago`
      : selectedUnitLabelBase;
  const temporalUnitOptions = WORKFLOW_FILTER_TEMPORAL_UNIT_OPTIONS.map(
    (unit) => ({
      ...unit,
      label: isAgoOperator ? `${unit.label} ago` : unit.label,
    }),
  );
  const selectedTimezone =
    typeof condition.timezone === "string" &&
    condition.timezone.trim().length > 0
      ? condition.timezone
      : defaultTimezone;
  const timezoneOptions = TIMEZONES.some(
    (timezone) => timezone === selectedTimezone,
  )
    ? TIMEZONES
    : [selectedTimezone, ...TIMEZONES];
  const conditionValue =
    typeof condition.value === "string" ||
    typeof condition.value === "number" ||
    typeof condition.value === "boolean"
      ? String(condition.value)
      : "";
  const conditionValues = toStringListValue(condition.value);
  const baseValueOptions = isIdField
    ? (valueOptionsByField[condition.field] ?? [])
    : [];
  const singleValueOptions = toValueOptionsWithFallback({
    options: baseValueOptions,
    selectedValues: conditionValue.length > 0 ? [conditionValue] : [],
  });
  const multiValueOptions = toValueOptionsWithFallback({
    options: baseValueOptions,
    selectedValues: conditionValues,
  });
  const selectedValueLabel = singleValueOptions.find(
    (option) => option.value === conditionValue,
  )?.label;

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="grid min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          <Select
            disabled={disabled}
            value={condition.field.length > 0 ? condition.field : null}
            onValueChange={(field) => {
              if (typeof field !== "string" || field.length === 0) {
                return;
              }

              onChange(groupIndex, conditionIndex, {
                field,
                operator: "",
                value: undefined,
                timezone: undefined,
              });
            }}
          >
            <SelectTrigger
              aria-label={getConditionControlAriaLabel({
                groupIndex,
                conditionIndex,
                legacyLabel: "Condition field",
                suffix: "field",
              })}
              className="h-9 min-w-0 w-full"
              size="sm"
            >
              <SelectValue placeholder="Select property">
                {selectedFieldLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {fieldOptions.map((fieldOption) => (
                <SelectItem key={fieldOption.value} value={fieldOption.value}>
                  {fieldOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isBooleanField ? (
            <Select
              disabled={disabled}
              value={booleanOperatorMode ?? null}
              onValueChange={(mode) => {
                if (!isWorkflowBooleanFilterMode(mode)) {
                  return;
                }

                onChange(groupIndex, conditionIndex, {
                  ...toWorkflowBooleanFilterCondition(mode),
                  timezone: undefined,
                });
              }}
            >
              <SelectTrigger
                aria-label={getConditionControlAriaLabel({
                  groupIndex,
                  conditionIndex,
                  legacyLabel: "Condition operator",
                  suffix: "operator",
                })}
                className="h-9 min-w-0 w-full"
                size="sm"
              >
                <SelectValue placeholder="Select value">
                  {selectedOperatorLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {WORKFLOW_FILTER_BOOLEAN_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select
              disabled={disabled}
              value={condition.operator.length > 0 ? condition.operator : null}
              onValueChange={(operator) => {
                if (
                  typeof operator !== "string" ||
                  !isJourneyFilterOperator(operator)
                ) {
                  return;
                }

                onChange(groupIndex, conditionIndex, {
                  operator,
                  value: undefined,
                  timezone: isAbsoluteTemporalOperator(operator)
                    ? condition.timezone
                    : undefined,
                });
              }}
            >
              <SelectTrigger
                aria-label={getConditionControlAriaLabel({
                  groupIndex,
                  conditionIndex,
                  legacyLabel: "Condition operator",
                  suffix: "operator",
                })}
                className="h-9 min-w-0 w-full"
                size="sm"
              >
                <SelectValue placeholder="Select operator">
                  {selectedOperatorLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {operatorOptions.map((operator) => (
                  <SelectItem key={operator.value} value={operator.value}>
                    {operator.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {isBooleanField ||
          !parsedConditionOperator ||
          isValuelessOperator(
            parsedConditionOperator,
          ) ? null : isTimestampField &&
            isRelativeTemporalOperator(parsedConditionOperator) ? (
            <div className="grid min-w-0 grid-cols-2 gap-2 min-[420px]:col-span-2">
              <Input
                className="h-10 md:h-8"
                disabled={disabled}
                min={1}
                placeholder="Amount"
                type="number"
                value={
                  typeof relativeTemporalValue.amount === "number"
                    ? String(relativeTemporalValue.amount)
                    : ""
                }
                onChange={(event) => {
                  const parsedAmount = Number.parseInt(event.target.value, 10);
                  onChange(groupIndex, conditionIndex, {
                    value: {
                      ...relativeTemporalValue,
                      amount:
                        Number.isInteger(parsedAmount) && parsedAmount > 0
                          ? parsedAmount
                          : undefined,
                    },
                  });
                }}
              />
              <Select
                disabled={disabled}
                value={relativeTemporalValue.unit ?? null}
                onValueChange={(unit) => {
                  if (
                    unit !== "minutes" &&
                    unit !== "hours" &&
                    unit !== "days" &&
                    unit !== "weeks"
                  ) {
                    return;
                  }

                  onChange(groupIndex, conditionIndex, {
                    value: {
                      ...relativeTemporalValue,
                      unit,
                    },
                  });
                }}
              >
                <SelectTrigger
                  aria-label={getConditionControlAriaLabel({
                    groupIndex,
                    conditionIndex,
                    legacyLabel: "Condition relative unit",
                    suffix: "unit",
                  })}
                  className="h-10 min-w-0 w-full"
                  size="sm"
                >
                  <SelectValue placeholder="Unit">
                    {selectedUnitLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {temporalUnitOptions.map((unit) => (
                    <SelectItem key={unit.value} value={unit.value}>
                      {unit.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : isTimestampField &&
            isAbsoluteTemporalOperator(parsedConditionOperator) ? (
            <>
              <Input
                className="h-9"
                disabled={disabled}
                placeholder="Select date and time"
                type="datetime-local"
                value={toDateTimeLocalInputValue(condition.value)}
                onChange={(event) =>
                  onChange(groupIndex, conditionIndex, {
                    value: event.target.value,
                  })
                }
              />
              <Select
                disabled={disabled}
                value={selectedTimezone}
                onValueChange={(timezone) => {
                  if (!timezone) {
                    return;
                  }

                  onChange(groupIndex, conditionIndex, {
                    timezone:
                      timezone === defaultTimezone ? undefined : timezone,
                  });
                }}
              >
                <SelectTrigger
                  aria-label={getConditionControlAriaLabel({
                    groupIndex,
                    conditionIndex,
                    legacyLabel: "Condition timezone",
                    suffix: "timezone",
                  })}
                  className="h-9 min-w-0 w-full"
                  size="sm"
                >
                  <SelectValue placeholder="Timezone">
                    {formatTimezonePickerLabel(selectedTimezone)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map((timezone) => (
                    <SelectItem key={timezone} value={timezone}>
                      {formatTimezonePickerLabel(timezone)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : isIdField && parsedConditionOperator === "in" ? (
            <div className="min-[420px]:col-span-2">
              <MultiSelectCombobox
                ariaLabel={getConditionControlAriaLabel({
                  groupIndex,
                  conditionIndex,
                  legacyLabel: "Condition values",
                  suffix: "values",
                })}
                className="w-full"
                disabled={disabled}
                options={multiValueOptions}
                placeholder="Select one or more values"
                value={conditionValues}
                onChange={(values) =>
                  onChange(groupIndex, conditionIndex, { value: values })
                }
              />
            </div>
          ) : isIdField && parsedConditionOperator === "equals" ? (
            <Select
              disabled={disabled}
              value={conditionValue.length > 0 ? conditionValue : null}
              onValueChange={(value) =>
                onChange(groupIndex, conditionIndex, { value })
              }
            >
              <SelectTrigger
                aria-label={getConditionControlAriaLabel({
                  groupIndex,
                  conditionIndex,
                  legacyLabel: "Condition value",
                  suffix: "value",
                })}
                className="h-9 min-w-0 w-full min-[420px]:col-span-2"
                size="sm"
              >
                <SelectValue placeholder="Select value">
                  {selectedValueLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {singleValueOptions.length > 0 ? (
                  singleValueOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem disabled value="__no_options__">
                    No values available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-9 min-[420px]:col-span-2"
              disabled={disabled}
              placeholder="Enter value..."
              value={conditionValue}
              onChange={(event) =>
                onChange(groupIndex, conditionIndex, {
                  value: event.target.value,
                })
              }
            />
          )}
        </div>
      </div>

      {canRemove ? (
        <Button
          aria-label={`Remove condition ${conditionIndex + 1}`}
          className="h-9 w-9 p-0"
          disabled={disabled}
          onClick={() => onRemove(groupIndex, conditionIndex)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon className="size-4" icon={Delete01Icon} />
        </Button>
      ) : null}
    </div>
  );
}

interface ConditionFilterGroupCardProps {
  defaultTimezone: string;
  disabled: boolean;
  fieldOptions: WorkflowFilterFieldOption[];
  group: ConditionFilterGroupDraft;
  groupIndex: number;
  onAddCondition: (groupIndex: number) => void;
  onConditionChange: (
    groupIndex: number,
    conditionIndex: number,
    patch: Partial<ConditionFilterConditionDraft>,
  ) => void;
  onGroupLogicChange: (groupIndex: number, logic: LogicOperator) => void;
  onRemoveCondition: (groupIndex: number, conditionIndex: number) => void;
  onRemoveGroup: (groupIndex: number) => void;
  valueOptionsByField: Record<string, WorkflowFilterValueOption[]>;
}

function ConditionFilterGroupCard({
  defaultTimezone,
  disabled,
  fieldOptions,
  group,
  groupIndex,
  onAddCondition,
  onConditionChange,
  onGroupLogicChange,
  onRemoveCondition,
  onRemoveGroup,
  valueOptionsByField,
}: ConditionFilterGroupCardProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-muted text-xs font-semibold">
            {groupIndex + 1}
          </div>
          <p className="font-medium text-sm">Condition group</p>
          <p className="text-muted-foreground text-xs">
            {group.conditions.length} condition
            {group.conditions.length === 1 ? "" : "s"}
          </p>
        </div>

        <Button
          aria-label={`Remove group ${groupIndex + 1}`}
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => onRemoveGroup(groupIndex)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon className="size-4" icon={Delete01Icon} />
        </Button>
      </div>

      <div className="space-y-2 p-3">
        {(() => {
          const conditionKeyCounts = new Map<string, number>();
          return group.conditions.map((condition, conditionIndex) => {
            const baseConditionKey = toConditionStableKey(condition);
            const conditionKeyIndex =
              conditionKeyCounts.get(baseConditionKey) ?? 0;
            conditionKeyCounts.set(baseConditionKey, conditionKeyIndex + 1);

            return (
              <div key={`${baseConditionKey}-${conditionKeyIndex}`}>
                <ConditionFilterConditionRow
                  canRemove={group.conditions.length > 1}
                  condition={condition}
                  conditionIndex={conditionIndex}
                  defaultTimezone={defaultTimezone}
                  disabled={disabled}
                  fieldOptions={fieldOptions}
                  groupIndex={groupIndex}
                  onChange={onConditionChange}
                  onRemove={onRemoveCondition}
                  valueOptionsByField={valueOptionsByField}
                />

                {conditionIndex < group.conditions.length - 1 ? (
                  <div className="flex justify-start pl-4 pt-1">
                    <ConditionLogicConnector
                      ariaLabel={`Group ${groupIndex + 1} condition connector`}
                      disabled={disabled}
                      value={group.logic}
                      onChange={(logic) =>
                        onGroupLogicChange(groupIndex, logic)
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          });
        })()}

        <div className="pt-2">
          <Button
            disabled={disabled}
            onClick={() => onAddCondition(groupIndex)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon className="size-4" icon={Add01Icon} />
            Add condition
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConditionExpressionFieldRenderer({
  field,
  config,
  defaultTimezone,
  fieldOptions = WORKFLOW_FILTER_FIELD_OPTIONS,
  onUpdateConfig,
  onUpdateConfigBatch,
  configScopeKey,
  disabled,
  suggestions,
  conditionValueOptionsByField,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  defaultTimezone: string;
  fieldOptions?: WorkflowFilterFieldOption[];
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch: (patch: Record<string, unknown>) => void;
  configScopeKey: string;
  disabled?: boolean;
  suggestions: EventAttributeSuggestion[];
  conditionValueOptionsByField: Record<string, WorkflowFilterValueOption[]>;
}) {
  const configValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const scopedSuggestions = useMemo(
    () => getExpressionSuggestionsForField(field.key, suggestions),
    [field.key, suggestions],
  );
  const [rawValue, setRawValue] = useState(configValue);
  const configConditionFilterState = useMemo(
    () => toConditionFilterSourceState(config["conditionFilter"]),
    [config["conditionFilter"], configScopeKey],
  );
  const [conditionFilterDraftState, setConditionFilterDraftState] =
    useState<ConditionFilterDraftState>(() => configConditionFilterState);
  const [filterValidationError, setFilterValidationError] = useState<
    string | null
  >(null);
  const hasExternalConditionFilterUpdate =
    configConditionFilterState.sourceKey !==
    conditionFilterDraftState.sourceKey;
  const conditionFilterDraft = hasExternalConditionFilterUpdate
    ? configConditionFilterState.draft
    : conditionFilterDraftState.draft;
  const visibleConditionFilter =
    conditionFilterDraft ?? createDefaultConditionFilter();
  const visibleFilterValidationError = hasExternalConditionFilterUpdate
    ? null
    : filterValidationError;
  const hasBuilderDraft = conditionFilterDraft !== null;
  const modeFromConfig = config["conditionMode"];
  const mode =
    modeFromConfig === "raw" || modeFromConfig === "builder"
      ? modeFromConfig
      : hasBuilderDraft ||
          configValue.trim().length === 0 ||
          configValue === "true"
        ? "builder"
        : "raw";

  useEffect(() => {
    setRawValue(configValue);
  }, [configValue]);

  useEffect(() => {
    setConditionFilterDraftState(configConditionFilterState);
    setFilterValidationError(null);
  }, [configConditionFilterState, configScopeKey]);

  const commitConditionFilter = (nextFilter: ConditionFilterDraft | null) => {
    setFilterValidationError(null);
    const parsed = nextFilter
      ? journeyTriggerFilterAstSchema.safeParse(nextFilter)
      : null;
    const nextSourceKey =
      nextFilter === null
        ? EMPTY_CONDITION_FILTER_SOURCE_KEY
        : parsed?.success
          ? toConditionFilterSourceKey(parsed.data)
          : configConditionFilterState.sourceKey;
    setConditionFilterDraftState({
      sourceKey: nextSourceKey,
      draft: nextFilter,
    });

    const configPatch: Record<string, unknown> = {
      conditionMode: "builder",
      conditionField: undefined,
      conditionOperator: undefined,
      conditionValue: undefined,
      conditionTimezone: undefined,
      [field.key]: nextFilter
        ? compileConditionFilterBuilderExpression(nextFilter, fieldOptions)
        : "",
    };

    if (nextFilter === null) {
      configPatch["conditionFilter"] = undefined;
    } else if (parsed?.success) {
      configPatch["conditionFilter"] = parsed.data;
    }

    onUpdateConfigBatch(configPatch);
  };

  const handleAddFilterGroup = () => {
    const editableFilter =
      conditionFilterDraft ?? createDefaultConditionFilter();

    if (editableFilter.groups.length >= MAX_CONDITION_FILTER_GROUPS) {
      setFilterValidationError(
        `You can add at most ${MAX_CONDITION_FILTER_GROUPS} groups.`,
      );
      return;
    }

    commitConditionFilter({
      ...editableFilter,
      groups: [
        ...editableFilter.groups,
        {
          logic: "and",
          conditions: [createEmptyConditionFilterCondition()],
        },
      ],
    });
  };

  const handleRemoveFilterGroup = (groupIndex: number) => {
    const editableFilter =
      conditionFilterDraft ?? createDefaultConditionFilter();
    const nextGroups = editableFilter.groups.filter(
      (_, index) => index !== groupIndex,
    );

    if (nextGroups.length === 0) {
      commitConditionFilter(null);
      return;
    }

    commitConditionFilter({
      ...editableFilter,
      groups: nextGroups,
    });
  };

  const handleGroupLogicChange = (groupIndex: number, logic: LogicOperator) => {
    const editableFilter =
      conditionFilterDraft ?? createDefaultConditionFilter();

    commitConditionFilter({
      ...editableFilter,
      groups: editableFilter.groups.map((group, index) =>
        index === groupIndex ? { ...group, logic } : group,
      ),
    });
  };

  const handleFilterLogicChange = (logic: LogicOperator) => {
    const editableFilter =
      conditionFilterDraft ?? createDefaultConditionFilter();
    commitConditionFilter({
      ...editableFilter,
      logic,
    });
  };

  const handleAddCondition = (groupIndex: number) => {
    const editableFilter =
      conditionFilterDraft ?? createDefaultConditionFilter();

    if (
      countConditionFilterConditions(editableFilter) >=
      MAX_CONDITION_FILTER_CONDITIONS
    ) {
      setFilterValidationError(
        `You can add at most ${MAX_CONDITION_FILTER_CONDITIONS} conditions.`,
      );
      return;
    }

    commitConditionFilter({
      ...editableFilter,
      groups: editableFilter.groups.map((group, index) => {
        if (index !== groupIndex) {
          return group;
        }

        return {
          ...group,
          conditions: [
            ...group.conditions,
            createEmptyConditionFilterCondition(),
          ],
        };
      }),
    });
  };

  const handleRemoveCondition = (
    groupIndex: number,
    conditionIndex: number,
  ) => {
    const editableFilter =
      conditionFilterDraft ?? createDefaultConditionFilter();

    const nextGroups = editableFilter.groups
      .map((group, index) => {
        if (index !== groupIndex) {
          return group;
        }

        return {
          ...group,
          conditions: group.conditions.filter(
            (_, nestedIndex) => nestedIndex !== conditionIndex,
          ),
        };
      })
      .filter((group) => group.conditions.length > 0);

    if (nextGroups.length === 0) {
      commitConditionFilter(null);
      return;
    }

    commitConditionFilter({
      ...editableFilter,
      groups: nextGroups,
    });
  };

  const handleConditionChange = (
    groupIndex: number,
    conditionIndex: number,
    patch: Partial<ConditionFilterConditionDraft>,
  ) => {
    const editableFilter =
      conditionFilterDraft ?? createDefaultConditionFilter();

    commitConditionFilter({
      ...editableFilter,
      groups: editableFilter.groups.map((group, index) => {
        if (index !== groupIndex) {
          return group;
        }

        return {
          ...group,
          conditions: group.conditions.map((condition, nestedIndex) =>
            nestedIndex === conditionIndex
              ? {
                  ...condition,
                  ...patch,
                }
              : condition,
          ),
        };
      }),
    });
  };

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <div className="inline-flex items-center rounded-full border border-border bg-background p-0.5">
        <button
          className={cn(
            "rounded-full px-2.5 py-0.5 font-medium text-xs transition-colors",
            mode === "builder"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
          disabled={disabled}
          onClick={() => onUpdateConfig("conditionMode", "builder")}
          type="button"
        >
          Builder
        </button>
        <button
          className={cn(
            "rounded-full px-2.5 py-0.5 font-medium text-xs transition-colors",
            mode === "raw"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
          disabled={disabled}
          onClick={() => onUpdateConfig("conditionMode", "raw")}
          type="button"
        >
          Raw CEL
        </button>
      </div>

      {mode === "builder" ? (
        <div className="space-y-3 rounded-md border p-2">
          {visibleFilterValidationError ? (
            <p className="text-destructive text-xs">
              {visibleFilterValidationError}
            </p>
          ) : null}

          {(() => {
            const groupKeyCounts = new Map<string, number>();
            return visibleConditionFilter.groups.map((group, groupIndex) => {
              const baseGroupKey = toConditionGroupStableKey(group);
              const groupKeyIndex = groupKeyCounts.get(baseGroupKey) ?? 0;
              groupKeyCounts.set(baseGroupKey, groupKeyIndex + 1);

              return (
                <div key={`${baseGroupKey}-${groupKeyIndex}`}>
                  <ConditionFilterGroupCard
                    defaultTimezone={defaultTimezone}
                    disabled={!!disabled}
                    fieldOptions={fieldOptions}
                    group={group}
                    groupIndex={groupIndex}
                    onAddCondition={handleAddCondition}
                    onConditionChange={handleConditionChange}
                    onGroupLogicChange={handleGroupLogicChange}
                    onRemoveCondition={handleRemoveCondition}
                    onRemoveGroup={handleRemoveFilterGroup}
                    valueOptionsByField={conditionValueOptionsByField}
                  />

                  {groupIndex < visibleConditionFilter.groups.length - 1 ? (
                    <div className="flex justify-center py-1">
                      <ConditionLogicConnector
                        ariaLabel="Condition group connector"
                        disabled={!!disabled}
                        value={visibleConditionFilter.logic}
                        onChange={handleFilterLogicChange}
                      />
                    </div>
                  ) : null}
                </div>
              );
            });
          })()}

          <div className="flex justify-center">
            <Button
              className="border-dashed"
              disabled={disabled}
              onClick={handleAddFilterGroup}
              size="sm"
              type="button"
              variant="outline"
            >
              <Icon className="size-4" icon={Add01Icon} />
              Add group
            </Button>
          </div>
        </div>
      ) : (
        <ExpressionInput
          disabled={disabled}
          onBlur={() => onUpdateConfig(field.key, rawValue)}
          onChange={(nextValue) => setRawValue(nextValue)}
          placeholder={field.placeholder}
          suggestions={scopedSuggestions}
          value={rawValue}
        />
      )}

      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function KeyValueListFieldRenderer({
  field,
  config,
  onUpdateConfig,
  disabled,
  suggestions,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  disabled?: boolean;
  suggestions: EventAttributeSuggestion[];
}) {
  const configValue = config[field.key];
  const [rows, setRows] = useState<KeyValueRow[]>(() =>
    toKeyValueRows(configValue),
  );
  const rowsRef = useRef(rows);

  const commitRows = (nextRows: KeyValueRow[]) => {
    onUpdateConfig(field.key, serializeKeyValueRowsForDraft(nextRows));
  };

  const commitCurrentRows = () => {
    commitRows(rowsRef.current);
  };

  const commitRowPatch = (
    rowId: string,
    patch: Partial<Pick<KeyValueRow, "key" | "value">>,
  ) => {
    const nextRows = rowsRef.current.map((row) =>
      row.id === rowId ? { ...row, ...patch } : row,
    );
    rowsRef.current = nextRows;
    setRows(nextRows);
    commitRows(nextRows);
  };

  const updateRow = (
    rowId: string,
    patch: Partial<Pick<KeyValueRow, "key" | "value">>,
  ) => {
    const nextRows = rowsRef.current.map((row) =>
      row.id === rowId ? { ...row, ...patch } : row,
    );
    rowsRef.current = nextRows;
    setRows(nextRows);
  };

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <Input
                disabled={disabled}
                onBlur={(event) =>
                  commitRowPatch(row.id, { key: event.target.value })
                }
                onChange={(event) =>
                  updateRow(row.id, { key: event.target.value })
                }
                placeholder={field.keyPlaceholder ?? "Key"}
                type="text"
                value={row.key}
              />
            </div>
            <div className="min-w-0">
              <ExpressionInput
                disabled={disabled}
                onBlur={commitCurrentRows}
                onChange={(nextValue) =>
                  updateRow(row.id, { value: nextValue })
                }
                placeholder={field.valuePlaceholder ?? "Value"}
                suggestions={suggestions}
                value={row.value}
              />
            </div>
            <Button
              aria-label="Remove variable"
              className="lg:justify-self-end"
              disabled={disabled}
              onClick={() => {
                const nextRows = rowsRef.current.filter(
                  (candidate) => candidate.id !== row.id,
                );
                rowsRef.current = nextRows;
                setRows(nextRows);
                commitRows(nextRows);
              }}
              size="icon-sm"
              type="button"
              variant="destructive"
            >
              <Icon className="size-4" icon={Delete01Icon} />
            </Button>
          </div>
        ))}
        <Button
          disabled={disabled}
          onClick={() => {
            const nextRows = [...rowsRef.current, createKeyValueRow()];
            rowsRef.current = nextRows;
            setRows(nextRows);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {field.addButtonLabel ?? "Add row"}
        </Button>
      </div>
      {field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function GroupFieldRenderer({
  group,
  config,
  defaultTimezone,
  onUpdateConfig,
  onUpdateConfigBatch,
  configScopeKey,
  disabled,
  expressionSuggestions,
  fieldOptions,
  selectOptionsByKey,
  conditionValueOptionsByField,
  fieldDefaults,
}: {
  group: ActionConfigFieldGroup;
  config: Record<string, unknown>;
  defaultTimezone: string;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch: (patch: Record<string, unknown>) => void;
  configScopeKey: string;
  disabled?: boolean;
  expressionSuggestions: EventAttributeSuggestion[];
  fieldOptions?: WorkflowFilterFieldOption[];
  selectOptionsByKey: Record<string, Array<{ value: string; label: string }>>;
  conditionValueOptionsByField: Record<string, WorkflowFilterValueOption[]>;
  fieldDefaults: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(group.defaultExpanded ?? true);

  return (
    <div className="space-y-2">
      <button
        className="flex w-full items-center gap-1.5 text-sm font-medium"
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        <Icon
          icon={ArrowDown01Icon}
          className={cn(
            "size-4 transition-transform duration-150",
            !expanded && "-rotate-90",
          )}
        />
        {group.label}
      </button>
      {expanded ? (
        <div className="space-y-3 pl-1">
          {group.fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              config={config}
              defaultTimezone={defaultTimezone}
              onUpdateConfig={onUpdateConfig}
              onUpdateConfigBatch={onUpdateConfigBatch}
              configScopeKey={configScopeKey}
              disabled={disabled}
              expressionSuggestions={expressionSuggestions}
              fieldOptions={fieldOptions}
              selectOptionsByKey={selectOptionsByKey}
              conditionValueOptionsByField={conditionValueOptionsByField}
              fieldDefaults={fieldDefaults}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FieldRenderer({
  field,
  config,
  defaultTimezone,
  onUpdateConfig,
  onUpdateConfigBatch,
  configScopeKey,
  disabled,
  expressionSuggestions,
  fieldOptions,
  selectOptionsByKey,
  conditionValueOptionsByField,
  fieldDefaults,
}: {
  field: ActionConfigField;
  config: Record<string, unknown>;
  defaultTimezone: string;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch: (patch: Record<string, unknown>) => void;
  configScopeKey: string;
  disabled?: boolean;
  expressionSuggestions: EventAttributeSuggestion[];
  fieldOptions?: WorkflowFilterFieldOption[];
  selectOptionsByKey: Record<string, Array<{ value: string; label: string }>>;
  conditionValueOptionsByField: Record<string, WorkflowFilterValueOption[]>;
  fieldDefaults: Record<string, string>;
}) {
  if (isFieldGroup(field)) {
    return (
      <GroupFieldRenderer
        group={field}
        config={config}
        defaultTimezone={defaultTimezone}
        onUpdateConfig={onUpdateConfig}
        onUpdateConfigBatch={onUpdateConfigBatch}
        configScopeKey={configScopeKey}
        disabled={disabled}
        expressionSuggestions={expressionSuggestions}
        fieldOptions={fieldOptions}
        selectOptionsByKey={selectOptionsByKey}
        conditionValueOptionsByField={conditionValueOptionsByField}
        fieldDefaults={fieldDefaults}
      />
    );
  }

  // Check showWhen condition
  if (field.showWhen) {
    const raw = config[field.showWhen.field];
    const val =
      typeof raw === "string"
        ? raw
        : (fieldDefaults[field.showWhen.field] ?? "");
    if (val !== field.showWhen.equals) return null;
  }

  switch (field.type) {
    case "text":
      return (
        <TextFieldRenderer
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
          suggestions={expressionSuggestions}
        />
      );
    case "textarea":
      return (
        <TextareaFieldRenderer
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
          suggestions={expressionSuggestions}
        />
      );
    case "number":
      return (
        <NumberFieldRenderer
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
        />
      );
    case "select":
      return (
        <SelectFieldRenderer
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
          selectOptionsByKey={selectOptionsByKey}
        />
      );
    case "expression":
      if (
        field.key === "expression" &&
        typeof config.actionType === "string" &&
        config.actionType === "condition"
      ) {
        return (
          <ConditionExpressionFieldRenderer
            field={field}
            config={config}
            defaultTimezone={defaultTimezone}
            fieldOptions={fieldOptions}
            onUpdateConfig={onUpdateConfig}
            onUpdateConfigBatch={onUpdateConfigBatch}
            configScopeKey={configScopeKey}
            disabled={disabled}
            suggestions={expressionSuggestions}
            conditionValueOptionsByField={conditionValueOptionsByField}
          />
        );
      }

      return (
        <ExpressionFieldRenderer
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
          suggestions={expressionSuggestions}
        />
      );
    case "key_value_list": {
      const keyValueListKey = `${field.key}:${serializeConfigValueForKey(
        config[field.key],
      )}`;
      return (
        <KeyValueListFieldRenderer
          key={keyValueListKey}
          field={field}
          config={config}
          onUpdateConfig={onUpdateConfig}
          disabled={disabled}
          suggestions={expressionSuggestions}
        />
      );
    }
  }
}

export function ActionConfigRenderer({
  fields,
  config,
  onUpdateConfig,
  onUpdateConfigBatch,
  configScopeKey,
  disabled,
  expressionSuggestions = [],
  fieldOptions,
  selectOptionsByKey = {},
  conditionValueOptionsByField = {},
  defaultTimezone = "America/New_York",
}: ActionConfigRendererProps) {
  const fieldDefaults = collectFieldDefaults(fields);

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <FieldRenderer
          key={`${configScopeKey}:${isFieldGroup(field) ? field.label : field.key}`}
          field={field}
          config={config}
          defaultTimezone={defaultTimezone}
          onUpdateConfig={onUpdateConfig}
          onUpdateConfigBatch={onUpdateConfigBatch}
          configScopeKey={configScopeKey}
          disabled={disabled}
          expressionSuggestions={expressionSuggestions}
          fieldOptions={fieldOptions}
          selectOptionsByKey={selectOptionsByKey}
          conditionValueOptionsByField={conditionValueOptionsByField}
          fieldDefaults={fieldDefaults}
        />
      ))}
    </div>
  );
}
