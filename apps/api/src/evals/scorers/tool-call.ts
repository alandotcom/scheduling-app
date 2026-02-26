import { createScorer } from "evalite";
import type { EvalOutput } from "../task.js";

/**
 * Scores whether the expected tools were called (and forbidden tools were not).
 * Returns a score between 0 and 1 based on the percentage of expectations met.
 */
export const toolSelectionScorer = createScorer<
  unknown,
  EvalOutput,
  { expectedTools: string[]; forbiddenTools?: string[] }
>({
  name: "Tool Selection",
  description:
    "Checks that expected tools were called and forbidden tools were not",
  scorer: ({ output, expected }) => {
    if (!expected) return 0;

    const calledToolNames = new Set(output.toolCalls.map((tc) => tc.toolName));
    const checks: boolean[] = [];

    // Check each expected tool was called
    for (const tool of expected.expectedTools) {
      checks.push(calledToolNames.has(tool));
    }

    // Check no forbidden tools were called
    if (expected.forbiddenTools) {
      for (const tool of expected.forbiddenTools) {
        checks.push(!calledToolNames.has(tool));
      }
    }

    if (checks.length === 0) return 1;
    const passed = checks.filter(Boolean).length;
    return passed / checks.length;
  },
});

/**
 * Scores whether specific argument values are present in tool calls.
 * Checks partial matches — each expected arg key/value pair is verified.
 */
export const toolArgScorer = createScorer<
  unknown,
  EvalOutput,
  { toolName: string; expectedArgs: Record<string, unknown> }[]
>({
  name: "Tool Arguments",
  description: "Checks specific argument values on tool calls",
  scorer: ({ output, expected }) => {
    if (!expected || expected.length === 0) return 1;

    const checks: boolean[] = [];

    for (const expectation of expected) {
      const matchingCalls = output.toolCalls.filter(
        (tc) => tc.toolName === expectation.toolName,
      );

      if (matchingCalls.length === 0) {
        // Tool wasn't called at all — fail all arg checks for it
        checks.push(false);
        continue;
      }

      // Check if any of the matching calls satisfy the expected args
      const anyMatch = matchingCalls.some((tc) =>
        Object.entries(expectation.expectedArgs).every(
          ([key, value]) => tc.args[key] === value,
        ),
      );
      checks.push(anyMatch);
    }

    if (checks.length === 0) return 1;
    const passed = checks.filter(Boolean).length;
    return passed / checks.length;
  },
});
