import { describe, expect, test } from "bun:test";
import {
  getTriggerEventTypeFromDraft,
  stableStringify,
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
});
