import {
  journeyTriggerFilterAstSchema,
  type JourneyTriggerFilterAst,
  type JourneyTriggerFilterCondition,
} from "@scheduling/dto";

export type LogicOperator = JourneyTriggerFilterAst["logic"];
export type ConditionFilterConditionDraft = Omit<
  JourneyTriggerFilterCondition,
  "operator"
> & {
  operator: JourneyTriggerFilterCondition["operator"] | "";
};
export type ConditionFilterGroupDraft = {
  logic: LogicOperator;
  not?: boolean;
  conditions: ConditionFilterConditionDraft[];
};
export type ConditionFilterDraft = {
  logic: LogicOperator;
  groups: ConditionFilterGroupDraft[];
};
export type ConditionFilterDraftState = {
  sourceKey: string;
  draft: ConditionFilterDraft | null;
};

export const MAX_CONDITION_FILTER_GROUPS = 4;
export const MAX_CONDITION_FILTER_CONDITIONS = 12;
export const EMPTY_CONDITION_FILTER_SOURCE_KEY =
  "__empty_condition_filter_source__";

export function createEmptyConditionFilterCondition(): ConditionFilterConditionDraft {
  return {
    field: "",
    operator: "",
    value: undefined,
  };
}

export function createDefaultConditionFilter(): ConditionFilterDraft {
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

export function toConditionFilterSourceKey(
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

export function toConditionFilterSourceState(
  value: unknown,
): ConditionFilterDraftState {
  const draft = toConditionFilterDraft(value);

  return {
    sourceKey: toConditionFilterSourceKey(draft),
    draft,
  };
}

export function countConditionFilterConditions(
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

export function toConditionStableKey(
  condition: ConditionFilterConditionDraft,
): string {
  const value = JSON.stringify(condition.value);
  return `${condition.field}|${condition.operator}|${value ?? "undefined"}`;
}

export function toConditionGroupStableKey(
  group: ConditionFilterGroupDraft,
): string {
  return `${group.logic}|${group.conditions
    .map((condition) => toConditionStableKey(condition))
    .join("||")}`;
}
