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

  test("returns error for unknown action definitions", () => {
    const result = compileWorkflowDocument({
      trigger: { eventType: "client.created" },
      nodes: [
        {
          id: "n1",
          kind: "action",
          actionId: "custom.unknownAction",
          integrationKey: "custom",
          input: {},
        },
      ],
      edges: [],
    });

    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_INTEGRATION",
          nodeId: "n1",
          field: "actionId",
        }),
      ]),
    );
  });

  test("validates registered action input shape", () => {
    const result = compileWorkflowDocument({
      trigger: { eventType: "client.created" },
      nodes: [
        {
          id: "n1",
          kind: "action",
          actionId: "resend.sendEmail",
          integrationKey: "resend",
          input: { to: "invalid-email", subject: "Hello", body: "Hi" },
        },
      ],
      edges: [],
    });

    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_EXPRESSION",
          nodeId: "n1",
          field: "input",
        }),
      ]),
    );
  });

  test("accepts valid registered actions and emits deterministic compiled plan", () => {
    const result = compileWorkflowDocument({
      trigger: { eventType: "client.created" },
      nodes: [
        {
          id: "n1",
          kind: "action",
          actionId: "resend.sendEmail",
          integrationKey: "resend",
          input: {
            to: "user@example.com",
            subject: "Welcome",
            body: "Hello",
          },
        },
      ],
      edges: [],
    });

    expect(result.validation.valid).toBe(true);
    expect(result.compiledPlan).toMatchObject({
      trigger: { eventType: "client.created" },
      nodes: [
        {
          id: "n1",
          kind: "action",
          actionId: "resend.sendEmail",
          integrationKey: "resend",
        },
      ],
    });
  });
});
