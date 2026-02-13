import { describe, expect, test } from "bun:test";
import {
  resolveTriggerEventType,
  stableStringify,
  withWorkflowTriggerEventType,
} from "./draft";

describe("workflow-ui draft helpers", () => {
  test("reads trigger event from eventType or event", () => {
    expect(
      resolveTriggerEventType(
        {
          schemaVersion: 1,
          trigger: { eventType: "client.updated" },
          nodes: [],
          edges: [],
        },
        "appointment.created",
      ),
    ).toBe("client.updated");
    expect(
      resolveTriggerEventType(
        {
          schemaVersion: 1,
          trigger: { event: "client.created" },
          nodes: [],
          edges: [],
        },
        "appointment.created",
      ),
    ).toBe("client.created");
  });

  test("writes trigger event to both eventType and event", () => {
    expect(
      withWorkflowTriggerEventType(
        { schemaVersion: 1, nodes: [], edges: [] },
        "appointment.updated",
      ),
    ).toMatchObject({
      trigger: {
        event: "appointment.updated",
        eventType: "appointment.updated",
      },
    });
  });

  test("stableStringify sorts object keys", () => {
    const left = stableStringify({ b: 2, a: 1 });
    const right = stableStringify({ a: 1, b: 2 });
    expect(left).toBe(right);
  });
});
