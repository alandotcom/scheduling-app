import type { JourneyTriggerConfig } from "./workflow-graph";

type JourneyTriggerType = JourneyTriggerConfig["triggerType"];

const disallowedActionTypesByTriggerType: Record<
  JourneyTriggerType,
  ReadonlySet<string>
> = {
  AppointmentJourney: new Set<string>(),
  ClientJourney: new Set<string>(["wait-for-confirmation"]),
};

function normalizeActionType(actionType: string): string {
  return actionType.trim().toLowerCase();
}

export function isJourneyActionAllowedForTriggerType(
  actionType: string,
  triggerType: JourneyTriggerType | null | undefined,
): boolean {
  if (!triggerType) {
    return true;
  }

  const normalizedActionType = normalizeActionType(actionType);
  if (normalizedActionType.length === 0) {
    return false;
  }

  const disallowedActionTypes = disallowedActionTypesByTriggerType[triggerType];
  return !disallowedActionTypes.has(normalizedActionType);
}

export function filterJourneyActionTypesForTriggerType<
  ActionType extends string,
>(
  actionTypes: readonly ActionType[],
  triggerType: JourneyTriggerType | null | undefined,
): ActionType[] {
  return actionTypes.filter((actionType) =>
    isJourneyActionAllowedForTriggerType(actionType, triggerType),
  );
}
