// oRPC routes for org settings

import { createOrgSchema, updateOrgSettingsSchema } from "@scheduling/dto";
import { orgMemberships, orgs } from "@scheduling/db/schema";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { authUser, authed, adminOnly } from "./base.js";
import { db } from "../lib/db.js";
import { auth } from "../lib/auth.js";
import { ApplicationError } from "../errors/application-error.js";
import { orgUserRoutes } from "./org-users.js";
import { ensureAppIntegrationDefaultsForOrg } from "../services/integrations/defaults.js";

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

// List organizations for current user (for org switcher)
export const listMemberships = authUser
  .route({ method: "GET", path: "/org/memberships" })
  .handler(async ({ context }) => {
    const memberships = await db
      .select({
        id: orgMemberships.id,
        orgId: orgMemberships.orgId,
        role: orgMemberships.role,
        orgName: orgs.name,
        orgSlug: orgs.slug,
      })
      .from(orgMemberships)
      .innerJoin(orgs, eq(orgMemberships.orgId, orgs.id))
      .where(eq(orgMemberships.userId, context.userId))
      .orderBy(asc(orgs.name));

    return memberships;
  });

const createOrganizationInputSchema = createOrgSchema.extend({
  slug: z.string().min(1).max(255).optional(),
  logo: z.string().url().optional(),
});

function buildOrganizationSlug(input: {
  name: string;
  slug?: string | undefined;
}) {
  if (input.slug) return input.slug;

  const base = input.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const randomSuffix = Bun.randomUUIDv7().slice(-6);
  return `${base || "org"}-${randomSuffix}`;
}

// Create organization and set it active in the current session
export const create = authUser
  .route({ method: "POST", path: "/org/create" })
  .input(createOrganizationInputSchema)
  .handler(async ({ input, context }) => {
    const slug = buildOrganizationSlug(input);

    const created = await auth.api.createOrganization({
      headers: context.headers,
      body: {
        name: input.name,
        slug,
        ...(input.logo ? { logo: input.logo } : {}),
      },
    });

    if (!created) {
      throw new ApplicationError("Failed to create organization", {
        code: "BAD_REQUEST",
      });
    }

    await ensureAppIntegrationDefaultsForOrg(created.id);

    return created;
  });

const setActiveOrgSchema = z.object({
  organizationId: z.string().uuid(),
});

// Set active organization for current session
export const setActive = authUser
  .route({ method: "POST", path: "/org/set-active" })
  .input(setActiveOrgSchema)
  .handler(async ({ input, context }) => {
    const org = await auth.api.setActiveOrganization({
      headers: context.headers,
      body: { organizationId: input.organizationId },
    });

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
  listMemberships,
  create,
  setActive,
  updateSettings,
  users: orgUserRoutes,
};
