export type FlowViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type FlowPosition = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type Insets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export const MANUAL_VIEWPORT_COOLDOWN_MS = 1_500;

export function getTriggerViewportInsets(container: Size): Insets {
  return {
    top: Math.max(56, container.height * 0.12),
    right: Math.max(28, container.width * 0.06),
    bottom: Math.max(40, container.height * 0.08),
    left: Math.max(28, container.width * 0.06),
  };
}

function getAxisShift(input: {
  segmentStart: number;
  segmentEnd: number;
  minBound: number;
  maxBound: number;
}): number {
  const segmentLength = input.segmentEnd - input.segmentStart;
  const boundLength = input.maxBound - input.minBound;

  if (segmentLength > boundLength) {
    return input.minBound - input.segmentStart;
  }

  if (input.segmentStart < input.minBound) {
    return input.minBound - input.segmentStart;
  }

  if (input.segmentEnd > input.maxBound) {
    return input.maxBound - input.segmentEnd;
  }

  return 0;
}

export function computeViewportForTriggerVisibility(input: {
  viewport: FlowViewport;
  container: Size;
  triggerPosition: FlowPosition;
  triggerSize: Size;
}): FlowViewport | null {
  if (input.container.width <= 0 || input.container.height <= 0) {
    return null;
  }

  const insets = getTriggerViewportInsets(input.container);
  const safeLeft = insets.left;
  const safeRight = input.container.width - insets.right;
  const safeTop = insets.top;
  const safeBottom = input.container.height - insets.bottom;

  const triggerLeft =
    input.triggerPosition.x * input.viewport.zoom + input.viewport.x;
  const triggerRight =
    (input.triggerPosition.x + input.triggerSize.width) * input.viewport.zoom +
    input.viewport.x;
  const triggerTop =
    input.triggerPosition.y * input.viewport.zoom + input.viewport.y;
  const triggerBottom =
    (input.triggerPosition.y + input.triggerSize.height) * input.viewport.zoom +
    input.viewport.y;

  const xShift = getAxisShift({
    segmentStart: triggerLeft,
    segmentEnd: triggerRight,
    minBound: safeLeft,
    maxBound: safeRight,
  });
  const yShift = getAxisShift({
    segmentStart: triggerTop,
    segmentEnd: triggerBottom,
    minBound: safeTop,
    maxBound: safeBottom,
  });

  if (xShift === 0 && yShift === 0) {
    return null;
  }

  return {
    x: input.viewport.x + xShift,
    y: input.viewport.y + yShift,
    zoom: input.viewport.zoom,
  };
}

export function isManualViewportCooldownActive(input: {
  now: number;
  lastInteractionAt: number;
  cooldownMs?: number;
}): boolean {
  const cooldownMs = input.cooldownMs ?? MANUAL_VIEWPORT_COOLDOWN_MS;
  if (input.lastInteractionAt <= 0) {
    return false;
  }

  return input.now - input.lastInteractionAt < cooldownMs;
}
