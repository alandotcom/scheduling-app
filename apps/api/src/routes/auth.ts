import { orgs } from "@scheduling/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authUser } from "./base.js";
import { db } from "../lib/db.js";

const roleSchema = z.enum(["owner", "admin", "member"]);

const authMeSchema = z.object({
  userId: z.uuid(),
  orgId: z.uuid().nullable(),
  role: roleSchema.nullable(),
  org: z
    .object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
    })
    .nullable(),
});

export const me = authUser
  .route({ method: "GET", path: "/auth/me" })
  .output(authMeSchema)
  .handler(async ({ context }) => {
    const { userId, orgId, role } = context;

    if (!orgId) {
      return {
        userId,
        orgId: null,
        role: null,
        org: null,
      };
    }

    const [org] = await db
      .select({
        id: orgs.id,
        name: orgs.name,
        slug: orgs.slug,
      })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);

    return {
      userId,
      orgId,
      role: role ?? null,
      org: org ?? null,
    };
  });

export const authRoutes = {
  me,
};
