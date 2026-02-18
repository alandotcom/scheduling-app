import { describe, expect, test } from "bun:test";
import {
  computeViewportForTriggerVisibility,
  isManualViewportCooldownActive,
} from "./workflow-viewport-anchor";

describe("workflow viewport anchor", () => {
  test("returns null when trigger is already inside safe bounds", () => {
    const result = computeViewportForTriggerVisibility({
      viewport: { x: 0, y: 0, zoom: 1 },
      container: { width: 1200, height: 800 },
      triggerPosition: { x: 120, y: 120 },
      triggerSize: { width: 224, height: 144 },
    });

    expect(result).toBeNull();
  });

  test("pans down to keep trigger inside top inset without changing zoom", () => {
    const result = computeViewportForTriggerVisibility({
      viewport: { x: 0, y: 0, zoom: 1.2 },
      container: { width: 1200, height: 800 },
      triggerPosition: { x: 140, y: 0 },
      triggerSize: { width: 224, height: 144 },
    });

    expect(result).toBeTruthy();
    expect(result?.zoom).toBe(1.2);
    expect(result?.y).toBeGreaterThan(0);
    expect(result?.x).toBe(0);
  });

  test("pans left to keep trigger inside right inset without changing zoom", () => {
    const result = computeViewportForTriggerVisibility({
      viewport: { x: 0, y: 0, zoom: 1 },
      container: { width: 700, height: 600 },
      triggerPosition: { x: 560, y: 120 },
      triggerSize: { width: 224, height: 144 },
    });

    expect(result).toBeTruthy();
    expect(result?.zoom).toBe(1);
    expect(result?.x).toBeLessThan(0);
    expect(result?.y).toBe(0);
  });

  test("handles oversized trigger bounds by aligning to minimum safe inset", () => {
    const result = computeViewportForTriggerVisibility({
      viewport: { x: 20, y: 0, zoom: 1 },
      container: { width: 180, height: 600 },
      triggerPosition: { x: 0, y: 120 },
      triggerSize: { width: 224, height: 144 },
    });

    expect(result).toBeTruthy();
    expect(result?.x).toBeGreaterThan(20);
  });

  test("detects manual viewport cooldown window", () => {
    expect(
      isManualViewportCooldownActive({
        now: 5_000,
        lastInteractionAt: 4_200,
      }),
    ).toBeTrue();

    expect(
      isManualViewportCooldownActive({
        now: 5_000,
        lastInteractionAt: 2_000,
      }),
    ).toBeFalse();
  });
});
