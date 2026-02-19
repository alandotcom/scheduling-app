type ActionConfigFieldBase = {
  key: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "number"
    | "select"
    | "expression"
    | "key_value_list";
  placeholder?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addButtonLabel?: string;
  helpText?: string;
  defaultValue?: string;
  options?: { value: string; label: string }[];
  rows?: number;
  min?: number;
  required?: boolean;
  showWhen?: { field: string; equals: string };
};

type ActionConfigFieldGroup = {
  label: string;
  type: "group";
  fields: ActionConfigFieldBase[];
  defaultExpanded?: boolean;
};

type ActionConfigField = ActionConfigFieldBase | ActionConfigFieldGroup;

type ActionDefinition = {
  id: string;
  label: string;
  defaultNodeLabel: string;
  description: string;
  category: string;
  icon: string;
  integrationKey?: "resend" | "slack" | "twilio";
  channel?: string;
  devOnly?: boolean;
  outputAttributes?: string[];
  configFields: ActionConfigField[];
};

const actionMap = new Map<string, ActionDefinition>();

export function registerAction(def: ActionDefinition): void {
  actionMap.set(def.id, def);
}

export function getAction(id: string): ActionDefinition | undefined {
  return actionMap.get(id);
}

export function getAllActions(): ActionDefinition[] {
  return [...actionMap.values()];
}

export function getActionsByCategory(): Map<string, ActionDefinition[]> {
  const categories = new Map<string, ActionDefinition[]>();
  for (const action of actionMap.values()) {
    const list = categories.get(action.category) ?? [];
    list.push(action);
    categories.set(action.category, list);
  }
  return categories;
}

export function isFieldGroup(
  field: ActionConfigField,
): field is ActionConfigFieldGroup {
  return field.type === "group";
}

export function isDeliveryAction(actionType: string): boolean {
  return getAction(actionType)?.channel != null;
}

export function getActionChannel(actionType: string): string | undefined {
  return getAction(actionType)?.channel;
}

export function getRegisteredActionIds(): string[] {
  return [...actionMap.keys()];
}

// --- Journey v1 steps ---

registerAction({
  id: "wait",
  label: "Wait",
  defaultNodeLabel: "Wait",
  description: "Pause execution using time-based scheduling.",
  category: "System",
  icon: "hourglass",
  configFields: [
    {
      key: "waitDelayTimingMode",
      label: "Time Input Mode",
      type: "select",
      defaultValue: "duration",
      helpText:
        "Pick one mode. Switching modes clears fields that do not apply.",
      options: [
        { value: "duration", label: "Wait for duration" },
        { value: "until", label: "Wait until date/time" },
      ],
    },
    {
      key: "waitDuration",
      label: "Wait for (duration)",
      type: "expression",
      placeholder: "24h, 90m, 3600000, or P1D",
      helpText: "Example: use 24h to continue one day later.",
      showWhen: { field: "waitDelayTimingMode", equals: "duration" },
    },
    {
      key: "waitUntil",
      label: "Wait until this date/time",
      type: "expression",
      placeholder: "2026-03-10T09:00:00-05:00 or @Appointment.data.startAt",
      helpText:
        "Use this when timing comes from payload data, like an appointment start time.",
      showWhen: { field: "waitDelayTimingMode", equals: "until" },
    },
    {
      key: "waitOffset",
      label: "Send before/after that time (optional)",
      type: "expression",
      placeholder: "-1d, 6h, 30m",
      helpText: "Example: -1d sends one day before the target time.",
      showWhen: { field: "waitDelayTimingMode", equals: "until" },
    },
    {
      key: "waitGateMode",
      label: "Continue only if time actually elapsed",
      type: "select",
      defaultValue: "off",
      options: [
        { value: "off", label: "Off (continue immediately)" },
        { value: "require_actual_wait", label: "Skip branch when already due" },
      ],
      helpText:
        "Prevents immediate sends when computed time is now or in the past after an update.",
    },
    {
      key: "waitTimezone",
      label: "Timezone (optional)",
      type: "text",
      placeholder: "UTC",
      helpText: "Used when the target date/time does not include an offset.",
    },
  ],
});

registerAction({
  id: "send-resend",
  label: "Send Email",
  defaultNodeLabel: "Resend",
  description: "Deliver an outbound email with Resend.",
  category: "Resend",
  icon: "flash",
  integrationKey: "resend",
  channel: "email",
  configFields: [
    {
      key: "subject",
      label: "Email subject",
      type: "text",
      placeholder: "Reminder for @Appointment.data.startAt",
      helpText: "Type @ to autocomplete trigger or upstream attributes.",
      required: true,
    },
    {
      key: "message",
      label: "Email body",
      type: "textarea",
      rows: 5,
      placeholder:
        "Appointment for @Appointment.data.client.firstName starts at @Appointment.data.startAt.",
      helpText: "Type @ to autocomplete trigger or upstream attributes.",
      required: true,
    },
    {
      key: "fromName",
      label: "From name (optional)",
      type: "text",
      placeholder: "Acme Scheduling",
      helpText:
        "Leave blank to use the integration default sender name. Type @ to autocomplete workflow values.",
    },
    {
      key: "fromAddress",
      label: "From address (optional)",
      type: "text",
      placeholder: "notifications@example.com",
      helpText:
        "Leave blank to use the integration default sender address. Type @ to autocomplete workflow values.",
    },
    {
      key: "cc",
      label: "CC (optional)",
      type: "text",
      placeholder: "ops@example.com, manager@example.com",
      helpText:
        "Comma-separated email addresses. Type @ to autocomplete workflow values.",
    },
    {
      key: "bcc",
      label: "BCC (optional)",
      type: "text",
      placeholder: "audit@example.com, archive@example.com",
      helpText:
        "Comma-separated email addresses. Type @ to autocomplete workflow values.",
    },
    {
      key: "testBehavior",
      label: "Test mode behavior",
      type: "select",
      defaultValue: "log_only",
      options: [
        { value: "log_only", label: "Log only (never send externally)" },
        {
          value: "route_to_integration_test_recipient",
          label: "Route to integration test recipient",
        },
      ],
      helpText:
        "Applies only in workflow Test mode. If routing is selected but no integration test recipient is configured, delivery safely falls back to log-only.",
    },
  ],
});

registerAction({
  id: "send-resend-template",
  label: "Send Email Template",
  defaultNodeLabel: "Resend Template",
  description: "Deliver an outbound email from a Resend template.",
  category: "Resend",
  icon: "flash",
  integrationKey: "resend",
  channel: "email",
  configFields: [
    {
      key: "templateIdOrAlias",
      label: "Template ID or alias",
      type: "text",
      placeholder: "order-confirmation",
      helpText:
        "Use a template ID or alias from Resend. Type @ to autocomplete workflow values.",
      required: true,
    },
    {
      key: "fromName",
      label: "From name (optional)",
      type: "text",
      placeholder: "Acme Scheduling",
      helpText:
        "Leave blank to use the integration default sender name. Type @ to autocomplete workflow values.",
    },
    {
      key: "fromAddress",
      label: "From address (optional)",
      type: "text",
      placeholder: "notifications@example.com",
      helpText:
        "Leave blank to use the integration default sender address. Type @ to autocomplete workflow values.",
    },
    {
      key: "cc",
      label: "CC (optional)",
      type: "text",
      placeholder: "ops@example.com, manager@example.com",
      helpText:
        "Comma-separated email addresses. Type @ to autocomplete workflow values.",
    },
    {
      key: "bcc",
      label: "BCC (optional)",
      type: "text",
      placeholder: "audit@example.com, archive@example.com",
      helpText:
        "Comma-separated email addresses. Type @ to autocomplete workflow values.",
    },
    {
      key: "templateVariables",
      label: "Template variables",
      type: "key_value_list",
      keyPlaceholder: "PRODUCT",
      valuePlaceholder: "Vintage Macintosh or @Appointment.data.client.email",
      addButtonLabel: "Add variable",
      helpText:
        "Add zero or more key/value pairs. Values support @ variable autocomplete.",
    },
    {
      key: "testBehavior",
      label: "Test mode behavior",
      type: "select",
      defaultValue: "log_only",
      options: [
        { value: "log_only", label: "Log only (never send externally)" },
        {
          value: "route_to_integration_test_recipient",
          label: "Route to integration test recipient",
        },
      ],
      helpText:
        "Applies only in workflow Test mode. If routing is selected but no integration test recipient is configured, delivery safely falls back to log-only.",
    },
  ],
});

registerAction({
  id: "send-slack",
  label: "Send Channel Message",
  defaultNodeLabel: "Slack",
  description: "Deliver an outbound Slack message.",
  category: "Slack",
  icon: "flash",
  integrationKey: "slack",
  channel: "slack",
  configFields: [
    {
      key: "slackChannel",
      label: "Slack channel",
      type: "text",
      placeholder: "#ops-alerts",
      helpText: "Type @ to autocomplete trigger or upstream attributes.",
      required: true,
    },
    {
      key: "message",
      label: "Slack message",
      type: "textarea",
      rows: 5,
      placeholder:
        "Appointment for @Appointment.data.client.firstName moved to @Appointment.data.startAt.",
      helpText: "Type @ to autocomplete trigger or upstream attributes.",
      required: true,
    },
    {
      key: "testBehavior",
      label: "Test mode behavior",
      type: "select",
      defaultValue: "log_only",
      options: [
        { value: "log_only", label: "Log only (never send externally)" },
      ],
      helpText:
        "Slack actions are always forced to log-only in workflow Test mode.",
    },
  ],
});

registerAction({
  id: "send-twilio",
  label: "Send SMS",
  defaultNodeLabel: "Twilio SMS",
  description: "Deliver an outbound SMS message with Twilio.",
  category: "Twilio",
  icon: "flash",
  integrationKey: "twilio",
  channel: "sms",
  configFields: [
    {
      key: "toPhone",
      label: "Recipient phone (optional)",
      type: "text",
      placeholder: "@Appointment.data.client.phone",
      helpText:
        "Leave blank to send to the trigger client's phone. Use E.164 format (+14155552671) when entering static values. Type @ to autocomplete workflow values.",
      required: false,
    },
    {
      key: "message",
      label: "SMS message",
      type: "textarea",
      rows: 4,
      placeholder:
        "Hi @Appointment.data.client.firstName, your appointment is at @Appointment.data.startAt.",
      helpText: "Type @ to autocomplete trigger or upstream attributes.",
      required: true,
    },
    {
      key: "testBehavior",
      label: "Test mode behavior",
      type: "select",
      defaultValue: "log_only",
      options: [
        { value: "log_only", label: "Log only (never send externally)" },
        {
          value: "route_to_integration_test_recipient",
          label: "Route to integration test recipient",
        },
      ],
      helpText:
        "Applies only in workflow Test mode. If routing is selected but no integration test recipient is configured, delivery safely falls back to log-only.",
    },
  ],
});

registerAction({
  id: "condition",
  label: "Condition",
  defaultNodeLabel: "Condition",
  description: "Route to True/False paths using a rule expression.",
  category: "System",
  icon: "flash",
  configFields: [
    {
      key: "expression",
      label: "Expression",
      type: "expression",
      placeholder: 'appointment.startAt > timestamp("2026-01-01T00:00:00Z")',
      helpText:
        "Evaluates once during planning. True follows the True branch; False follows the False branch.",
      required: true,
    },
  ],
});

registerAction({
  id: "logger",
  label: "Logger",
  defaultNodeLabel: "Logger",
  description: "Record a structured runtime log line.",
  category: "System",
  icon: "flash",
  channel: "log",
  configFields: [
    {
      key: "message",
      label: "Message",
      type: "expression",
      placeholder: "Workflow log message (@Action1.createdAt)",
      helpText:
        "Type freeform text and use @ to autocomplete upstream node outputs.",
      required: true,
    },
    {
      key: "testBehavior",
      label: "Test mode behavior",
      type: "select",
      defaultValue: "log_only",
      options: [{ value: "log_only", label: "Log only" }],
      helpText:
        "Logger entries remain internal and are safe in workflow Test mode.",
    },
  ],
});

export type {
  ActionConfigField,
  ActionConfigFieldBase,
  ActionConfigFieldGroup,
  ActionDefinition,
};
