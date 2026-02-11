import { describe, expect, test } from "bun:test";
import {
  getWorkflowGraphDocumentFromDraft,
  getTriggerEventTypeFromDraft,
  stableStringify,
  withDraftGraphDocument,
  withDraftTriggerEventType,
} from "./draft";

describe("workflow-ui draft helpers", () => {
  test("reads trigger event from eventType or event", () => {
    expect(
      getTriggerEventTypeFromDraft(
        { trigger: { eventType: "client.updated" } },
        "appointment.created",
      ),
    ).toBe("client.updated");
    expect(
      getTriggerEventTypeFromDraft(
        { trigger: { event: "client.created" } },
        "appointment.created",
      ),
    ).toBe("client.created");
  });

  test("writes trigger event to both eventType and event", () => {
    expect(withDraftTriggerEventType({}, "appointment.updated")).toMatchObject({
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

  test("extracts graph document from draft and defaults empty graph", () => {
    expect(
      getWorkflowGraphDocumentFromDraft({
        schemaVersion: 1,
        nodes: [{ id: "n1", kind: "terminal", terminalType: "complete" }],
        edges: [],
      }),
    ).toMatchObject({
      schemaVersion: 1,
      nodes: [{ id: "n1", kind: "terminal" }],
      edges: [],
    });

    expect(getWorkflowGraphDocumentFromDraft({})).toMatchObject({
      schemaVersion: 1,
      nodes: [],
      edges: [],
    });
  });

  test("writes graph document back into workflow draft", () => {
    expect(
      withDraftGraphDocument(
        { trigger: { event: "client.created" } },
        {
          schemaVersion: 1,
          trigger: { event: "client.created" },
          nodes: [{ id: "n1", kind: "terminal", terminalType: "complete" }],
          edges: [],
        },
      ),
    ).toMatchObject({
      schemaVersion: 1,
      nodes: [{ id: "n1", kind: "terminal", terminalType: "complete" }],
      edges: [],
    });
  });
});
