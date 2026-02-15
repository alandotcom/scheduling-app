import { randomBytes } from "crypto";
import {
  createOrgUserSchema,
  updateOrgUserRoleSchema,
  type OrgMembershipRole,
} from "@scheduling/dto";
import { orgMemberships, users } from "@scheduling/db/schema";
import { and, asc, count, eq } from "drizzle-orm";
import { adminOnly } from "./base.js";
import { db } from "../lib/db.js";
import { auth } from "../lib/auth.js";
import { ApplicationError } from "../errors/application-error.js";
import type { AuthMethod } from "../lib/orpc.js";

const isDev = process.env.NODE_ENV !== "production";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildFallbackName(email: string): string {
  const [localPart] = email.split("@");
  return localPart?.trim() || "User";
}

function generateTemporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}

function assertSessionMutationAccess(context: {
  authMethod: AuthMethod;
  headers: Headers;
}): void {
  if (context.authMethod === "session" && context.headers.has("cookie")) {
    return;
  }

  throw new ApplicationError(
    "Organization user mutations require a session-authenticated admin",
    { code: "FORBIDDEN" },
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

async function findUserByEmail(email: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user ?? null;
}

async function findUserById(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

async function findMembership(orgId: string, userId: string) {
  const [membership] = await db
    .select({
      id: orgMemberships.id,
      orgId: orgMemberships.orgId,
      userId: orgMemberships.userId,
      role: orgMemberships.role,
      createdAt: orgMemberships.createdAt,
      updatedAt: orgMemberships.updatedAt,
    })
    .from(orgMemberships)
    .where(
      and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)),
    )
    .limit(1);
  return membership ?? null;
}

async function findOrgUserListItem(orgId: string, userId: string) {
  const [row] = await db
    .select({
      membershipId: orgMemberships.id,
      orgId: orgMemberships.orgId,
      userId: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      role: orgMemberships.role,
      membershipCreatedAt: orgMemberships.createdAt,
      membershipUpdatedAt: orgMemberships.updatedAt,
      userCreatedAt: users.createdAt,
      userUpdatedAt: users.updatedAt,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(users.id, orgMemberships.userId))
    .where(
      and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

async function countOwners(orgId: string) {
  const [result] = await db
    .select({ count: count() })
    .from(orgMemberships)
    .where(
      and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.role, "owner")),
    );
  return Number(result?.count ?? 0);
}

async function assertOwnerRoleTransitionAllowed(params: {
  actorRole: OrgMembershipRole;
  currentRole: OrgMembershipRole;
  nextRole: OrgMembershipRole;
  orgId: string;
}) {
  const { actorRole, currentRole, nextRole, orgId } = params;
  const touchesOwnerRole = currentRole === "owner" || nextRole === "owner";

  if (!touchesOwnerRole) return;

  if (actorRole !== "owner") {
    throw new ApplicationError("Only owners can assign or remove owner role", {
      code: "FORBIDDEN",
    });
  }

  const isOwnerDemotion = currentRole === "owner" && nextRole !== "owner";
  if (!isOwnerDemotion) return;

  const ownerCount = await countOwners(orgId);
  if (ownerCount <= 1) {
    throw new ApplicationError("Organization must retain at least one owner", {
      code: "BAD_REQUEST",
    });
  }
}

async function updateMembershipRole(params: {
  membershipId: string;
  role: OrgMembershipRole;
}) {
  const { membershipId, role } = params;

  await db
    .update(orgMemberships)
    .set({ role, updatedAt: new Date() })
    .where(eq(orgMemberships.id, membershipId));
}

export const list = adminOnly
  .route({ method: "GET", path: "/org/users" })
  .handler(async ({ context }) => {
    const members = await db
      .select({
        membershipId: orgMemberships.id,
        orgId: orgMemberships.orgId,
        userId: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        role: orgMemberships.role,
        membershipCreatedAt: orgMemberships.createdAt,
        membershipUpdatedAt: orgMemberships.updatedAt,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
      })
      .from(orgMemberships)
      .innerJoin(users, eq(users.id, orgMemberships.userId))
      .where(eq(orgMemberships.orgId, context.orgId))
      .orderBy(asc(users.name), asc(users.email));

    return members;
  });

export const create = adminOnly
  .route({ method: "POST", path: "/org/users" })
  .input(createOrgUserSchema)
  .handler(async ({ input, context }) => {
    assertSessionMutationAccess(context);

    const email = normalizeEmail(input.email);
    const name = input.name?.trim();

    if (input.role === "owner" && context.role !== "owner") {
      throw new ApplicationError("Only owners can assign owner role", {
        code: "FORBIDDEN",
      });
    }

    let user = await findUserByEmail(email);

    if (!user) {
      const temporaryPassword = generateTemporaryPassword();

      // TODO: Replace temporary password bootstrap with invite/email flow.
      const created = await auth.api.createUser({
        body: {
          email,
          name: name && name.length > 0 ? name : buildFallbackName(email),
          password: temporaryPassword,
        },
      });

      if (!created?.user?.id) {
        throw new ApplicationError("Failed to create user", {
          code: "BAD_REQUEST",
        });
      }

      if (isDev) {
        console.info(
          `[dev-user-password] email=${email} orgId=${context.orgId} password=${temporaryPassword}`,
        );
      }

      user = await findUserById(created.user.id);
      if (!user) {
        throw new ApplicationError("Created user not found", {
          code: "NOT_FOUND",
        });
      }
    }

    let membership = await findMembership(context.orgId, user.id);

    if (!membership) {
      try {
        await auth.api.addMember({
          body: {
            userId: user.id,
            organizationId: context.orgId,
            role: input.role,
          },
        });
      } catch (error) {
        throw new ApplicationError(
          getErrorMessage(error, "Failed to add user to organization"),
          { code: "BAD_REQUEST" },
        );
      }

      membership = await findMembership(context.orgId, user.id);
      if (!membership) {
        throw new ApplicationError("Failed to add user to organization", {
          code: "BAD_REQUEST",
        });
      }
    }

    if (membership.role !== input.role) {
      await assertOwnerRoleTransitionAllowed({
        actorRole: context.role,
        currentRole: membership.role,
        nextRole: input.role,
        orgId: context.orgId,
      });

      try {
        await updateMembershipRole({
          membershipId: membership.id,
          role: input.role,
        });
      } catch (error) {
        throw new ApplicationError(
          getErrorMessage(error, "Failed to update user role"),
          { code: "BAD_REQUEST" },
        );
      }
    }

    const orgUser = await findOrgUserListItem(context.orgId, user.id);
    if (!orgUser) {
      throw new ApplicationError("Organization user not found", {
        code: "NOT_FOUND",
      });
    }

    return orgUser;
  });

export const updateRole = adminOnly
  .route({ method: "PATCH", path: "/org/users/role" })
  .input(updateOrgUserRoleSchema)
  .handler(async ({ input, context }) => {
    assertSessionMutationAccess(context);

    const membership = await findMembership(context.orgId, input.userId);
    if (!membership) {
      throw new ApplicationError("User is not a member of this organization", {
        code: "NOT_FOUND",
      });
    }

    if (membership.role === input.role) {
      const current = await findOrgUserListItem(context.orgId, input.userId);
      if (!current) {
        throw new ApplicationError("Organization user not found", {
          code: "NOT_FOUND",
        });
      }
      return current;
    }

    await assertOwnerRoleTransitionAllowed({
      actorRole: context.role,
      currentRole: membership.role,
      nextRole: input.role,
      orgId: context.orgId,
    });

    try {
      await updateMembershipRole({
        membershipId: membership.id,
        role: input.role,
      });
    } catch (error) {
      throw new ApplicationError(
        getErrorMessage(error, "Failed to update user role"),
        { code: "BAD_REQUEST" },
      );
    }

    const updated = await findOrgUserListItem(context.orgId, input.userId);
    if (!updated) {
      throw new ApplicationError("Organization user not found", {
        code: "NOT_FOUND",
      });
    }

    return updated;
  });

export const orgUserRoutes = {
  list,
  create,
  updateRole,
};
