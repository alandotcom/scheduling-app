import { createScorer } from "evalite";
import type { EvalOutput } from "../task.js";

const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MARKDOWN_TABLE_REGEX = /\|.*\|.*\|/;

/**
 * Scores response quality based on the assistant's system prompt rules:
 * - Concise text (penalize >300 chars)
 * - No markdown tables
 * - No UUIDs leaked in response text
 * - No numbered lists of data
 */
export const responseQualityScorer = createScorer<unknown, EvalOutput, unknown>(
  {
    name: "Response Quality",
    description:
      "Checks conciseness, no markdown tables, no UUIDs, no data lists in text",
    scorer: ({ output }) => {
      const text = output.text;
      const checks: { passed: boolean; weight: number }[] = [];

      // Conciseness: text should be short (1 sentence, usually a fragment)
      // Under 150 chars = full marks, 150-300 = partial, >300 = 0
      if (text.length <= 150) {
        checks.push({ passed: true, weight: 2 });
      } else if (text.length <= 300) {
        checks.push({ passed: true, weight: 1 });
      } else {
        checks.push({ passed: false, weight: 2 });
      }

      // No markdown tables in text
      checks.push({
        passed: !MARKDOWN_TABLE_REGEX.test(text),
        weight: 1,
      });

      // No UUIDs leaked in text
      checks.push({
        passed: !UUID_REGEX.test(text),
        weight: 1,
      });

      // No numbered lists of records (e.g., "1. Ada Lovelace..." or "1) Ada...")
      const numberedListPattern = /^\s*\d+[.)]\s+/m;
      checks.push({
        passed: !numberedListPattern.test(text),
        weight: 1,
      });

      const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
      const passedWeight = checks
        .filter((c) => c.passed)
        .reduce((sum, c) => sum + c.weight, 0);

      return {
        score: passedWeight / totalWeight,
        metadata: {
          textLength: text.length,
          hasMarkdownTable: MARKDOWN_TABLE_REGEX.test(text),
          hasUUID: UUID_REGEX.test(text),
          hasNumberedList: /^\s*\d+[.)]\s+/m.test(text),
        },
      };
    },
  },
);
