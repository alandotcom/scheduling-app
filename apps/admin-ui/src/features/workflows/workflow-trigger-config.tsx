import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ABSOLUTE_TEMPORAL_OPERATORS,
  RELATIVE_TEMPORAL_OPERATORS,
  VALUELESS_OPERATORS,
  WORKFLOW_FILTER_FIELD_OPTIONS,
  WORKFLOW_FILTER_TEMPORAL_UNIT_OPTIONS,
  getWorkflowFilterFieldLabel,
  getWorkflowFilterOperatorLabel,
  getWorkflowFilterTemporalUnitLabel,
  getOperatorOptionsForField,
  getWorkflowFilterFieldType,
  toWorkflowFilterFallbackLabel,
  toDateInputValue,
  toRelativeTemporalValueDraft,
} from "./filter-builder-shared";

type TriggerConfigShape = {
  triggerType?: "AppointmentJourney";
  start?: "appointment.scheduled";
  restart?: "appointment.rescheduled";
  stop?: "appointment.canceled";
  correlationKey?: "appointmentId";
  filter?: JourneyTriggerFilterAst;
};

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
  disabled: boolean;
  groupIndex: number;
  onChange: (
    groupIndex: number,
    conditionIndex: number,
    patch: Partial<JourneyTriggerFilterConditionDraft>,
  ) => void;
  onRemove: (groupIndex: number, conditionIndex: number) => void;
}

function ConditionRow({
  canRemove,
  condition,
  conditionIndex,
  disabled,
  groupIndex,
  onChange,
  onRemove,
}: ConditionRowProps) {
  const isTimestampField =
    getWorkflowFilterFieldType(condition.field) === "timestamp";
  const baseOperatorOptions = getOperatorOptionsForField(condition.field);
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
  const selectedFieldLabel = getWorkflowFilterFieldLabel(condition.field);
  const selectedOperatorLabel = getWorkflowFilterOperatorLabel({
    field: condition.field,
    operator: condition.operator,
  });
  const selectedUnitLabel = getWorkflowFilterTemporalUnitLabel(
    relativeTemporalValue.unit,
  );

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
              {WORKFLOW_FILTER_FIELD_OPTIONS.map((field) => (
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
                className="h-9"
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
                <SelectTrigger className="h-9 min-w-0 w-full" size="sm">
                  <SelectValue placeholder="Unit">
                    {selectedUnitLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_FILTER_TEMPORAL_UNIT_OPTIONS.map((unit) => (
                    <SelectItem key={unit.value} value={unit.value}>
                      {unit.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : isTimestampField &&
            isAbsoluteTemporalOperator(condition.operator) ? (
            <Input
              className="h-9 min-[420px]:col-span-2"
              disabled={disabled}
              placeholder="Select date"
              type="date"
              value={toDateInputValue(condition.value)}
              onChange={(event) =>
                onChange(groupIndex, conditionIndex, {
                  value: event.target.value,
                })
              }
            />
          ) : (
            <Input
              className="h-9 min-[420px]:col-span-2"
              disabled={disabled}
              placeholder="Enter value..."
              value={toConditionValue(condition)}
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
  disabled: boolean;
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
}

function FilterGroupCard({
  disabled,
  group,
  groupIndex,
  onAddCondition,
  onConditionChange,
  onGroupLogicChange,
  onRemoveCondition,
  onRemoveGroup,
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
              disabled={disabled}
              groupIndex={groupIndex}
              onChange={onConditionChange}
              onRemove={onRemoveCondition}
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
  disabled: boolean;
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
}

function AudienceFilterSection({
  disabled,
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
              Define which appointments enter this journey
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
            <p>
              Rules are optional. They decide which appointments enter this
              journey.
            </p>
          </div>

          {filterValidationError ? (
            <p className="text-destructive text-xs">{filterValidationError}</p>
          ) : null}

          {filter ? (
            <div className="space-y-3">
              {filter.groups.map((group, groupIndex) => (
                <div key={`group-${groupIndex}`}>
                  <FilterGroupCard
                    disabled={disabled}
                    group={group}
                    groupIndex={groupIndex}
                    onAddCondition={onAddCondition}
                    onConditionChange={onConditionChange}
                    onGroupLogicChange={onGroupLogicChange}
                    onRemoveCondition={onRemoveCondition}
                    onRemoveGroup={onRemoveGroup}
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
  disabled: boolean;
  onUpdate: (next: TriggerConfigShape) => void;
}

export function WorkflowTriggerConfig({
  config,
  disabled,
  onUpdate,
}: WorkflowTriggerConfigProps) {
  const filterSyncKey = useMemo(() => {
    return JSON.stringify(config.filter ?? null);
  }, [config.filter]);

  return (
    <WorkflowTriggerConfigInner
      key={filterSyncKey}
      config={config}
      disabled={disabled}
      onUpdate={onUpdate}
    />
  );
}

function WorkflowTriggerConfigInner({
  config,
  disabled,
  onUpdate,
}: WorkflowTriggerConfigProps) {
  const [filterDraft, setFilterDraft] =
    useState<JourneyTriggerFilterAstDraft | null>(() =>
      toFilterDraft(config.filter),
    );
  const [filterValidationError, setFilterValidationError] = useState<
    string | null
  >(null);
  const [showFilters, setShowFilters] = useState(false);

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

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-medium text-sm">Appointment Journey</h2>
        <p className="text-muted-foreground text-xs">
          Starts, stays updated, and stops for an appointment.
        </p>
        <p className="text-xs">
          Starts on Scheduled, updates on Rescheduled, stops on Canceled.
        </p>
      </div>

      <div className="space-y-4 rounded-md border p-3">
        <div className="space-y-2">
          <Label>Entry</Label>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Start when</p>
            <Input disabled readOnly value="Appointment is scheduled" />
            <p className="text-muted-foreground text-xs">
              Creates one journey run per appointment.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Re-entry</Label>
          <p className="text-muted-foreground text-xs">
            Reschedule events re-enter this journey. Backend start events are
            deduplicated automatically.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Rescheduling</Label>
          <label className="flex items-center gap-2 text-sm">
            <input checked disabled readOnly type="checkbox" />
            <span>Update scheduled messages when the appointment moves</span>
          </label>
          <p className="text-muted-foreground text-xs">
            Future waits and sends shift to the new start time.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Stop when</Label>
          <label className="flex items-center gap-2 text-sm">
            <input checked disabled readOnly type="checkbox" />
            <span>Appointment is canceled</span>
          </label>
          <p className="text-muted-foreground text-xs">
            Prevents any future messages from sending.
          </p>
        </div>
      </div>

      <AudienceFilterSection
        disabled={disabled}
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
        onToggleExpanded={() => setShowFilters((current) => !current)}
      />
    </section>
  );
}
