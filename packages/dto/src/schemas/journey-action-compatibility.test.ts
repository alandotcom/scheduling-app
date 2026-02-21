import { describe, expect, test } from "bun:test";
import {
  filterJourneyActionTypesForTriggerType,
  isJourneyActionAllowedForTriggerType,
} from "./journey-action-compatibility";

describe("journey action compatibility", () => {
  test("allows wait-for-confirmation for appointment journeys", () => {
    expect(
      isJourneyActionAllowedForTriggerType(
        "wait-for-confirmation",
        "AppointmentJourney",
      ),
    ).toBeTrue();
  });

  test("rejects wait-for-confirmation for client journeys", () => {
    expect(
      isJourneyActionAllowedForTriggerType(
        "wait-for-confirmation",
        "ClientJourney",
      ),
    ).toBeFalse();
  });

  test("filters ineligible actions for client journeys", () => {
    expect(
      filterJourneyActionTypesForTriggerType(
        ["wait", "wait-for-confirmation", "condition"],
        "ClientJourney",
      ),
    ).toEqual(["wait", "condition"]);
  });
});
