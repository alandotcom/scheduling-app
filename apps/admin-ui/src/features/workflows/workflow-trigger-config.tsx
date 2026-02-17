import { useEffect, useMemo, useState } from "react";
import {
  domainEventDomains,
  domainEventTypesByDomain,
  journeyTriggerFilterAstSchema,
  journeyTriggerFilterOperatorSchema,
  type DomainEventDomain,
  type JourneyTriggerFilterAst,
  type JourneyTriggerFilterCondition,
} from "@scheduling/dto";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

type TriggerConfigShape = {
  domain?: DomainEventDomain;
  startEvents?: string[];
  restartEvents?: string[];
  stopEvents?: string[];
  domainEventCorrelationPath?: string;
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

function isDomainEventDomain(value: unknown): value is DomainEventDomain {
  return (
    typeof value === "string" &&
    domainEventDomains.some((domain) => domain === value)
  );
}

function toDomainLabel(domain: DomainEventDomain): string {
  return domain
    .split("_")
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

function getSelectedDomain(config: Record<string, unknown>): DomainEventDomain {
  return isDomainEventDomain(config.domain) ? config.domain : "appointment";
}

function filterEventsToDomain(
  values: string[],
  domain: DomainEventDomain,
): string[] {
  const allowed = new Set<string>(domainEventTypesByDomain[domain]);
  return values.filter((value) => allowed.has(value));
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
  const selectedDomain = getSelectedDomain(config);
  const domainEvents = domainEventTypesByDomain[selectedDomain];

  const [correlationPathValue, setCorrelationPathValue] = useState("");
  const [filterDraft, setFilterDraft] =
    useState<JourneyTriggerFilterAst | null>(() => toFilterAst(config.filter));
  const [filterValidationError, setFilterValidationError] = useState<
    string | null
  >(null);

  useEffect(() => {
    setCorrelationPathValue(
      typeof config.domainEventCorrelationPath === "string"
        ? config.domainEventCorrelationPath
        : "",
    );
  }, [config.domainEventCorrelationPath]);

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

  const overlapWarnings = useMemo(() => {
    const start = new Set(
      filterEventsToDomain(toStringArray(config.startEvents), selectedDomain),
    );
    const restart = new Set(
      filterEventsToDomain(toStringArray(config.restartEvents), selectedDomain),
    );
    const stop = new Set(
      filterEventsToDomain(toStringArray(config.stopEvents), selectedDomain),
    );

    return {
      startRestart: [...start].filter((e) => restart.has(e)),
      startStop: [...start].filter((e) => stop.has(e)),
      restartStop: [...restart].filter((e) => stop.has(e)),
    };
  }, [
    config.startEvents,
    config.restartEvents,
    config.stopEvents,
    selectedDomain,
  ]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-medium text-sm">Domain Event Trigger</h2>
        <p className="text-muted-foreground text-xs">
          Configure which domain events start, restart, or stop workflow runs.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-domain">Domain</Label>
        <Select
          disabled={disabled}
          value={selectedDomain}
          onValueChange={(nextDomain) => {
            if (!isDomainEventDomain(nextDomain)) {
              return;
            }

            onUpdate({
              domain: nextDomain,
              startEvents: [],
              restartEvents: [],
              stopEvents: [],
            });
          }}
        >
          <SelectTrigger id="workflow-trigger-domain" size="sm">
            <SelectValue placeholder="Select domain" />
          </SelectTrigger>
          <SelectContent>
            {domainEventDomains.map((domain) => (
              <SelectItem key={domain} value={domain}>
                {toDomainLabel(domain)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-start-events">Start events</Label>
        <MultiSelectCombobox
          id="workflow-trigger-start-events"
          disabled={disabled}
          options={domainEvents}
          value={filterEventsToDomain(
            toStringArray(config.startEvents),
            selectedDomain,
          )}
          onChange={(values) =>
            onUpdate({
              startEvents: filterEventsToDomain(values, selectedDomain),
            })
          }
          placeholder="Select events..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-restart-events">Restart events</Label>
        <MultiSelectCombobox
          id="workflow-trigger-restart-events"
          disabled={disabled}
          options={domainEvents}
          value={filterEventsToDomain(
            toStringArray(config.restartEvents),
            selectedDomain,
          )}
          onChange={(values) =>
            onUpdate({
              restartEvents: filterEventsToDomain(values, selectedDomain),
            })
          }
          placeholder="Select events..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-stop-events">Stop events</Label>
        <MultiSelectCombobox
          id="workflow-trigger-stop-events"
          disabled={disabled}
          options={domainEvents}
          value={filterEventsToDomain(
            toStringArray(config.stopEvents),
            selectedDomain,
          )}
          onChange={(values) =>
            onUpdate({
              stopEvents: filterEventsToDomain(values, selectedDomain),
            })
          }
          placeholder="Select events..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-correlation-path">
          Correlation path
        </Label>
        <Input
          disabled={disabled}
          id="workflow-trigger-correlation-path"
          onBlur={() =>
            onUpdate({
              domainEventCorrelationPath:
                correlationPathValue.trim() || undefined,
            })
          }
          onChange={(event) => {
            setCorrelationPathValue(event.target.value);
          }}
          placeholder="data.appointmentId"
          value={correlationPathValue}
        />
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
          <p className="text-destructive text-xs">{filterValidationError}</p>
        ) : null}

        {filterDraft ? (
          <div className="space-y-3">
            {filterDraft.groups.map((group, groupIndex) => (
              <div
                className="space-y-2 rounded-md border p-2"
                key={`group-${groupIndex}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-xs">Group {groupIndex + 1}</p>
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
                          disabled || isValueLessOperator(condition.operator)
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
                          handleConditionChange(groupIndex, conditionIndex, {
                            value: event.target.value,
                          })
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

      {overlapWarnings.startRestart.length > 0 ||
      overlapWarnings.startStop.length > 0 ||
      overlapWarnings.restartStop.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {overlapWarnings.startRestart.length > 0 ? (
            <p>
              Shared start/restart events:{" "}
              {overlapWarnings.startRestart.join(", ")}
            </p>
          ) : null}
          {overlapWarnings.startStop.length > 0 ? (
            <p>
              Shared start/stop events: {overlapWarnings.startStop.join(", ")}
            </p>
          ) : null}
          {overlapWarnings.restartStop.length > 0 ? (
            <p>
              Shared restart/stop events:{" "}
              {overlapWarnings.restartStop.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
