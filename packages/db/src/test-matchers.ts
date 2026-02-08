import { expect } from "bun:test";

declare module "bun:test" {
  interface Matchers<_T> {
    toRejectWith(pattern?: string | RegExp): Promise<void>;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function collectErrorText(error: unknown): string[] {
  const seen = new Set<unknown>();
  const text: string[] = [];

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);

    const record = value as Record<string, unknown>;
    for (const key of [
      "message",
      "constraint",
      "code",
      "errno",
      "detail",
      "schema",
      "table",
      "routine",
      "query",
    ]) {
      const field = record[key];
      if (typeof field === "string" && field.length > 0) {
        text.push(field);
      }
    }

    if ("cause" in record) {
      visit(record["cause"]);
    }
  };

  if (typeof error === "string") {
    return [error];
  }

  if (error instanceof Error) {
    text.push(error.message);
  } else if (error != null) {
    text.push(String(error));
  }

  visit(error);
  return text;
}

expect.extend({
  async toRejectWith(
    received: unknown,
    pattern?: string | RegExp,
  ): Promise<{ pass: boolean; message: () => string }> {
    let promise: Promise<unknown> | null = null;

    if (
      received &&
      typeof received === "object" &&
      "execute" in received &&
      typeof received.execute === "function"
    ) {
      promise = received.execute() as Promise<unknown>;
    } else if (
      received &&
      typeof received === "object" &&
      "then" in received &&
      typeof received.then === "function"
    ) {
      promise = received as Promise<unknown>;
    }

    if (!promise) {
      return {
        pass: false,
        message: () =>
          "Expected a promise or query object with execute() for toRejectWith()",
      };
    }

    try {
      await promise;
      return {
        pass: false,
        message: () =>
          `Expected query to reject${pattern ? ` matching ${pattern}` : ""}`,
      };
    } catch (error) {
      if (!pattern) {
        return {
          pass: true,
          message: () => "Expected query not to reject",
        };
      }

      const message = toErrorMessage(error);
      const haystack = collectErrorText(error).join("\n");
      const matches =
        pattern instanceof RegExp
          ? pattern.test(haystack)
          : haystack.includes(pattern);

      return {
        pass: matches,
        message: () => `Expected error matching ${pattern}, got: "${message}"`,
      };
    }
  },
});
