import { webhookSessionResponseSchema } from "@scheduling/dto";
import { adminOnly } from "./base.js";
import { createAppPortalSession } from "../services/svix.js";

// Create a short-lived Svix session for webhook management in the UI.
export const session = adminOnly
  .route({ method: "GET", path: "/webhooks/session" })
  .output(webhookSessionResponseSchema)
  .handler(async ({ context }) => {
    const appPortalSession = await createAppPortalSession(
      context.orgId,
      context.sessionId,
    );
    return appPortalSession;
  });

export const webhookRoutes = {
  session,
};
