import { getLogger } from "@logtape/logtape";
import { Hono } from "hono";
import { sendJourneyActionSendTwilioCallbackReceived } from "../../inngest/runtime-events.js";
import {
  parseTwilioStatusCallbackBody,
  resolveCallbackQueryParams,
  validateTwilioStatusCallbackSignature,
} from "../../services/integrations/twilio/callbacks.js";
import { resolveTwilioCredentialsForOrg } from "../../services/integrations/twilio/delivery.js";

const logger = getLogger(["integrations", "twilio", "status-callback"]);

function toStringBody(
  value: Awaited<ReturnType<typeof Request.prototype.formData>>,
): Record<string, string> {
  const body: Record<string, string> = {};

  for (const [key, entry] of value.entries()) {
    if (typeof entry === "string") {
      body[key] = entry;
    }
  }

  return body;
}

export const twilioStatusCallbackRouter = new Hono();

twilioStatusCallbackRouter.post("/status-callback", async (c) => {
  const { orgId, journeyDeliveryId } = resolveCallbackQueryParams({
    orgId: c.req.query("orgId"),
    journeyDeliveryId: c.req.query("journeyDeliveryId"),
  });

  if (!orgId || !journeyDeliveryId) {
    return c.json({ error: "Missing orgId or journeyDeliveryId." }, 400);
  }

  const formData = await c.req.raw.formData();
  const body = toStringBody(formData);
  const { messageSid, messageStatus, errorCode } =
    parseTwilioStatusCallbackBody(body);

  if (!messageSid || !messageStatus) {
    return c.json({ error: "Missing MessageSid or MessageStatus." }, 400);
  }

  const signature = c.req.header("x-twilio-signature") ?? "";
  if (!signature) {
    return c.json({ error: "Missing X-Twilio-Signature header." }, 403);
  }

  let credentials: Awaited<ReturnType<typeof resolveTwilioCredentialsForOrg>>;
  try {
    credentials = await resolveTwilioCredentialsForOrg(orgId);
  } catch {
    return c.json({ error: "Twilio credentials unavailable." }, 403);
  }
  const isValidSignature = validateTwilioStatusCallbackSignature({
    authToken: credentials.authToken,
    signature,
    url: c.req.url,
    params: body,
  });

  if (!isValidSignature) {
    logger.warn("Rejected Twilio callback with invalid signature", {
      orgId,
      journeyDeliveryId,
      messageSid,
      messageStatus,
    });
    return c.json({ error: "Invalid Twilio signature." }, 403);
  }

  await sendJourneyActionSendTwilioCallbackReceived({
    orgId,
    journeyDeliveryId,
    messageSid,
    messageStatus,
    errorCode,
  });

  return c.body(null, 204);
});
