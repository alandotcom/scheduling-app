import { useEffect, useMemo, useState } from "react";
import {
  Add01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowRight02Icon,
  Delete01Icon,
  FilterIcon,
  UserGroup02Icon,
} from "@hugeicons/core-free-icons";
import {
  journeyTriggerFilterAstSchema,
  journeyTriggerFilterOperatorSchema,
  type JourneyTriggerFilterAst,
  type JourneyTriggerFilterCondition,
} from "@scheduling/dto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
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
import { cn } from "@/lib/utils";
import {
  ABSOLUTE_TEMPORAL_OPERATORS,
  RELATIVE_TEMPORAL_OPERATORS,
  CLIENT_WORKFLOW_FILTER_FIELD_OPTIONS,
  VALUELESS_OPERATORS,
  WORKFLOW_FILTER_FIELD_OPTIONS,
  WORKFLOW_FILTER_TEMPORAL_UNIT_OPTIONS,
  type WorkflowFilterFieldOption,
  type WorkflowFilterValueOption,
  getWorkflowFilterFieldLabel,
  getWorkflowFilterOperatorLabel,
  getWorkflowFilterTemporalUnitLabel,
  getOperatorOptionsForField,
  isIdWorkflowFilterField,
  getWorkflowFilterFieldType,
  isLookupWorkflowFilterField,
  toDateTimeLocalInputValue,
  toWorkflowFilterFallbackLabel,
  toRelativeTemporalValueDraft,
  type CustomAttributeDefinitionForFilter,
} from "./filter-builder-shared";

type AppointmentTriggerConfigShape = {
  triggerType?: "AppointmentJourney";
  start?: "appointment.scheduled";
  restart?: "appointment.rescheduled";
  stop?: "appointment.canceled";
  correlationKey?: "appointmentId";
  filter?: JourneyTriggerFilterAst;
};

type ClientTriggerConfigShape = {
  triggerType?: "ClientJourney";
  event?: "client.created" | "client.updated";
  correlationKey?: "clientId";
  trackedAttributeKey?: string;
  filter?: JourneyTriggerFilterAst;
};

type TriggerConfigShape =
  | AppointmentTriggerConfigShape
  | ClientTriggerConfigShape;

type TrackedClientAttributeOption = {
  value: string;
  label: string;
  source: "builtin" | "custom";
};

function toTrackedClientAttributeOptions(
  customAttributeDefinitions: CustomAttributeDefinitionForFilter[],
): TrackedClientAttributeOption[] {
  const options: TrackedClientAttributeOption[] = [];
  const seen = new Set<string>();

  for (const option of CLIENT_WORKFLOW_FILTER_FIELD_OPTIONS) {
    if (seen.has(option.value)) {
      continue;
    }
    seen.add(option.value);
    options.push({
      value: option.value,
      label: option.label,
      source: "builtin",
    });
  }

  for (const definition of customAttributeDefinitions) {
    if (seen.has(definition.fieldKey)) {
      continue;
    }
    seen.add(definition.fieldKey);
    options.push({
      value: definition.fieldKey,
      label: definition.label,
      source: "custom",
    });
  }

  return options;
}

const MAX_FILTER_GROUPS = 4;
const MAX_FILTER_CONDITIONS = 12;
const FILTER_OPERATORS = journeyTriggerFilterOperatorSchema.options;

type LogicOperator = JourneyTriggerFilterAst["logic"];
type JourneyTriggerFilterConditionDraft = Omit<
  JourneyTriggerFilterCondition,
  "operator"
> & {
  operator: JourneyTriggerFilterCondition["operator"] | "";
};
type JourneyTriggerFilterAstDraft = {
  logic: LogicOperator;
  groups: Array<{
    logic: LogicOperator;
    conditions: JourneyTriggerFilterConditionDraft[];
  }>;
};
type FilterGroup = JourneyTriggerFilterAstDraft["groups"][number];

function toFilterDraft(value: unknown): JourneyTriggerFilterAstDraft | null {
  const parsed = journeyTriggerFilterAstSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

function countFilterConditions(
  filter: {
    groups: Array<{ conditions: unknown[] }>;
  } | null,
): number {
  if (!filter) {
    return 0;
  }

  return filter.groups.reduce(
    (total, group) => total + group.conditions.length,
    0,
  );
}

function createEmptyCondition(): JourneyTriggerFilterConditionDraft {
  return {
    field: "",
    operator: "",
    value: undefined,
  };
}

function createDefaultFilter(): JourneyTriggerFilterAstDraft {
  return {
    logic: "and",
    groups: [
      {
        logic: "and",
        conditions: [createEmptyCondition()],
      },
    ],
  };
}

function isValueLessOperator(operator: string): boolean {
  return isJourneyFilterOperator(operator) && VALUELESS_OPERATORS.has(operator);
}

function isRelativeTemporalOperator(operator: string): boolean {
  return (
    isJourneyFilterOperator(operator) &&
    RELATIVE_TEMPORAL_OPERATORS.has(operator)
  );
}

function isAbsoluteTemporalOperator(operator: string): boolean {
  return (
    isJourneyFilterOperator(operator) &&
    ABSOLUTE_TEMPORAL_OPERATORS.has(operator)
  );
}

function isJourneyFilterOperator(
  value: string | null,
): value is JourneyTriggerFilterCondition["operator"] {
  return (
    typeof value === "string" &&
    FILTER_OPERATORS.some((operator) => operator === value)
  );
}

function toConditionValue(
  condition: JourneyTriggerFilterConditionDraft,
): string {
  if (
    typeof condition.value === "string" ||
    typeof condition.value === "number" ||
    typeof condition.value === "boolean"
  ) {
    return String(condition.value);
  }

  return "";
}

function toConditionValues(
  condition: JourneyTriggerFilterConditionDraft,
): string[] {
  if (!Array.isArray(condition.value)) {
    return [];
  }

  return condition.value
    .filter(
      (entry) =>
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean",
    )
    .map((entry) => String(entry));
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

interface LogicConnectorProps {
  ariaLabel: string;
  disabled: boolean;
  onChange: (logic: LogicOperator) => void;
  orientation?: "vertical" | "horizontal";
  value: LogicOperator;
}

function LogicConnector({
  ariaLabel,
  disabled,
  onChange,
  orientation = "vertical",
  value,
}: LogicConnectorProps) {
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

interface ConditionRowProps {
  canRemove: boolean;
  condition: JourneyTriggerFilterConditionDraft;
  conditionIndex: number;
  defaultTimezone: string;
  disabled: boolean;
  fieldOptions: WorkflowFilterFieldOption[];
  groupIndex: number;
  onChange: (
    groupIndex: number,
    conditionIndex: number,
    patch: Partial<JourneyTriggerFilterConditionDraft>,
  ) => void;
  onRemove: (groupIndex: number, conditionIndex: number) => void;
  valueOptionsByField: Record<string, WorkflowFilterValueOption[]>;
}

function ConditionRow({
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
}: ConditionRowProps) {
  const isTimestampField =
    getWorkflowFilterFieldType(condition.field, fieldOptions) === "timestamp";
  const isIdField = isIdWorkflowFilterField(condition.field);
  const isLookupField = isLookupWorkflowFilterField(condition.field);
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
  const relativeTemporalValue = toRelativeTemporalValueDraft(condition.value);
  const selectedFieldLabel = getWorkflowFilterFieldLabel(
    condition.field,
    fieldOptions,
  );
  const selectedOperatorLabel = getWorkflowFilterOperatorLabel(
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
  const conditionValue = toConditionValue(condition);
  const conditionValues = toConditionValues(condition);
  const baseValueOptions = isLookupField
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
              aria-label={`Group ${groupIndex + 1} condition ${conditionIndex + 1} field`}
              className="h-9 min-w-0 w-full"
              size="sm"
            >
              <SelectValue placeholder="Select property">
                {selectedFieldLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {fieldOptions.map((field) => (
                <SelectItem key={field.value} value={field.value}>
                  {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            disabled={disabled}
            value={condition.operator.length > 0 ? condition.operator : null}
            onValueChange={(operator) => {
              if (!isJourneyFilterOperator(operator)) {
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
              aria-label={`Group ${groupIndex + 1} condition ${conditionIndex + 1} operator`}
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

          {condition.operator.length === 0 ||
          isValueLessOperator(condition.operator) ? null : isTimestampField &&
            isRelativeTemporalOperator(condition.operator) ? (
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
                  aria-label={`Group ${groupIndex + 1} condition ${conditionIndex + 1} unit`}
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
            isAbsoluteTemporalOperator(condition.operator) ? (
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
                  aria-label={`Group ${groupIndex + 1} condition ${conditionIndex + 1} timezone`}
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
          ) : isIdField && condition.operator === "in" ? (
            <div className="min-[420px]:col-span-2">
              <MultiSelectCombobox
                ariaLabel={`Group ${groupIndex + 1} condition ${conditionIndex + 1} values`}
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
          ) : isIdField && condition.operator === "equals" ? (
            <Select
              disabled={disabled}
              value={conditionValue.length > 0 ? conditionValue : null}
              onValueChange={(value) =>
                onChange(groupIndex, conditionIndex, { value })
              }
            >
              <SelectTrigger
                aria-label={`Group ${groupIndex + 1} condition ${conditionIndex + 1} value`}
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

interface FilterGroupCardProps {
  defaultTimezone: string;
  disabled: boolean;
  fieldOptions: WorkflowFilterFieldOption[];
  group: FilterGroup;
  groupIndex: number;
  onAddCondition: (groupIndex: number) => void;
  onConditionChange: (
    groupIndex: number,
    conditionIndex: number,
    patch: Partial<JourneyTriggerFilterConditionDraft>,
  ) => void;
  onGroupLogicChange: (groupIndex: number, logic: LogicOperator) => void;
  onRemoveCondition: (groupIndex: number, conditionIndex: number) => void;
  onRemoveGroup: (groupIndex: number) => void;
  valueOptionsByField: Record<string, WorkflowFilterValueOption[]>;
}

function FilterGroupCard({
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
}: FilterGroupCardProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-muted text-xs font-semibold">
            {groupIndex + 1}
          </div>
          <p className="font-medium text-sm">Filter group</p>
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
        {group.conditions.map((condition, conditionIndex) => (
          <div key={`condition-${groupIndex}-${conditionIndex}`}>
            <ConditionRow
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
                <LogicConnector
                  ariaLabel={`Group ${groupIndex + 1} condition connector`}
                  disabled={disabled}
                  value={group.logic}
                  onChange={(logic) => onGroupLogicChange(groupIndex, logic)}
                />
              </div>
            ) : null}
          </div>
        ))}

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

interface AudienceFilterSectionProps {
  audienceDescription?: string;
  audienceHint?: string;
  defaultTimezone: string;
  disabled: boolean;
  fieldOptions: WorkflowFilterFieldOption[];
  filter: JourneyTriggerFilterAstDraft | null;
  filterValidationError: string | null;
  isExpanded: boolean;
  onAddCondition: (groupIndex: number) => void;
  onAddGroup: () => void;
  onConditionChange: (
    groupIndex: number,
    conditionIndex: number,
    patch: Partial<JourneyTriggerFilterConditionDraft>,
  ) => void;
  onFilterLogicChange: (logic: LogicOperator) => void;
  onGroupLogicChange: (groupIndex: number, logic: LogicOperator) => void;
  onRemoveCondition: (groupIndex: number, conditionIndex: number) => void;
  onRemoveGroup: (groupIndex: number) => void;
  onToggleExpanded: () => void;
  valueOptionsByField: Record<string, WorkflowFilterValueOption[]>;
}

function AudienceFilterSection({
  audienceDescription = "Define which appointments enter this journey",
  audienceHint = "Rules are optional. They decide which appointments enter this journey.",
  defaultTimezone,
  disabled,
  fieldOptions,
  filter,
  filterValidationError,
  isExpanded,
  onAddCondition,
  onAddGroup,
  onConditionChange,
  onFilterLogicChange,
  onGroupLogicChange,
  onRemoveCondition,
  onRemoveGroup,
  onToggleExpanded,
  valueOptionsByField,
}: AudienceFilterSectionProps) {
  const totalConditions = countFilterConditions(filter);
  const totalGroups = filter?.groups.length ?? 0;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <button
        aria-label="Toggle audience rules"
        className="flex w-full items-center justify-between gap-3 rounded-md p-1 text-left hover:bg-muted/40"
        onClick={onToggleExpanded}
        type="button"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-4 text-muted-foreground" icon={FilterIcon} />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-sm">Audience Rules</p>
            <p className="text-muted-foreground text-xs">
              {audienceDescription}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {filter ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-muted px-2 py-1 text-xs text-foreground">
              <Icon
                className="size-3.5 text-muted-foreground"
                icon={UserGroup02Icon}
              />
              {totalConditions} rule{totalConditions === 1 ? "" : "s"} across{" "}
              {totalGroups} group{totalGroups === 1 ? "" : "s"}
            </span>
          ) : null}
          <Icon
            className="size-4 text-muted-foreground"
            icon={isExpanded ? ArrowDown01Icon : ArrowRight02Icon}
          />
        </div>
      </button>

      {isExpanded ? (
        <div className="space-y-3 border-t pt-3">
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2 text-muted-foreground text-xs">
            <Icon className="mt-0.5 size-3.5 shrink-0" icon={Alert02Icon} />
            <p>{audienceHint}</p>
          </div>

          {filterValidationError ? (
            <p className="text-destructive text-xs">{filterValidationError}</p>
          ) : null}

          {filter ? (
            <div className="space-y-3">
              {filter.groups.map((group, groupIndex) => (
                <div key={`group-${groupIndex}`}>
                  <FilterGroupCard
                    defaultTimezone={defaultTimezone}
                    disabled={disabled}
                    fieldOptions={fieldOptions}
                    group={group}
                    groupIndex={groupIndex}
                    onAddCondition={onAddCondition}
                    onConditionChange={onConditionChange}
                    onGroupLogicChange={onGroupLogicChange}
                    onRemoveCondition={onRemoveCondition}
                    onRemoveGroup={onRemoveGroup}
                    valueOptionsByField={valueOptionsByField}
                  />

                  {groupIndex < filter.groups.length - 1 ? (
                    <div className="flex justify-center py-1">
                      <LogicConnector
                        ariaLabel="Group connector"
                        disabled={disabled}
                        value={filter.logic}
                        onChange={onFilterLogicChange}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex justify-center">
            <Button
              className="border-dashed"
              disabled={disabled}
              onClick={onAddGroup}
              size="sm"
              type="button"
              variant="outline"
            >
              <Icon className="size-4" icon={Add01Icon} />
              Add group
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface WorkflowTriggerConfigProps {
  config: Record<string, unknown>;
  clientAttributeDefinitions?: CustomAttributeDefinitionForFilter[];
  clientAttributeDefinitionsLoaded?: boolean;
  defaultTimezone?: string;
  disabled: boolean;
  fieldOptions?: WorkflowFilterFieldOption[];
  triggerTypeLocked?: boolean;
  onTriggerTypeChange?: (
    triggerType: "AppointmentJourney" | "ClientJourney",
  ) => void;
  onUpdate: (next: TriggerConfigShape) => void;
  valueOptionsByField?: Record<string, WorkflowFilterValueOption[]>;
}

export function WorkflowTriggerConfig({
  config,
  clientAttributeDefinitions = [],
  clientAttributeDefinitionsLoaded = true,
  defaultTimezone = "America/New_York",
  disabled,
  fieldOptions = WORKFLOW_FILTER_FIELD_OPTIONS,
  triggerTypeLocked = false,
  onTriggerTypeChange,
  onUpdate,
  valueOptionsByField = {},
}: WorkflowTriggerConfigProps) {
  const filterSyncKey = useMemo(() => {
    return JSON.stringify(config.filter ?? null);
  }, [config.filter]);
  const [showFilters, setShowFilters] = useState(false);

  return (
    <WorkflowTriggerConfigInner
      key={filterSyncKey}
      config={config}
      clientAttributeDefinitions={clientAttributeDefinitions}
      clientAttributeDefinitionsLoaded={clientAttributeDefinitionsLoaded}
      defaultTimezone={defaultTimezone}
      disabled={disabled}
      fieldOptions={fieldOptions}
      triggerTypeLocked={triggerTypeLocked}
      onTriggerTypeChange={onTriggerTypeChange}
      onUpdate={onUpdate}
      showFilters={showFilters}
      onShowFiltersChange={setShowFilters}
      valueOptionsByField={valueOptionsByField}
    />
  );
}

interface WorkflowTriggerConfigInnerProps extends WorkflowTriggerConfigProps {
  showFilters: boolean;
  onShowFiltersChange: (show: boolean) => void;
}

function WorkflowTriggerConfigInner({
  config,
  clientAttributeDefinitions = [],
  clientAttributeDefinitionsLoaded = true,
  defaultTimezone = "America/New_York",
  disabled,
  fieldOptions = WORKFLOW_FILTER_FIELD_OPTIONS,
  triggerTypeLocked = false,
  onTriggerTypeChange,
  onUpdate,
  showFilters,
  onShowFiltersChange,
  valueOptionsByField = {},
}: WorkflowTriggerConfigInnerProps) {
  const [filterDraft, setFilterDraft] =
    useState<JourneyTriggerFilterAstDraft | null>(() =>
      toFilterDraft(config.filter),
    );
  const [filterValidationError, setFilterValidationError] = useState<
    string | null
  >(null);

  const commitFilter = (nextFilter: JourneyTriggerFilterAstDraft | null) => {
    setFilterDraft(nextFilter);
    setFilterValidationError(null);

    if (!nextFilter) {
      onUpdate({ filter: undefined });
      return;
    }

    const parsed = journeyTriggerFilterAstSchema.safeParse(nextFilter);
    if (parsed.success) {
      onUpdate({ filter: parsed.data });
    }
  };

  const handleAddFilterGroup = () => {
    if (!filterDraft) {
      commitFilter(createDefaultFilter());
      return;
    }

    const baseFilter = filterDraft;
    if (baseFilter.groups.length >= MAX_FILTER_GROUPS) {
      setFilterValidationError(
        `You can add at most ${MAX_FILTER_GROUPS} groups.`,
      );
      return;
    }

    commitFilter({
      ...baseFilter,
      groups: [
        ...baseFilter.groups,
        {
          logic: "and",
          conditions: [createEmptyCondition()],
        },
      ],
    });
  };

  const handleRemoveFilterGroup = (groupIndex: number) => {
    if (!filterDraft) {
      return;
    }

    const nextGroups = filterDraft.groups.filter(
      (_, index) => index !== groupIndex,
    );
    if (nextGroups.length === 0) {
      commitFilter(null);
      return;
    }

    commitFilter({
      ...filterDraft,
      groups: nextGroups,
    });
  };

  const handleGroupLogicChange = (groupIndex: number, logic: LogicOperator) => {
    if (!filterDraft) {
      return;
    }

    commitFilter({
      ...filterDraft,
      groups: filterDraft.groups.map((group, index) => {
        if (index !== groupIndex) {
          return group;
        }

        return { ...group, logic };
      }),
    });
  };

  const handleFilterLogicChange = (logic: LogicOperator) => {
    if (!filterDraft) {
      return;
    }

    commitFilter({
      ...filterDraft,
      logic,
    });
  };

  const handleAddCondition = (groupIndex: number) => {
    if (!filterDraft) {
      return;
    }

    if (countFilterConditions(filterDraft) >= MAX_FILTER_CONDITIONS) {
      setFilterValidationError(
        `You can add at most ${MAX_FILTER_CONDITIONS} conditions.`,
      );
      return;
    }

    commitFilter({
      ...filterDraft,
      groups: filterDraft.groups.map((group, index) => {
        if (index !== groupIndex) {
          return group;
        }

        return {
          ...group,
          conditions: [...group.conditions, createEmptyCondition()],
        };
      }),
    });
  };

  const handleRemoveCondition = (
    groupIndex: number,
    conditionIndex: number,
  ) => {
    if (!filterDraft) {
      return;
    }

    const nextGroups = filterDraft.groups
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
      commitFilter(null);
      return;
    }

    commitFilter({
      ...filterDraft,
      groups: nextGroups,
    });
  };

  const handleConditionChange = (
    groupIndex: number,
    conditionIndex: number,
    patch: Partial<JourneyTriggerFilterConditionDraft>,
  ) => {
    if (!filterDraft) {
      return;
    }

    commitFilter({
      ...filterDraft,
      groups: filterDraft.groups.map((group, index) => {
        if (index !== groupIndex) {
          return group;
        }

        return {
          ...group,
          conditions: group.conditions.map((condition, nestedIndex) => {
            if (nestedIndex !== conditionIndex) {
              return condition;
            }

            return {
              ...condition,
              ...patch,
            };
          }),
        };
      }),
    });
  };

  const currentTriggerType =
    config.triggerType === "ClientJourney" ||
    config.event === "client.created" ||
    config.event === "client.updated" ||
    config.correlationKey === "clientId"
      ? "ClientJourney"
      : "AppointmentJourney";
  const currentClientEvent =
    config.event === "client.updated" ? "client.updated" : "client.created";
  const selectedClientEventLabel =
    currentClientEvent === "client.updated"
      ? "Client Updated"
      : "Client Created";
  const currentTrackedAttributeKey =
    typeof config.trackedAttributeKey === "string"
      ? config.trackedAttributeKey
      : "";
  const trackedAttributeOptions = useMemo(
    () => toTrackedClientAttributeOptions(clientAttributeDefinitions),
    [clientAttributeDefinitions],
  );
  const hasTrackedAttributeOptions = trackedAttributeOptions.length > 0;
  const isTrackedAttributeSelectionValid = trackedAttributeOptions.some(
    (option) => option.value === currentTrackedAttributeKey,
  );
  const selectedTrackedAttributeLabel = trackedAttributeOptions.find(
    (option) => option.value === currentTrackedAttributeKey,
  )?.label;
  const fallbackTrackedAttributeKey =
    trackedAttributeOptions.find((option) => option.source === "custom")
      ?.value ??
    trackedAttributeOptions[0]?.value ??
    null;
  const resolvedTrackedAttributeKey =
    currentTrackedAttributeKey.length > 0 && isTrackedAttributeSelectionValid
      ? currentTrackedAttributeKey
      : fallbackTrackedAttributeKey;
  const showMissingTrackedAttributeWarning =
    clientAttributeDefinitionsLoaded &&
    currentTriggerType === "ClientJourney" &&
    currentClientEvent === "client.updated" &&
    currentTrackedAttributeKey.length > 0 &&
    !isTrackedAttributeSelectionValid;

  useEffect(() => {
    if (disabled || !showMissingTrackedAttributeWarning) {
      return;
    }

    onUpdate(
      resolvedTrackedAttributeKey
        ? {
            triggerType: "ClientJourney",
            event: "client.updated",
            correlationKey: "clientId",
            trackedAttributeKey: resolvedTrackedAttributeKey,
          }
        : {
            triggerType: "ClientJourney",
            event: "client.created",
            correlationKey: "clientId",
          },
    );
  }, [
    disabled,
    onUpdate,
    resolvedTrackedAttributeKey,
    showMissingTrackedAttributeWarning,
  ]);

  const audienceDescription =
    currentTriggerType === "ClientJourney"
      ? "Define which clients enter this journey"
      : "Define which appointments enter this journey";

  const audienceHint =
    currentTriggerType === "ClientJourney"
      ? "Rules are optional. They decide which clients enter this journey."
      : "Rules are optional. They decide which appointments enter this journey.";
  const isTriggerTypeSelectionDisabled = disabled || triggerTypeLocked;

  return (
    <section className="space-y-4">
      {onTriggerTypeChange ? (
        <div className="space-y-2">
          <p className="font-medium text-xs text-muted-foreground">
            Trigger type
          </p>
          <div className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
            <button
              className={cn(
                "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-sm px-2 py-1 font-medium text-xs transition-[color,box-shadow]",
                currentTriggerType === "AppointmentJourney"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              disabled={isTriggerTypeSelectionDisabled}
              onClick={() => onTriggerTypeChange("AppointmentJourney")}
              type="button"
            >
              Appointment
            </button>
            <button
              className={cn(
                "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-sm px-2 py-1 font-medium text-xs transition-[color,box-shadow]",
                currentTriggerType === "ClientJourney"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              disabled={isTriggerTypeSelectionDisabled}
              onClick={() => onTriggerTypeChange("ClientJourney")}
              type="button"
            >
              Client
            </button>
          </div>
          {triggerTypeLocked ? (
            <p className="text-muted-foreground text-xs">
              Trigger type is locked once the workflow includes additional
              steps.
            </p>
          ) : null}
        </div>
      ) : null}

      {currentTriggerType === "AppointmentJourney" ? (
        <>
          <div className="space-y-1">
            <h2 className="font-medium text-sm">Appointment Journey</h2>
            <p className="text-muted-foreground text-xs">
              Starts, stays updated, and stops for an appointment.
            </p>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">
                Scheduled starts run
              </span>
              <Icon
                className="size-3.5 text-muted-foreground"
                icon={ArrowRight02Icon}
              />
              <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">
                Rescheduled replans run
              </span>
              <Icon
                className="size-3.5 text-muted-foreground"
                icon={ArrowRight02Icon}
              />
              <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">
                Canceled stops run
              </span>
            </div>
            <ul className="list-disc space-y-1 pl-4 text-muted-foreground text-xs">
              <li>
                Rescheduled appointments replan the same run and shift future
                waits and sends to the new start time.
              </li>
              <li>Cancellation prevents future messages from sending.</li>
            </ul>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <h2 className="font-medium text-sm">Client Journey</h2>
            <p className="text-muted-foreground text-xs">
              Triggered when a client record is created or updated.
            </p>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-2">
              <p className="font-medium text-xs text-muted-foreground">Event</p>
              <Select
                disabled={disabled}
                value={currentClientEvent}
                onValueChange={(value) => {
                  if (
                    value !== "client.created" &&
                    value !== "client.updated"
                  ) {
                    return;
                  }

                  if (value === "client.created") {
                    onUpdate({
                      triggerType: "ClientJourney",
                      event: "client.created",
                      correlationKey: "clientId",
                    });
                    return;
                  }

                  if (!resolvedTrackedAttributeKey) {
                    return;
                  }

                  onUpdate({
                    triggerType: "ClientJourney",
                    event: "client.updated",
                    correlationKey: "clientId",
                    trackedAttributeKey: resolvedTrackedAttributeKey,
                  });
                }}
              >
                <SelectTrigger className="h-9 w-full" size="sm">
                  <SelectValue placeholder="Select event">
                    {selectedClientEventLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client.created">Client Created</SelectItem>
                  <SelectItem value="client.updated">Client Updated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {currentClientEvent === "client.updated" ? (
              <div className="space-y-2">
                <p className="font-medium text-xs text-muted-foreground">
                  Tracked attribute key (required)
                </p>
                <Select
                  disabled={disabled || !hasTrackedAttributeOptions}
                  value={
                    isTrackedAttributeSelectionValid
                      ? currentTrackedAttributeKey
                      : null
                  }
                  onValueChange={(value) => {
                    if (!value) {
                      return;
                    }

                    onUpdate({
                      triggerType: "ClientJourney",
                      event: "client.updated",
                      correlationKey: "clientId",
                      trackedAttributeKey: value,
                    });
                  }}
                >
                  <SelectTrigger
                    aria-label="Tracked attribute key"
                    className="h-9 w-full"
                    size="sm"
                  >
                    <SelectValue
                      placeholder={
                        hasTrackedAttributeOptions
                          ? "Select tracked attribute"
                          : "No client attributes available"
                      }
                    >
                      {selectedTrackedAttributeLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {trackedAttributeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!hasTrackedAttributeOptions ? (
                  <p className="text-destructive text-xs">
                    No supported client attributes are available for tracking.
                  </p>
                ) : null}
                {showMissingTrackedAttributeWarning ? (
                  <p className="text-destructive text-xs">
                    The previously selected attribute no longer exists. Select a
                    new tracked attribute.
                  </p>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  A tracked attribute is the specific client field this trigger
                  watches. The journey runs only when that field changes,
                  including built-in fields like name/email/phone or custom
                  attributes.
                </p>
              </div>
            ) : null}
          </div>
        </>
      )}

      <AudienceFilterSection
        audienceDescription={audienceDescription}
        audienceHint={audienceHint}
        defaultTimezone={defaultTimezone}
        disabled={disabled}
        fieldOptions={fieldOptions}
        filter={filterDraft}
        filterValidationError={filterValidationError}
        isExpanded={showFilters}
        onAddCondition={handleAddCondition}
        onAddGroup={handleAddFilterGroup}
        onConditionChange={handleConditionChange}
        onFilterLogicChange={handleFilterLogicChange}
        onGroupLogicChange={handleGroupLogicChange}
        onRemoveCondition={handleRemoveCondition}
        onRemoveGroup={handleRemoveFilterGroup}
        onToggleExpanded={() => onShowFiltersChange(!showFilters)}
        valueOptionsByField={valueOptionsByField}
      />
    </section>
  );
}
