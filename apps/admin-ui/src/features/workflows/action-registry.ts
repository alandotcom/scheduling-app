type ActionConfigFieldBase = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "expression";
  placeholder?: string;
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
  description: string;
  category: string;
  icon: string;
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

// --- Journey v1 steps ---

registerAction({
  id: "wait",
  label: "Wait",
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
  label: "Send Resend",
  description: "Deliver an outbound email with Resend.",
  category: "Resend",
  icon: "flash",
  configFields: [
    {
      key: "subject",
      label: "Email subject",
      type: "text",
      placeholder: "Appointment reminder",
      required: true,
    },
    {
      key: "message",
      label: "Email body",
      type: "textarea",
      rows: 5,
      placeholder: "Hi {{client.firstName}}, this is your reminder.",
      required: true,
    },
  ],
});

registerAction({
  id: "send-slack",
  label: "Send Slack",
  description: "Deliver an outbound Slack message.",
  category: "Slack",
  icon: "flash",
  configFields: [
    {
      key: "slackChannel",
      label: "Slack channel",
      type: "text",
      placeholder: "#ops-alerts",
      required: true,
    },
    {
      key: "message",
      label: "Slack message",
      type: "textarea",
      rows: 5,
      placeholder: "Appointment update for {{client.firstName}}.",
      required: true,
    },
  ],
});

registerAction({
  id: "logger",
  label: "Logger",
  description: "Record a structured runtime log line.",
  category: "System",
  icon: "flash",
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
  ],
});

export type {
  ActionConfigField,
  ActionConfigFieldBase,
  ActionConfigFieldGroup,
  ActionDefinition,
};
