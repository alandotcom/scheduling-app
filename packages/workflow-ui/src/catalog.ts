import type {
  WorkflowActionCatalogItem,
  WorkflowTriggerCatalogItem,
} from "@scheduling/dto";

export type LegacyWorkflowKitAction = {
  kind: string;
  name: string;
  description: string;
};

function toTitle(value: string): string {
  return value
    .split(".")
    .flatMap((segment) => segment.split(/[_-]/))
    .filter((segment) => segment.length > 0)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join(" ");
}

export function getCatalogTriggerEventTypes(
  triggers: readonly WorkflowTriggerCatalogItem[],
  fallback: readonly WorkflowTriggerCatalogItem["eventType"][],
): readonly WorkflowTriggerCatalogItem["eventType"][] {
  if (triggers.length === 0) {
    return fallback;
  }

  return Array.from(new Set(triggers.map((trigger) => trigger.eventType)));
}

export function resolveDefaultCatalogTriggerEventType(
  triggers: readonly WorkflowTriggerCatalogItem[],
  fallback: WorkflowTriggerCatalogItem["eventType"],
): WorkflowTriggerCatalogItem["eventType"] {
  return triggers[0]?.eventType ?? fallback;
}

export function toLegacyWorkflowKitActions(
  actions: readonly WorkflowActionCatalogItem[],
): readonly LegacyWorkflowKitAction[] {
  return actions.map((action) => ({
    kind: action.id.replaceAll(".", "_"),
    name: action.label,
    description: `${toTitle(action.integrationKey)} action: ${action.id}`,
  }));
}
