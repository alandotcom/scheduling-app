import { Environment } from "@marcbachmann/cel-js";
import { DateTime } from "luxon";

export type JourneyConditionContext = {
  appointment: Record<string, unknown>;
  client: Record<string, unknown>;
};

export type JourneyConditionEvaluationErrorCode =
  | "CONDITION_EXPRESSION_INVALID"
  | "CONDITION_CEL_TYPECHECK_FAILED"
  | "CONDITION_CEL_EVALUATION_FAILED";

export type JourneyConditionEvaluationError = {
  code: JourneyConditionEvaluationErrorCode;
  message: string;
};

export type JourneyConditionEvaluationResult = {
  matched: boolean;
  error?: JourneyConditionEvaluationError;
};

const DEFAULT_ORG_TIMEZONE = "UTC";
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseConditionDateValue(value: string, timezone: string): Date {
  const normalized = value.trim();
  const hasExplicitTimezone = /(?:z|[+-]\d{2}:\d{2})$/i.test(normalized);
  const parsed = DATE_ONLY_PATTERN.test(normalized)
    ? DateTime.fromISO(normalized, { zone: timezone }).startOf("day")
    : hasExplicitTimezone
      ? DateTime.fromISO(normalized, { setZone: true })
      : DateTime.fromISO(normalized, { zone: timezone });

  if (!parsed.isValid) {
    throw new Error(`Invalid date literal "${value}"`);
  }

  return parsed.toUTC().toJSDate();
}

const conditionEnvironment = new Environment({
  unlistedVariablesAreDyn: false,
  limits: {
    maxAstNodes: 512,
    maxDepth: 64,
    maxListElements: 128,
    maxMapEntries: 128,
    maxCallArguments: 8,
  },
})
  .registerVariable("appointment", "map")
  .registerVariable("client", "map")
  .registerVariable("now", "dyn")
  .registerVariable("orgTimezone", "string")
  .registerFunction("date(string): dyn", (value) =>
    parseConditionDateValue(value, DEFAULT_ORG_TIMEZONE),
  )
  .registerFunction("date(string, string): dyn", (value, timezone) =>
    parseConditionDateValue(value, timezone),
  );

export function evaluateJourneyConditionExpression(input: {
  expression: unknown;
  context: JourneyConditionContext;
  now?: Date;
  orgTimezone?: string;
}): JourneyConditionEvaluationResult {
  if (
    typeof input.expression !== "string" ||
    input.expression.trim().length === 0
  ) {
    return {
      matched: false,
      error: {
        code: "CONDITION_EXPRESSION_INVALID",
        message: "Condition expression must be a non-empty rule",
      },
    };
  }

  try {
    const checkResult = conditionEnvironment.check(input.expression);
    if (!checkResult.valid) {
      return {
        matched: false,
        error: {
          code: "CONDITION_CEL_TYPECHECK_FAILED",
          message: checkResult.error?.message ?? "Expression validation failed",
        },
      };
    }

    const evaluated = conditionEnvironment.evaluate(input.expression, {
      appointment: input.context.appointment,
      client: input.context.client,
      now: input.now ?? new Date(),
      orgTimezone: input.orgTimezone ?? DEFAULT_ORG_TIMEZONE,
    });

    if (evaluated instanceof Promise) {
      return {
        matched: false,
        error: {
          code: "CONDITION_CEL_EVALUATION_FAILED",
          message: "Async evaluation is not supported for journey conditions",
        },
      };
    }

    if (typeof evaluated !== "boolean") {
      return {
        matched: false,
        error: {
          code: "CONDITION_CEL_EVALUATION_FAILED",
          message: "Condition expression must evaluate to a boolean",
        },
      };
    }

    return {
      matched: evaluated,
    };
  } catch (error: unknown) {
    return {
      matched: false,
      error: {
        code: "CONDITION_CEL_EVALUATION_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to evaluate condition expression",
      },
    };
  }
}
