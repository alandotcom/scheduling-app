import { describe, expect, test } from "bun:test";
import {
  executeWorkflowAction,
  getWorkflowActionDefinition,
  listWorkflowActionDefinitions,
  listWorkflowTriggerDefinitions,
} from "./registry.js";

describe("workflow registry", () => {
  test("exposes domain-event and schedule trigger definitions", () => {
    const triggers = listWorkflowTriggerDefinitions();
    expect(triggers.length).toBeGreaterThan(0);
    expect(
      triggers.some(
        (trigger) =>
          trigger.type === "domain_event" && trigger.domain === "client",
      ),
    ).toBe(true);
    expect(triggers.some((trigger) => trigger.type === "schedule")).toBe(true);
  });

  test("resolves registered action definitions", () => {
    expect(getWorkflowActionDefinition("resend.sendEmail")).toMatchObject({
      id: "resend.sendEmail",
      integrationKey: "resend",
    });

    expect(getWorkflowActionDefinition("missing.action")).toBeNull();
  });

  test("executes registered actions with validated input", async () => {
    const result = await executeWorkflowAction({
      actionId: "resend.sendEmail",
      integrationKey: "resend",
      rawInput: {
        to: "user@example.com",
        subject: "Welcome",
        body: "Hello",
      },
      context: {
        orgId: "org_1",
        entityType: "client",
        entityId: "entity_1",
        sourceEventType: "client.created",
        sourceEventPayload: {},
        entity: {},
      },
    });

    expect(result).toMatchObject({
      status: "ok",
      channel: "integration.resend.sendEmail",
      target: "user@example.com",
    });
  });

  test("returns invalid_action for unknown action IDs", async () => {
    const result = await executeWorkflowAction({
      actionId: "unknown.action",
      integrationKey: null,
      rawInput: {},
      context: {
        orgId: "org_1",
        entityType: "client",
        entityId: "entity_1",
        sourceEventType: "client.created",
        sourceEventPayload: {},
        entity: {},
      },
    });

    expect(result).toMatchObject({
      status: "invalid_action",
    });
  });

  test("returns invalid_action for integration mismatch", async () => {
    const action = listWorkflowActionDefinitions().find(
      (definition) => definition.id === "twilio.sendSms",
    );
    expect(action).toBeDefined();

    const result = await executeWorkflowAction({
      actionId: "twilio.sendSms",
      integrationKey: "resend",
      rawInput: {
        to: "+15555555555",
        body: "Hi",
      },
      context: {
        orgId: "org_1",
        entityType: "client",
        entityId: "entity_1",
        sourceEventType: "client.updated",
        sourceEventPayload: {},
        entity: {},
      },
    });

    expect(result).toMatchObject({
      status: "invalid_action",
    });
  });
});
