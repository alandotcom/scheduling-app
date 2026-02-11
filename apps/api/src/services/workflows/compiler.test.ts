import { describe, expect, test } from "bun:test";
import { compileWorkflowDocument } from "./compiler.js";

describe("workflow compiler", () => {
  test("compiles legacy trigger + steps payload deterministically", () => {
    const result = compileWorkflowDocument({
      trigger: { event: "appointment.created" },
      steps: [
        { id: "step_b", type: "notify", channel: "sms" },
        { id: "step_a", type: "wait", duration: "PT30M" },
      ],
    });

    expect(result.validation.valid).toBe(true);
    expect(result.compiledPlan).not.toBeNull();
    expect(result.compiledPlan).toMatchObject({
      planVersion: 1,
      trigger: {
        eventType: "appointment.created",
      },
      entryNodeIds: ["step_b"],
      nodes: [
        { id: "step_a", kind: "wait" },
        { id: "step_b", kind: "action" },
      ],
      edges: [{ source: "step_b", target: "step_a" }],
    });
  });

  test("returns invalid edge issues for dangling references", () => {
    const result = compileWorkflowDocument({
      trigger: { eventType: "client.created" },
      nodes: [
        { id: "n1", kind: "action", actionId: "send", integrationKey: "x" },
      ],
      edges: [{ id: "e1", source: "n1", target: "missing" }],
    });

    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_EDGE",
          edgeId: "e1",
        }),
      ]),
    );
    expect(result.compiledPlan).toBeNull();
  });
});
