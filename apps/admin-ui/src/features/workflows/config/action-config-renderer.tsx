import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import type { JourneyTriggerFilterCondition } from "@scheduling/dto";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  VALUELESS_OPERATORS,
  WORKFLOW_FILTER_FIELD_OPTIONS,
  WORKFLOW_FILTER_TEMPORAL_UNIT_OPTIONS,
  type WorkflowFilterValueOption,
  getWorkflowFilterFieldLabel,
  getWorkflowFilterOperatorLabel,
  getWorkflowFilterTemporalUnitLabel,
  getOperatorOptionsForField,
  getWorkflowFilterFieldType,
  isLookupWorkflowFilterField,
  toAbsoluteTemporalComparisonValue,
  toDateTimeLocalInputValue,
  toRelativeTemporalValueDraft,
} from "../filter-builder-shared";

interface ActionConfigRendererProps {
  fields: ActionConfigField[];
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch?: (patch: Record<string, unknown>) => void;
  disabled?: boolean;
  expressionSuggestions?: EventAttributeSuggestion[];
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

export function compileConditionBuilderExpression(input: {
  field: string;
  operator: JourneyTriggerFilterCondition["operator"] | "";
  value: unknown;
  timezone?: string;
}): string {
  if (input.field.length === 0 || input.operator.length === 0) {
    return "";
  }

  if (!isJourneyFilterOperator(input.operator)) {
    return "";
  }

  const left = input.field;
  const isTimestampField =
    getWorkflowFilterFieldType(input.field) === "timestamp";

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

  const stringValue = typeof input.value === "string" ? input.value : "";
  if (stringValue.length === 0) {
    return "";
  }

  if (input.operator === "equals") {
    return `${left} == ${JSON.stringify(stringValue)}`;
  }

  if (input.operator === "not_equals") {
    return `${left} != ${JSON.stringify(stringValue)}`;
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

  useEffect(() => {
    setLocalValue(configValue);
  }, [configValue]);

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <ExpressionInput
        disabled={disabled}
        onChange={(nextValue) => setLocalValue(nextValue)}
        onBlur={() => onUpdateConfig(field.key, localValue)}
        placeholder={field.placeholder}
        suggestions={scopedSuggestions}
        value={localValue}
      />
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

function ConditionExpressionFieldRenderer({
  field,
  config,
  defaultTimezone,
  onUpdateConfig,
  onUpdateConfigBatch,
  disabled,
  suggestions,
  conditionValueOptionsByField,
}: {
  field: ActionConfigFieldBase;
  config: Record<string, unknown>;
  defaultTimezone: string;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch?: (patch: Record<string, unknown>) => void;
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

  const conditionField =
    typeof config["conditionField"] === "string"
      ? config["conditionField"]
      : "";
  const rawOperator =
    typeof config["conditionOperator"] === "string"
      ? config["conditionOperator"]
      : "";
  const conditionOperator = isJourneyFilterOperator(rawOperator)
    ? rawOperator
    : "";
  const conditionValue = config["conditionValue"];
  const conditionTimezone =
    typeof config["conditionTimezone"] === "string" &&
    config["conditionTimezone"].trim().length > 0
      ? config["conditionTimezone"]
      : undefined;
  const isTimestampField =
    getWorkflowFilterFieldType(conditionField) === "timestamp";
  const isLookupField = isLookupWorkflowFilterField(conditionField);
  const relativeTemporalValue = toRelativeTemporalValueDraft(conditionValue);
  const selectedFieldLabel = getWorkflowFilterFieldLabel(conditionField);
  const selectedOperatorLabel = getWorkflowFilterOperatorLabel({
    field: conditionField,
    operator: conditionOperator,
  });
  const isAgoOperator =
    conditionOperator === "less_than_ago" ||
    conditionOperator === "more_than_ago";
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
  const selectedConditionTimezone = conditionTimezone ?? defaultTimezone;
  const stringConditionValue =
    typeof conditionValue === "string" ? conditionValue : "";
  const baseValueOptions = isLookupField
    ? (conditionValueOptionsByField[conditionField] ?? [])
    : [];
  const valueOptions =
    stringConditionValue.length > 0 &&
    !baseValueOptions.some((option) => option.value === stringConditionValue)
      ? [
          { value: stringConditionValue, label: stringConditionValue },
          ...baseValueOptions,
        ]
      : baseValueOptions;
  const selectedValueLabel = valueOptions.find(
    (option) => option.value === stringConditionValue,
  )?.label;
  const timezoneOptions = TIMEZONES.some(
    (timezone) => timezone === selectedConditionTimezone,
  )
    ? TIMEZONES
    : [selectedConditionTimezone, ...TIMEZONES];
  const hasBuilderDraft =
    conditionField.length > 0 ||
    conditionOperator.length > 0 ||
    conditionValue !== undefined;
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

  const commitBuilder = (patch: {
    field?: string;
    operator?: JourneyTriggerFilterCondition["operator"] | "";
    value?: unknown;
    timezone?: string;
  }) => {
    const nextField = patch.field ?? conditionField;
    const nextOperator = patch.operator ?? conditionOperator;
    const nextValue = "value" in patch ? patch.value : conditionValue;
    const nextTimezone =
      "timezone" in patch ? patch.timezone : conditionTimezone;
    const nextIsTimestampField =
      getWorkflowFilterFieldType(nextField) === "timestamp";
    const normalizedTimezone =
      nextIsTimestampField &&
      isJourneyFilterOperator(nextOperator) &&
      isAbsoluteTemporalOperator(nextOperator)
        ? nextTimezone
        : undefined;
    const compiledExpression = compileConditionBuilderExpression({
      field: nextField,
      operator: nextOperator,
      value: nextValue,
      timezone: normalizedTimezone,
    });

    const configPatch: Record<string, unknown> = {
      conditionMode: "builder",
      conditionField: nextField,
      conditionOperator: nextOperator,
      conditionValue: nextValue,
      conditionTimezone: normalizedTimezone,
      [field.key]: compiledExpression,
    };

    if (onUpdateConfigBatch) {
      onUpdateConfigBatch(configPatch);
      return;
    }

    for (const [key, value] of Object.entries(configPatch)) {
      onUpdateConfig(key, value);
    }
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
        <div className="grid min-w-0 grid-cols-1 gap-2 rounded-md border p-2 min-[420px]:grid-cols-2">
          <Select
            disabled={disabled}
            value={conditionField.length > 0 ? conditionField : null}
            onValueChange={(value) => {
              if (typeof value !== "string" || value.length === 0) {
                return;
              }

              commitBuilder({
                field: value,
                operator: "",
                value: undefined,
              });
            }}
          >
            <SelectTrigger aria-label="Condition field" size="sm">
              <SelectValue placeholder="Select property">
                {selectedFieldLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_FILTER_FIELD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            disabled={disabled || conditionField.length === 0}
            value={conditionOperator.length > 0 ? conditionOperator : null}
            onValueChange={(value) => {
              if (
                typeof value !== "string" ||
                !isJourneyFilterOperator(value)
              ) {
                return;
              }

              commitBuilder({
                operator: value,
                value: undefined,
              });
            }}
          >
            <SelectTrigger aria-label="Condition operator" size="sm">
              <SelectValue placeholder="Select operator">
                {selectedOperatorLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {getOperatorOptionsForField(conditionField).map((operator) => (
                <SelectItem key={operator.value} value={operator.value}>
                  {operator.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {conditionOperator.length === 0 ||
          !isJourneyFilterOperator(conditionOperator) ||
          isValuelessOperator(conditionOperator) ? null : isTimestampField &&
            isRelativeTemporalOperator(conditionOperator) ? (
            <div className="grid grid-cols-2 gap-2 min-[420px]:col-span-2">
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
                  commitBuilder({
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
                onValueChange={(value) => {
                  if (
                    value !== "minutes" &&
                    value !== "hours" &&
                    value !== "days" &&
                    value !== "weeks"
                  ) {
                    return;
                  }

                  commitBuilder({
                    value: {
                      ...relativeTemporalValue,
                      unit: value,
                    },
                  });
                }}
              >
                <SelectTrigger
                  aria-label="Condition relative unit"
                  className="h-10"
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
            isAbsoluteTemporalOperator(conditionOperator) ? (
            <>
              <Input
                disabled={disabled}
                placeholder="Select date and time"
                type="datetime-local"
                value={toDateTimeLocalInputValue(conditionValue)}
                onChange={(event) =>
                  commitBuilder({ value: event.target.value })
                }
              />
              <Select
                disabled={disabled}
                value={selectedConditionTimezone}
                onValueChange={(timezone) => {
                  if (!timezone) {
                    return;
                  }

                  commitBuilder({
                    timezone:
                      timezone === defaultTimezone ? undefined : timezone,
                  });
                }}
              >
                <SelectTrigger aria-label="Condition timezone" size="sm">
                  <SelectValue placeholder="Timezone">
                    {formatTimezonePickerLabel(selectedConditionTimezone)}
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
          ) : (
            <>
              {isLookupField ? (
                <Select
                  disabled={disabled}
                  value={
                    stringConditionValue.length > 0
                      ? stringConditionValue
                      : null
                  }
                  onValueChange={(value) => commitBuilder({ value })}
                >
                  <SelectTrigger
                    aria-label="Condition value"
                    className="min-w-0 min-[420px]:col-span-2"
                    size="sm"
                  >
                    <SelectValue placeholder="Select value">
                      {selectedValueLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {valueOptions.length > 0 ? (
                      valueOptions.map((option) => (
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
                  className="min-[420px]:col-span-2"
                  disabled={disabled}
                  placeholder="Enter value..."
                  value={stringConditionValue}
                  onChange={(event) =>
                    commitBuilder({ value: event.target.value })
                  }
                />
              )}
            </>
          )}
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
  disabled,
  expressionSuggestions,
  selectOptionsByKey,
  conditionValueOptionsByField,
  fieldDefaults,
}: {
  group: ActionConfigFieldGroup;
  config: Record<string, unknown>;
  defaultTimezone: string;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch?: (patch: Record<string, unknown>) => void;
  disabled?: boolean;
  expressionSuggestions: EventAttributeSuggestion[];
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
              disabled={disabled}
              expressionSuggestions={expressionSuggestions}
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
  disabled,
  expressionSuggestions,
  selectOptionsByKey,
  conditionValueOptionsByField,
  fieldDefaults,
}: {
  field: ActionConfigField;
  config: Record<string, unknown>;
  defaultTimezone: string;
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateConfigBatch?: (patch: Record<string, unknown>) => void;
  disabled?: boolean;
  expressionSuggestions: EventAttributeSuggestion[];
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
        disabled={disabled}
        expressionSuggestions={expressionSuggestions}
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
            onUpdateConfig={onUpdateConfig}
            onUpdateConfigBatch={onUpdateConfigBatch}
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
  disabled,
  expressionSuggestions = [],
  selectOptionsByKey = {},
  conditionValueOptionsByField = {},
  defaultTimezone = "America/New_York",
}: ActionConfigRendererProps) {
  const fieldDefaults = collectFieldDefaults(fields);

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <FieldRenderer
          key={isFieldGroup(field) ? field.label : field.key}
          field={field}
          config={config}
          defaultTimezone={defaultTimezone}
          onUpdateConfig={onUpdateConfig}
          onUpdateConfigBatch={onUpdateConfigBatch}
          disabled={disabled}
          expressionSuggestions={expressionSuggestions}
          selectOptionsByKey={selectOptionsByKey}
          conditionValueOptionsByField={conditionValueOptionsByField}
          fieldDefaults={fieldDefaults}
        />
      ))}
    </div>
  );
}
