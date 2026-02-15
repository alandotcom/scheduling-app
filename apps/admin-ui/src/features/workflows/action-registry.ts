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

// --- System actions ---

registerAction({
  id: "http-request",
  label: "HTTP Request",
  description: "Send an HTTP request to an external endpoint.",
  category: "System",
  icon: "flash",
  configFields: [
    {
      key: "httpMethod",
      label: "Method",
      type: "select",
      defaultValue: "POST",
      options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
        { value: "PUT", label: "PUT" },
        { value: "PATCH", label: "PATCH" },
        { value: "DELETE", label: "DELETE" },
      ],
    },
    {
      key: "endpoint",
      label: "Endpoint",
      type: "text",
      placeholder: "https://api.example.com/...",
      required: true,
    },
    {
      label: "Headers & Body",
      type: "group",
      defaultExpanded: false,
      fields: [
        {
          key: "httpHeaders",
          label: "Headers (JSON)",
          type: "textarea",
          rows: 4,
          placeholder: '{"Content-Type": "application/json"}',
        },
        {
          key: "httpBody",
          label: "Body (JSON)",
          type: "textarea",
          rows: 5,
          placeholder: '{"key": "value"}',
        },
      ],
    },
  ],
});

registerAction({
  id: "condition",
  label: "Condition",
  description: "Branch execution based on a condition expression.",
  category: "System",
  icon: "git-branch",
  configFields: [
    {
      key: "condition",
      label: "Condition",
      type: "expression",
      placeholder: "e.g., {{data.status}} === 'confirmed'",
      required: true,
    },
  ],
});

registerAction({
  id: "switch",
  label: "Switch",
  description: "Fork execution into created, updated, and deleted branches.",
  category: "System",
  icon: "git-branch",
  configFields: [
    {
      key: "switchMode",
      label: "Switch mode",
      type: "select",
      defaultValue: "event-type",
      options: [{ value: "event-type", label: "Event type" }],
    },
  ],
});

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

export type {
  ActionConfigField,
  ActionConfigFieldBase,
  ActionConfigFieldGroup,
  ActionDefinition,
};
