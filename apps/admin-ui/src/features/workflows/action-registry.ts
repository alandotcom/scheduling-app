type ActionConfigFieldBase = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select";
  placeholder?: string;
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
      type: "text",
      placeholder: "e.g., {{data.status}} === 'confirmed'",
      required: true,
    },
  ],
});

registerAction({
  id: "wait",
  label: "Wait",
  description: "Pause execution for a duration or until an event arrives.",
  category: "System",
  icon: "hourglass",
  configFields: [
    {
      key: "waitMode",
      label: "Wait Mode",
      type: "select",
      defaultValue: "delay",
      options: [
        { value: "delay", label: "Delay" },
        { value: "hook", label: "Wait for Event" },
      ],
    },
    {
      key: "waitDuration",
      label: "Duration",
      type: "text",
      placeholder: "24h, 90m, 3600000",
      showWhen: { field: "waitMode", equals: "delay" },
    },
    {
      key: "waitForEvents",
      label: "Wait for Events",
      type: "text",
      placeholder: "event.update, event.confirmed",
      showWhen: { field: "waitMode", equals: "hook" },
    },
    {
      key: "waitTimeout",
      label: "Timeout",
      type: "text",
      placeholder: "48h (optional)",
      showWhen: { field: "waitMode", equals: "hook" },
    },
  ],
});

export type {
  ActionConfigField,
  ActionConfigFieldBase,
  ActionConfigFieldGroup,
  ActionDefinition,
};
