import { Environment } from "@marcbachmann/cel-js";
import {
  journeyTriggerFilterAstSchema,
  type JourneyTriggerFilterAst,
  type JourneyTriggerFilterCondition,
} from "@scheduling/dto";

type PrimitiveLiteral = string | number | boolean | null;

export type JourneyTriggerFilterContext = {
  appointment: Record<string, unknown>;
  client: Record<string, unknown>;
};

export type JourneyTriggerFilterEvaluationErrorCode =
  | "FILTER_VALIDATION_FAILED"
  | "UNSUPPORTED_OPERATION"
  | "CEL_EVALUATION_FAILED";

export type JourneyTriggerFilterEvaluationError = {
  code: JourneyTriggerFilterEvaluationErrorCode;
  message: string;
  details?: unknown;
};

export type JourneyTriggerFilterEvaluationResult = {
  matched: boolean;
  error?: JourneyTriggerFilterEvaluationError;
};

const filterEnvironment = new Environment({
  unlistedVariablesAreDyn: false,
  limits: {
    maxAstNodes: 512,
    maxDepth: 64,
    maxListElements: 128,
    maxMapEntries: 128,
    maxCallArguments: 8,
  },
}).registerVariable("values", "map");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPathValue(
  root: Record<string, unknown>,
  fieldPath: string,
): unknown {
  const [, ...segments] = fieldPath.split(".");
  let current: unknown = root;

  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return null;
    }
    current = current[segment];
  }

  if (current === undefined) {
    return null;
  }

  if (current instanceof Date) {
    return current.toISOString();
  }

  return current;
}

function toCelLiteral(value: PrimitiveLiteral | PrimitiveLiteral[]): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => toCelLiteral(item)).join(", ")}]`;
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  return JSON.stringify(value);
}

function toValuesLookup(fieldPath: string): string {
  return `values[${JSON.stringify(fieldPath)}]`;
}

type BuildExpressionResult =
  | { ok: true; expression: string }
  | { ok: false; error: JourneyTriggerFilterEvaluationError };

type ValueExtractionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: JourneyTriggerFilterEvaluationError };

function unsupportedValueError(
  operator: JourneyTriggerFilterCondition["operator"],
  expected: string,
): JourneyTriggerFilterEvaluationError {
  return {
    code: "UNSUPPORTED_OPERATION",
    message: `Operator "${operator}" requires ${expected}`,
  };
}

function getPrimitiveLiteralValue(
  condition: JourneyTriggerFilterCondition,
): ValueExtractionResult<PrimitiveLiteral> {
  const value = condition.value;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return { ok: true, value };
  }

  return {
    ok: false,
    error: unsupportedValueError(condition.operator, "a primitive value"),
  };
}

function getPrimitiveLiteralListValue(
  condition: JourneyTriggerFilterCondition,
): ValueExtractionResult<PrimitiveLiteral[]> {
  const value = condition.value;
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: unsupportedValueError(
        condition.operator,
        "a primitive list value",
      ),
    };
  }

  const isPrimitiveList = value.every(
    (item) =>
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean",
  );

  if (!isPrimitiveList) {
    return {
      ok: false,
      error: unsupportedValueError(
        condition.operator,
        "a primitive list value",
      ),
    };
  }

  return { ok: true, value };
}

function getStringValue(
  condition: JourneyTriggerFilterCondition,
): ValueExtractionResult<string> {
  const value = condition.value;
  if (typeof value === "string") {
    return { ok: true, value };
  }

  return {
    ok: false,
    error: unsupportedValueError(condition.operator, "a string value"),
  };
}

function buildConditionExpression(
  condition: JourneyTriggerFilterCondition,
): BuildExpressionResult {
  const left = toValuesLookup(condition.field);

  switch (condition.operator) {
    case "equals": {
      const literalValue = getPrimitiveLiteralValue(condition);
      if (!literalValue.ok) {
        return { ok: false, error: literalValue.error };
      }

      return {
        ok: true,
        expression: `${left} == ${toCelLiteral(literalValue.value)}`,
      };
    }
    case "not_equals": {
      const literalValue = getPrimitiveLiteralValue(condition);
      if (!literalValue.ok) {
        return { ok: false, error: literalValue.error };
      }

      return {
        ok: true,
        expression: `${left} != ${toCelLiteral(literalValue.value)}`,
      };
    }
    case "in": {
      const literalListValue = getPrimitiveLiteralListValue(condition);
      if (!literalListValue.ok) {
        return { ok: false, error: literalListValue.error };
      }

      return {
        ok: true,
        expression: `${left} in ${toCelLiteral(literalListValue.value)}`,
      };
    }
    case "not_in": {
      const literalListValue = getPrimitiveLiteralListValue(condition);
      if (!literalListValue.ok) {
        return { ok: false, error: literalListValue.error };
      }

      return {
        ok: true,
        expression: `!(${left} in ${toCelLiteral(literalListValue.value)})`,
      };
    }
    case "contains": {
      const stringValue = getStringValue(condition);
      if (!stringValue.ok) {
        return { ok: false, error: stringValue.error };
      }

      return {
        ok: true,
        expression: `${left} != null && string(${left}).contains(${toCelLiteral(stringValue.value)})`,
      };
    }
    case "not_contains": {
      const stringValue = getStringValue(condition);
      if (!stringValue.ok) {
        return { ok: false, error: stringValue.error };
      }

      return {
        ok: true,
        expression: `${left} == null || !string(${left}).contains(${toCelLiteral(stringValue.value)})`,
      };
    }
    case "starts_with": {
      const stringValue = getStringValue(condition);
      if (!stringValue.ok) {
        return { ok: false, error: stringValue.error };
      }

      return {
        ok: true,
        expression: `${left} != null && string(${left}).startsWith(${toCelLiteral(stringValue.value)})`,
      };
    }
    case "ends_with": {
      const stringValue = getStringValue(condition);
      if (!stringValue.ok) {
        return { ok: false, error: stringValue.error };
      }

      return {
        ok: true,
        expression: `${left} != null && string(${left}).endsWith(${toCelLiteral(stringValue.value)})`,
      };
    }
    case "before": {
      const dateValue = getStringValue(condition);
      if (!dateValue.ok) {
        return { ok: false, error: dateValue.error };
      }

      return {
        ok: true,
        expression: `${left} != null && timestamp(string(${left})) < timestamp(${toCelLiteral(dateValue.value)})`,
      };
    }
    case "after": {
      const dateValue = getStringValue(condition);
      if (!dateValue.ok) {
        return { ok: false, error: dateValue.error };
      }

      return {
        ok: true,
        expression: `${left} != null && timestamp(string(${left})) > timestamp(${toCelLiteral(dateValue.value)})`,
      };
    }
    case "on_or_before": {
      const dateValue = getStringValue(condition);
      if (!dateValue.ok) {
        return { ok: false, error: dateValue.error };
      }

      return {
        ok: true,
        expression: `${left} != null && timestamp(string(${left})) <= timestamp(${toCelLiteral(dateValue.value)})`,
      };
    }
    case "on_or_after": {
      const dateValue = getStringValue(condition);
      if (!dateValue.ok) {
        return { ok: false, error: dateValue.error };
      }

      return {
        ok: true,
        expression: `${left} != null && timestamp(string(${left})) >= timestamp(${toCelLiteral(dateValue.value)})`,
      };
    }
    case "is_set":
      return { ok: true, expression: `${left} != null` };
    case "is_not_set":
      return { ok: true, expression: `${left} == null` };
    default:
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_OPERATION",
          message: "Unsupported filter operator",
        },
      };
  }
}

function buildFilterExpression(
  filter: JourneyTriggerFilterAst,
): BuildExpressionResult {
  const groupExpressions: string[] = [];

  for (const group of filter.groups) {
    const conditionExpressions: string[] = [];

    for (const condition of group.conditions) {
      const conditionExpression = buildConditionExpression(condition);
      if (!conditionExpression.ok) {
        return conditionExpression;
      }

      const normalizedConditionExpression = condition.not
        ? `!(${conditionExpression.expression})`
        : conditionExpression.expression;
      conditionExpressions.push(normalizedConditionExpression);
    }

    const groupOperator = group.logic === "and" ? " && " : " || ";
    const joinedGroupExpression = conditionExpressions.join(groupOperator);
    const normalizedGroupExpression = group.not
      ? `!(${joinedGroupExpression})`
      : joinedGroupExpression;

    groupExpressions.push(`(${normalizedGroupExpression})`);
  }

  const rootOperator = filter.logic === "and" ? " && " : " || ";
  return {
    ok: true,
    expression: groupExpressions.join(rootOperator),
  };
}

function collectValues(
  filter: JourneyTriggerFilterAst,
  context: JourneyTriggerFilterContext,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const group of filter.groups) {
    for (const condition of group.conditions) {
      if (condition.field.startsWith("appointment.")) {
        values[condition.field] = getPathValue(
          context.appointment,
          condition.field,
        );
        continue;
      }

      if (condition.field.startsWith("client.")) {
        values[condition.field] = getPathValue(context.client, condition.field);
      }
    }
  }

  return values;
}

export function evaluateJourneyTriggerFilter(input: {
  filter: JourneyTriggerFilterAst;
  context: JourneyTriggerFilterContext;
}): JourneyTriggerFilterEvaluationResult {
  const parsedFilter = journeyTriggerFilterAstSchema.safeParse(input.filter);
  if (!parsedFilter.success) {
    const hasUnsupportedOperatorIssue = parsedFilter.error.issues.some(
      (issue) => issue.path.at(-1) === "operator",
    );

    return {
      matched: false,
      error: {
        code: hasUnsupportedOperatorIssue
          ? "UNSUPPORTED_OPERATION"
          : "FILTER_VALIDATION_FAILED",
        message: "Invalid trigger filter payload",
        details: parsedFilter.error.issues,
      },
    };
  }

  const expressionResult = buildFilterExpression(parsedFilter.data);
  if (!expressionResult.ok) {
    return {
      matched: false,
      error: expressionResult.error,
    };
  }

  try {
    const checkResult = filterEnvironment.check(expressionResult.expression);
    if (!checkResult.valid) {
      return {
        matched: false,
        error: {
          code: "UNSUPPORTED_OPERATION",
          message: checkResult.error?.message ?? "CEL type-check failed",
        },
      };
    }

    const evaluationResult = filterEnvironment.evaluate(
      expressionResult.expression,
      {
        values: collectValues(parsedFilter.data, input.context),
      },
    );

    if (evaluationResult instanceof Promise) {
      return {
        matched: false,
        error: {
          code: "CEL_EVALUATION_FAILED",
          message: "Async CEL evaluation is not supported for journey filters",
        },
      };
    }

    return {
      matched: evaluationResult === true,
    };
  } catch (error: unknown) {
    return {
      matched: false,
      error: {
        code: "CEL_EVALUATION_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to evaluate trigger filter",
      },
    };
  }
}
