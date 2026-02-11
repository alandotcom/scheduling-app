import { describe, expect, test } from "bun:test";
import {
  getCatalogTriggerEventTypes,
  resolveDefaultCatalogTriggerEventType,
} from "./catalog";

describe("workflow-ui catalog helpers", () => {
  test("uses catalog trigger event types when available", () => {
    expect(
      getCatalogTriggerEventTypes(
        [
          {
            eventType: "client.created",
            entityType: "client",
            defaultReplacementMode: "replace_active",
          },
        ],
        ["appointment.created"],
      ),
    ).toEqual(["client.created"]);
  });

  test("falls back to static trigger list when catalog is empty", () => {
    expect(
      getCatalogTriggerEventTypes(
        [],
        ["appointment.created", "client.created"],
      ),
    ).toEqual(["appointment.created", "client.created"]);
  });

  test("resolves first trigger event as default", () => {
    expect(
      resolveDefaultCatalogTriggerEventType(
        [
          {
            eventType: "calendar.created",
            entityType: "calendar",
            defaultReplacementMode: "replace_active",
          },
        ],
        "appointment.created",
      ),
    ).toBe("calendar.created");
  });
});
