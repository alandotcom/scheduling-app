import { gateway } from "@ai-sdk/gateway";
import { generateText, stepCountIs, type ModelMessage } from "ai";
import { wrapAISDKModel } from "evalite/ai-sdk";
import { buildSystemPrompt } from "../routes/assistant-defs.js";
import type { MockFixtures } from "./fixtures/index.js";
import { buildMockAssistantTools } from "./mock-tools.js";

export interface EvalInput {
  messages: ModelMessage[];
  fixtures: MockFixtures;
  now?: Date;
}

export interface EvalToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export interface EvalStep {
  text: string;
  toolCalls: EvalToolCall[];
  toolResults: Array<{
    toolName: string;
    result: unknown;
  }>;
}

export interface EvalOutput {
  text: string;
  toolCalls: EvalToolCall[];
  steps: EvalStep[];
  stepCount: number;
}

function extractToolCall(
  tc: { toolName: string } & Record<string, unknown>,
): EvalToolCall {
  const rawArgs = tc["args"];
  const args: Record<string, unknown> =
    rawArgs != null && typeof rawArgs === "object"
      ? Object.fromEntries(Object.entries(rawArgs))
      : {};
  return { toolName: tc.toolName, args };
}

export async function runAssistant(input: EvalInput): Promise<EvalOutput> {
  const modelId =
    process.env["EVAL_MODEL"] ??
    process.env["ASSISTANT_MODEL"] ??
    "google/gemini-2.5-flash";
  const model = wrapAISDKModel(gateway(modelId));
  const tools = buildMockAssistantTools(input.fixtures);
  const now = input.now ?? new Date("2026-03-15T10:00:00Z");

  const result = await generateText({
    model,
    system: buildSystemPrompt(now),
    messages: input.messages,
    tools,
    stopWhen: stepCountIs(8),
  });

  const allToolCalls = result.steps.flatMap((s) =>
    s.toolCalls.map((tc) => extractToolCall(tc)),
  );

  return {
    text: result.text,
    toolCalls: allToolCalls,
    stepCount: result.steps.length,
    steps: result.steps.map((s) => ({
      text: s.text,
      toolCalls: s.toolCalls.map((tc) => extractToolCall(tc)),
      toolResults: s.toolResults.map((tr) => ({
        toolName: tr.toolName,
        result: "result" in tr ? tr.result : undefined,
      })),
    })),
  };
}
