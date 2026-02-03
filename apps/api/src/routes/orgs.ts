// oRPC routes for org settings

import { updateOrgSettingsSchema } from "@scheduling/dto";
import { orgs } from "@scheduling/db/schema";
import { eq } from "drizzle-orm";
import { authed, adminOnly } from "./base.js";
import { db } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";

// Get current org with settings
export const get = authed
  .route({ method: "GET", path: "/org" })
  .handler(async ({ context }) => {
    const [org] = await db
      .select()
      .from(orgs)
      .where(eq(orgs.id, context.orgId))
      .limit(1);
    if (!org) {
      throw new ApplicationError("Organization not found", {
        code: "NOT_FOUND",
      });
    }
    return org;
  });

// Update org settings (admin only)
export const updateSettings = adminOnly
  .route({ method: "PATCH", path: "/org/settings" })
  .input(updateOrgSettingsSchema)
  .handler(async ({ input, context }) => {
    const [updated] = await db
      .update(orgs)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(orgs.id, context.orgId))
      .returning();
    if (!updated) {
      throw new ApplicationError("Organization not found", {
        code: "NOT_FOUND",
      });
    }
    return updated;
  });

// Export as route object
export const orgRoutes = {
  get,
  updateSettings,
};
