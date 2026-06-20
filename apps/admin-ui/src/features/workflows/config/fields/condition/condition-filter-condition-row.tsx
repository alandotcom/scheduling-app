import { Delete01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
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
import { TIMEZONES } from "@/lib/constants";
import { formatTimezonePickerLabel } from "@/lib/date-utils";
import {
  WORKFLOW_FILTER_BOOLEAN_MODE_OPTIONS,
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
  toDateTimeLocalInputValue,
  toRelativeTemporalValueDraft,
  toWorkflowFilterFallbackLabel,
} from "../../../filter-builder-shared";
import {
  isAbsoluteTemporalOperator,
  isJourneyFilterOperator,
  isRelativeTemporalOperator,
  isValuelessOperator,
  toPrimitiveListValue,
} from "./compile-condition-expression";
import type { ConditionFilterConditionDraft } from "./condition-types";

function toStringListValue(value: unknown): string[] {
  return toPrimitiveListValue(value).map((entry) => String(entry));
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

export function ConditionFilterConditionRow({
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
