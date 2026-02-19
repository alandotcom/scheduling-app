import { describe, expect, test } from "bun:test";
import {
  getActionDefaultNodeLabel,
  getActionVisualSpec,
  isDefaultActionNodeLabel,
  isGenericActionNodeLabel,
} from "./action-visuals";

describe("action-visuals", () => {
  test("returns service-style default labels for send actions", () => {
    expect(getActionDefaultNodeLabel("send-slack")).toBe("Slack");
    expect(getActionDefaultNodeLabel("send-resend")).toBe("Resend");
    expect(getActionDefaultNodeLabel("send-resend-template")).toBe(
      "Resend Template",
    );
    expect(getActionDefaultNodeLabel("send-twilio")).toBe("Twilio SMS");
  });

  test("uses brand logos for Slack, Resend, and Twilio actions", () => {
    const slackVisual = getActionVisualSpec("send-slack");
    const resendVisual = getActionVisualSpec("send-resend");
    const resendTemplateVisual = getActionVisualSpec("send-resend-template");
    const twilioVisual = getActionVisualSpec("send-twilio");

    expect(slackVisual.brandIcon).toBeDefined();
    expect(resendVisual.brandIcon).toBeDefined();
    expect(resendTemplateVisual.brandIcon).toBeDefined();
    expect(twilioVisual.brandIcon).toBeDefined();
    expect(slackVisual.brandLabel).toBe("Slack");
    expect(resendVisual.brandLabel).toBe("Resend");
    expect(resendTemplateVisual.brandLabel).toBe("Resend Template");
    expect(twilioVisual.brandLabel).toBe("Twilio SMS");
  });

  test("detects generic action labels", () => {
    expect(isGenericActionNodeLabel("Action")).toBe(true);
    expect(isGenericActionNodeLabel("Action 12")).toBe(true);
    expect(isGenericActionNodeLabel("Slack")).toBe(false);
    expect(isGenericActionNodeLabel("Post-booking follow-up")).toBe(false);
  });

  test("detects action default labels", () => {
    expect(isDefaultActionNodeLabel("Slack")).toBe(true);
    expect(isDefaultActionNodeLabel("Resend")).toBe(true);
    expect(isDefaultActionNodeLabel("Resend Template")).toBe(true);
    expect(isDefaultActionNodeLabel("Send Email")).toBe(true);
    expect(isDefaultActionNodeLabel("Send Email Template")).toBe(true);
    expect(isDefaultActionNodeLabel("Send Channel Message")).toBe(true);
    expect(isDefaultActionNodeLabel("Send SMS")).toBe(true);
    expect(isDefaultActionNodeLabel("Twilio SMS")).toBe(true);
    expect(isDefaultActionNodeLabel("Post-booking follow-up")).toBe(false);
  });
});
