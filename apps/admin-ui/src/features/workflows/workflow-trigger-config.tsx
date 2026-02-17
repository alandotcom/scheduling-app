import { useEffect, useState } from "react";
import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowRight02Icon,
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

function toFilterAst(value: unknown): JourneyTriggerFilterAst | null {
  const parsed = journeyTriggerFilterAstSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

function countFilterConditions(filter: JourneyTriggerFilterAst | null): number {
  if (!filter) {
    return 0;
  }

  return filter.groups.reduce(
    (total, group) => total + group.conditions.length,
    0,
  );
}

function createEmptyCondition(): JourneyTriggerFilterCondition {
  return {
    field: "appointment.status",
    operator: "equals",
    value: "",
  };
}

function createDefaultFilter(): JourneyTriggerFilterAst {
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
  return operator === "is_set" || operator === "is_not_set";
}

function isJourneyFilterOperator(
  value: string | null,
): value is JourneyTriggerFilterCondition["operator"] {
  return (
    typeof value === "string" &&
    FILTER_OPERATORS.some((operator) => operator === value)
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
  const [filterDraft, setFilterDraft] =
    useState<JourneyTriggerFilterAst | null>(() => toFilterAst(config.filter));
  const [filterValidationError, setFilterValidationError] = useState<
    string | null
  >(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setFilterDraft(toFilterAst(config.filter));
    setFilterValidationError(null);
  }, [config.filter]);

  const commitFilter = (nextFilter: JourneyTriggerFilterAst | null) => {
    setFilterDraft(nextFilter);
    setFilterValidationError(null);
    onUpdate({ filter: nextFilter ?? undefined });
  };

  const handleAddFilterGroup = () => {
    const baseFilter = filterDraft ?? createDefaultFilter();
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

  const handleGroupLogicChange = (groupIndex: number, logic: "and" | "or") => {
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
    patch: Partial<JourneyTriggerFilterCondition>,
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
        <h2 className="font-medium text-sm">Appointment Journey Trigger</h2>
        <p className="text-muted-foreground text-xs">
          This trigger is fixed to appointment lifecycle events.
        </p>
      </div>

      <div className="space-y-4 rounded-md border p-3">
        <div className="space-y-2">
          <Label>Start condition</Label>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Start when</p>
            <Input disabled readOnly value="Appointment scheduled" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>If already running for this appointment</Label>

          <label className="flex items-start gap-2 text-sm">
            <input
              checked
              className="mt-1"
              disabled
              name="already-running-mode"
              readOnly
              type="radio"
            />
            <span className="space-y-1">
              <span className="font-medium">Keep running</span>
              <p className="text-muted-foreground text-xs">
                Meaning: ignore duplicate start, keep plan.
              </p>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              disabled
              name="already-running-mode"
              readOnly
              type="radio"
            />
            <span className="space-y-1">
              <span className="font-medium">Start over</span>
              <p className="text-muted-foreground text-xs">
                Meaning: end previous run as Superseded and create a new one.
                This does not run Exit path.
              </p>
            </span>
          </label>
        </div>

        <div className="space-y-2">
          <Label>Keep in sync (recommended)</Label>
          <label className="flex items-center gap-2 text-sm">
            <input checked disabled readOnly type="checkbox" />
            <span>When appointment is rescheduled</span>
          </label>
          <p className="text-muted-foreground text-xs">
            Behavior: Update future timing (no separate On update branch in v1).
          </p>
        </div>

        <div className="space-y-2">
          <Label>Exit condition</Label>
          <label className="flex items-center gap-2 text-sm">
            <input checked disabled readOnly type="checkbox" />
            <span>Appointment canceled</span>
          </label>
        </div>

        <div className="space-y-2 border-t pt-3">
          <button
            className="flex items-center gap-2 font-medium text-sm"
            onClick={() => setShowAdvanced((current) => !current)}
            type="button"
          >
            <Icon
              className="size-4 text-muted-foreground"
              icon={showAdvanced ? ArrowDown01Icon : ArrowRight02Icon}
            />
            Advanced
          </button>

          {showAdvanced ? (
            <div className="space-y-2 rounded-md border p-2 text-xs">
              <p>
                <span className="font-medium">Key:</span> Appointment ID
                (read-only in v1)
              </p>
              <p className="text-muted-foreground">Event mapping (internal):</p>
              <p>
                <span className="font-medium">Start:</span>{" "}
                appointment.scheduled
              </p>
              <p>
                <span className="font-medium">Restart:</span>{" "}
                appointment.rescheduled
              </p>
              <p>
                <span className="font-medium">Stop:</span> appointment.canceled
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <Label>Trigger filters</Label>
            <p className="text-muted-foreground text-xs">
              Build one-level grouped rules using appointment and client fields.
            </p>
          </div>
          <Button
            onClick={() => setShowFilters((current) => !current)}
            size="sm"
            type="button"
            variant="outline"
          >
            {showFilters ? "Hide filters" : "Show filters"}
          </Button>
        </div>

        {showFilters ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2 text-muted-foreground text-xs">
              <Icon className="mt-0.5 size-3.5 shrink-0" icon={Alert02Icon} />
              <p>
                Filters are optional. They narrow which appointment events start
                or continue this journey.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                disabled={disabled}
                onClick={handleAddFilterGroup}
                size="sm"
                type="button"
                variant="outline"
              >
                Add group
              </Button>
            </div>

            {filterValidationError ? (
              <p className="text-destructive text-xs">
                {filterValidationError}
              </p>
            ) : null}

            {filterDraft ? (
              <div className="space-y-3">
                {filterDraft.groups.map((group, groupIndex) => (
                  <div
                    className="space-y-2 rounded-md border p-2"
                    key={`group-${groupIndex}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-xs">
                        Group {groupIndex + 1}
                      </p>
                      <div className="flex items-center gap-2">
                        <Select
                          disabled={disabled}
                          value={group.logic}
                          onValueChange={(logic) => {
                            if (logic === "and" || logic === "or") {
                              handleGroupLogicChange(groupIndex, logic);
                            }
                          }}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue placeholder="Logic" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="and">AND</SelectItem>
                            <SelectItem value="or">OR</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          disabled={disabled}
                          onClick={() => handleRemoveFilterGroup(groupIndex)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Remove group
                        </Button>
                      </div>
                    </div>

                    {group.conditions.map((condition, conditionIndex) => (
                      <div
                        className="grid grid-cols-1 gap-2 md:grid-cols-3"
                        key={`condition-${groupIndex}-${conditionIndex}`}
                      >
                        <Input
                          disabled={disabled}
                          placeholder="appointment.startAt"
                          value={condition.field}
                          onChange={(event) =>
                            handleConditionChange(groupIndex, conditionIndex, {
                              field: event.target.value,
                            })
                          }
                        />
                        <Select
                          disabled={disabled}
                          value={condition.operator}
                          onValueChange={(operator) => {
                            if (!isJourneyFilterOperator(operator)) {
                              return;
                            }

                            handleConditionChange(groupIndex, conditionIndex, {
                              operator,
                              ...(isValueLessOperator(operator)
                                ? { value: undefined }
                                : {}),
                            });
                          }}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue placeholder="Operator" />
                          </SelectTrigger>
                          <SelectContent>
                            {FILTER_OPERATORS.map((operator) => (
                              <SelectItem key={operator} value={operator}>
                                {operator}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <Input
                            disabled={
                              disabled ||
                              isValueLessOperator(condition.operator)
                            }
                            placeholder="Value"
                            value={
                              typeof condition.value === "string" ||
                              typeof condition.value === "number" ||
                              typeof condition.value === "boolean"
                                ? String(condition.value)
                                : ""
                            }
                            onChange={(event) =>
                              handleConditionChange(
                                groupIndex,
                                conditionIndex,
                                {
                                  value: event.target.value,
                                },
                              )
                            }
                          />
                          <Button
                            disabled={disabled}
                            onClick={() =>
                              handleRemoveCondition(groupIndex, conditionIndex)
                            }
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Remove condition
                          </Button>
                        </div>
                      </div>
                    ))}

                    <Button
                      disabled={disabled}
                      onClick={() => handleAddCondition(groupIndex)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Add condition
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
