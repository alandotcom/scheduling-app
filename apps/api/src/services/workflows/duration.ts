import parseDuration from "parse-duration";

function normalizeIsoDuration(value: string): string {
  if (!value.startsWith("P")) {
    return value;
  }

  const separatorIndex = value.indexOf("T");
  if (separatorIndex <= 1 || separatorIndex >= value.length - 1) {
    return value;
  }

  // parse-duration handles ISO date and time chunks, but combined strings
  // like `P3DT2H` must be expressed as `P3D PT2H`.
  const dateChunk = value.slice(0, separatorIndex);
  const timeChunk = value.slice(separatorIndex + 1);
  return `${dateChunk} PT${timeChunk}`;
}

export function parseWorkflowDurationToMs(value: string): number | null {
  const parsed = parseDuration(normalizeIsoDuration(value));
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}
