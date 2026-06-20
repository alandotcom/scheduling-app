import type { JourneyTriggerFilterCondition } from "@scheduling/dto";
import {
  ABSOLUTE_TEMPORAL_OPERATORS,
  RELATIVE_TEMPORAL_OPERATORS,
  VALUELESS_OPERATORS,
  type WorkflowFilterFieldOption,
  getWorkflowFilterFieldType,
  toAbsoluteTemporalComparisonValue,
  toRelativeTemporalValueDraft,
} from "../../../filter-builder-shared";
import type { ConditionFilterDraft } from "./condition-types";

export function isJourneyFilterOperator(
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

export function isValuelessOperator(
  operator: JourneyTriggerFilterCondition["operator"],
): boolean {
  return VALUELESS_OPERATORS.has(operator);
}

export function isRelativeTemporalOperator(
  operator: JourneyTriggerFilterCondition["operator"],
): boolean {
  return RELATIVE_TEMPORAL_OPERATORS.has(operator);
}

export function isAbsoluteTemporalOperator(
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

export function toPrimitiveListValue(
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
