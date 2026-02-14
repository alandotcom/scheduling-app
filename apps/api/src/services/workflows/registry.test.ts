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

  test("resolves registered first-party action definitions", () => {
    expect(getWorkflowActionDefinition("core.emitInternalEvent")).toMatchObject(
      {
        id: "core.emitInternalEvent",
        category: "Core",
      },
    );
    expect(getWorkflowActionDefinition("logger.logMessage")).toMatchObject({
      id: "logger.logMessage",
      category: "Integrations",
      requiresIntegration: {
        key: "logger",
      },
    });
    expect(getWorkflowActionDefinition("resend.sendEmail")).toMatchObject({
      id: "resend.sendEmail",
      category: "Integrations",
      requiresIntegration: {
        key: "resend",
      },
    });

    expect(getWorkflowActionDefinition("missing.action")).toBeNull();
    expect(
      listWorkflowActionDefinitions().some(
        (action) => action.id === "logger.logMessage",
      ),
    ).toBe(true);
    expect(
      listWorkflowActionDefinitions().some(
        (action) => action.id === "resend.sendEmail",
      ),
    ).toBe(true);
  });

  test("executes registered actions with validated input", async () => {
    const result = await executeWorkflowAction({
      actionId: "core.emitInternalEvent",
      rawInput: {
        eventType: "workflow.intent.created",
        payload: { clientId: "client_1" },
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
      channel: "core.emitInternalEvent",
      target: "client:entity_1",
      output: {
        eventType: "workflow.intent.created",
      },
    });
  });

  test("returns invalid_action for unknown action IDs", async () => {
    const result = await executeWorkflowAction({
      actionId: "unknown.action",
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

  test("returns invalid_action for invalid action input", async () => {
    const result = await executeWorkflowAction({
      actionId: "core.emitInternalEvent",
      rawInput: {
        payload: { any: "value" },
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

  test("validates resend action mode-specific input requirements", async () => {
    const missingBodyResult = await executeWorkflowAction({
      actionId: "resend.sendEmail",
      rawInput: {
        to: "client@example.com",
        subject: "Hello",
        mode: "content",
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

    expect(missingBodyResult).toMatchObject({
      status: "invalid_action",
    });

    const invalidTemplateResult = await executeWorkflowAction({
      actionId: "resend.sendEmail",
      rawInput: {
        to: "client@example.com",
        subject: "Hello",
        mode: "template",
        templateId: "tmpl_123",
        templateData: "not-json",
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

    expect(invalidTemplateResult).toMatchObject({
      status: "invalid_action",
    });
  });
});
