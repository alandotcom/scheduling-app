import { createScorer } from "evalite";
import type { EvalOutput } from "../task.js";

const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const PROPOSAL_TOOLS = new Set([
  "proposeBookAppointment",
  "proposeRescheduleAppointment",
  "proposeConfirmAppointment",
  "proposeCancelAppointment",
  "proposeNoShowAppointment",
]);

/**
 * Scores the quality of proposals produced by proposal tools:
 * - Proposal tools should include a `summary` arg
 * - Summary should not contain UUIDs
 * - Summary should be descriptive enough (>15 chars)
 */
export const proposalQualityScorer = createScorer<unknown, EvalOutput, unknown>(
  {
    name: "Proposal Quality",
    description:
      "Checks proposal summaries are present, descriptive, and UUID-free",
    scorer: ({ output }) => {
      const proposalCalls = output.toolCalls.filter((tc) =>
        PROPOSAL_TOOLS.has(tc.toolName),
      );

      // No proposal tools called — scorer not applicable, return perfect score
      if (proposalCalls.length === 0) return 1;

      const checks: boolean[] = [];

      for (const tc of proposalCalls) {
        const rawSummary = tc.args["summary"];
        const summary = typeof rawSummary === "string" ? rawSummary : undefined;

        // Should have a summary
        const hasSummary = typeof summary === "string" && summary.length > 0;
        checks.push(hasSummary);

        if (hasSummary) {
          // Summary should not contain UUIDs
          checks.push(!UUID_REGEX.test(summary));
          // Summary should be descriptive (>15 chars)
          checks.push(summary.length > 15);
        }
      }

      if (checks.length === 0) return 1;
      const passed = checks.filter(Boolean).length;
      return passed / checks.length;
    },
  },
);
