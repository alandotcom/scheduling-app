export function formatWebhookPayloadPreview(payload: unknown): string {
  if (typeof payload === "string") {
    const trimmedPayload = payload.trim();
    if (!trimmedPayload) return payload;
    try {
      return JSON.stringify(JSON.parse(trimmedPayload), null, 2);
    } catch {
      return payload;
    }
  }

  if (payload === undefined) return "";

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "[unserializable payload]";
  }
}
