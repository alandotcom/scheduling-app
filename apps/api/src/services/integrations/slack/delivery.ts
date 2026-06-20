// Thin Slack adapter (stub until a real Slack integration lands). No journey
// imports — the journey delivery dispatcher handles action-type and test-mode.
export async function sendSlackMessage(input: {
  idempotencyKey: string;
}): Promise<{ providerMessageId: string }> {
  return { providerMessageId: `slack:${input.idempotencyKey}` };
}
