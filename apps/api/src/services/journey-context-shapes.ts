import { toRecord } from "../lib/type-guards.js";

export function toDataEnvelopeContext(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...payload,
    data: payload,
  };
}

export function toOptionalDataEnvelopeContext(
  payload: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!payload) {
    return {};
  }

  return toDataEnvelopeContext(payload);
}

export function toDataEnvelopeContextFromUnknown(
  value: unknown,
): Record<string, unknown> {
  const payload = toRecord(value);
  if (Object.keys(payload).length === 0) {
    return {};
  }

  return toDataEnvelopeContext(payload);
}
