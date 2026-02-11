import type { WorkflowTriggerCatalogItem } from "@scheduling/dto";

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
