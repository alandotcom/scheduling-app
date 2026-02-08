import { z } from "zod";
import { uuidSchema, timestampsSchema, timestampSchema } from "./common";

// Base user schema
export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  emailVerified: z.boolean(),
  name: z.string().nullable(),
  image: z.string().url().nullable(),
  ...timestampsSchema.shape,
});

// Create user input (for admin creation)
export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255).optional(),
  image: z.string().url().optional(),
});

// Organization user management input
export const createOrgUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255).optional(),
  role: z.enum(["owner", "admin", "member"]),
});

export const updateOrgUserRoleSchema = z.object({
  userId: uuidSchema,
  role: z.enum(["owner", "admin", "member"]),
});

// Update user input
export const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  image: z.string().url().nullable().optional(),
});

// Response types
export const userResponseSchema = userSchema;

// Org membership
export const orgMembershipRoleSchema = z.enum(["owner", "admin", "member"]);

export const orgMembershipSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  userId: uuidSchema,
  role: orgMembershipRoleSchema,
  ...timestampsSchema.shape,
});

export const orgUserListItemSchema = z.object({
  membershipId: uuidSchema,
  orgId: uuidSchema,
  userId: uuidSchema,
  email: z.string().email(),
  name: z.string().nullable(),
  image: z.string().url().nullable(),
  role: orgMembershipRoleSchema,
  membershipCreatedAt: timestampSchema,
  membershipUpdatedAt: timestampSchema,
  userCreatedAt: timestampSchema,
  userUpdatedAt: timestampSchema,
});

export const createOrgMembershipSchema = z.object({
  userId: uuidSchema,
  role: orgMembershipRoleSchema,
});

export const updateOrgMembershipSchema = z.object({
  role: orgMembershipRoleSchema.optional(),
});

// Inferred types
export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateOrgUserInput = z.infer<typeof createOrgUserSchema>;
export type UpdateOrgUserRoleInput = z.infer<typeof updateOrgUserRoleSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type OrgMembershipRole = z.infer<typeof orgMembershipRoleSchema>;
export type OrgMembership = z.infer<typeof orgMembershipSchema>;
export type OrgUserListItem = z.infer<typeof orgUserListItemSchema>;
export type CreateOrgMembershipInput = z.infer<
  typeof createOrgMembershipSchema
>;
export type UpdateOrgMembershipInput = z.infer<
  typeof updateOrgMembershipSchema
>;
