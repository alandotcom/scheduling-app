import type {
  WorkflowActionCatalogItem,
  WorkflowActionConfigField,
} from "@scheduling/dto";

function isGroupField(
  field: WorkflowActionConfigField,
): field is Extract<WorkflowActionConfigField, { type: "group" }> {
  return field.type === "group";
}

function toFieldList(
  fields: WorkflowActionConfigField[],
): Exclude<WorkflowActionConfigField, { type: "group" }>[] {
  return fields.flatMap((field) =>
    isGroupField(field) ? field.fields : [field],
  );
}

export function createActionDefaultConfig(
  action: WorkflowActionCatalogItem,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    actionType: action.id,
    actionId: action.id,
  };

  const fields = toFieldList(action.configFields ?? []);
  for (const field of fields) {
    if (field.defaultValue !== undefined) {
      config[field.key] = field.defaultValue;
    }
  }

  return config;
}

export function normalizeFieldValue(
  field: Exclude<WorkflowActionConfigField, { type: "group" }>,
  rawValue: string,
): unknown {
  if (field.type === "number") {
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? rawValue : parsed;
  }

  return rawValue;
}

export function isActionConfigFieldVisible(
  field: Exclude<WorkflowActionConfigField, { type: "group" }>,
  config: Record<string, unknown>,
): boolean {
  if (!field.showWhen) {
    return true;
  }

  return config[field.showWhen.field] === field.showWhen.equals;
}

export function flattenActionConfigFields(
  fields: WorkflowActionConfigField[] | undefined,
): Exclude<WorkflowActionConfigField, { type: "group" }>[] {
  if (!fields) {
    return [];
  }

  return toFieldList(fields);
}
