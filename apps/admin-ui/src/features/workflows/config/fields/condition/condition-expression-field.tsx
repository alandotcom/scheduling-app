import { useMemo, useState } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { journeyTriggerFilterAstSchema } from "@scheduling/dto";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import { formatFieldLabel } from "@/lib/field-label";
import { cn } from "@/lib/utils";
import { WORKFLOW_FILTER_FIELD_OPTIONS } from "../../../filter-builder-shared";
import { ExpressionInput } from "../../expression-input";
import { getExpressionSuggestionsForField } from "../field-helpers";
import { useFieldRenderContext } from "../field-render-context";
import type { FieldComponentProps } from "../types";
import { compileConditionFilterBuilderExpression } from "./compile-condition-expression";
import { ConditionFilterGroupCard } from "./condition-filter-group-card";
import { ConditionLogicConnector } from "./condition-logic-connector";
import {
  type ConditionFilterConditionDraft,
  type ConditionFilterDraft,
  type ConditionFilterDraftState,
  EMPTY_CONDITION_FILTER_SOURCE_KEY,
  type LogicOperator,
  MAX_CONDITION_FILTER_CONDITIONS,
  MAX_CONDITION_FILTER_GROUPS,
  countConditionFilterConditions,
  createDefaultConditionFilter,
  createEmptyConditionFilterCondition,
  toConditionFilterSourceKey,
  toConditionFilterSourceState,
  toConditionGroupStableKey,
} from "./condition-types";

export function ConditionExpressionField({
  field,
  config,
  onUpdateConfig,
  onUpdateConfigBatch,
  disabled,
}: FieldComponentProps) {
  const {
    defaultTimezone,
    fieldOptions: contextFieldOptions,
    conditionValueOptionsByField,
    expressionSuggestions,
    configScopeKey,
  } = useFieldRenderContext();
  const fieldOptions = contextFieldOptions ?? WORKFLOW_FILTER_FIELD_OPTIONS;
  const configValue =
    typeof config[field.key] === "string"
      ? String(config[field.key])
      : (field.defaultValue ?? "");
  const scopedSuggestions = useMemo(
    () => getExpressionSuggestionsForField(field.key, expressionSuggestions),
    [field.key, expressionSuggestions],
  );
  const [rawValue, setRawValue] = useState(configValue);
  const [prevRawConfigValue, setPrevRawConfigValue] = useState(configValue);
  if (configValue !== prevRawConfigValue) {
    setPrevRawConfigValue(configValue);
    setRawValue(configValue);
  }
  const conditionFilter = config["conditionFilter"];
  const configConditionFilterState = useMemo(
    () => toConditionFilterSourceState(conditionFilter),
    [conditionFilter],
  );
  const [conditionFilterDraftState, setConditionFilterDraftState] =
    useState<ConditionFilterDraftState>(() => configConditionFilterState);
  const [filterValidationError, setFilterValidationError] = useState<
    string | null
  >(null);
  const [prevConfigConditionFilterState, setPrevConfigConditionFilterState] =
    useState(configConditionFilterState);
  const [prevConfigScopeKey, setPrevConfigScopeKey] = useState(configScopeKey);
  if (
    configConditionFilterState !== prevConfigConditionFilterState ||
    configScopeKey !== prevConfigScopeKey
  ) {
    setPrevConfigConditionFilterState(configConditionFilterState);
    setPrevConfigScopeKey(configScopeKey);
    setConditionFilterDraftState(configConditionFilterState);
    setFilterValidationError(null);
  }
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
      <Label>{formatFieldLabel(field.label, field.required === true)}</Label>
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
