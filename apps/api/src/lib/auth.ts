// BetterAuth configuration with Drizzle adapter

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey, organization } from "better-auth/plugins";
import { db } from "./db.js";
import * as schema from "@scheduling/db/schema";
import { config } from "../config.js";

const isDev = process.env.NODE_ENV !== "production";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      organization: schema.orgs,
      member: schema.orgMemberships,
      invitation: schema.orgInvitations,
      apikey: schema.apiKeys,
    },
  }),
  secret: config.auth.secret,
  baseURL: config.auth.baseUrl,
  trustedOrigins: config.auth.trustedOrigins.split(",").map((o) => o.trim()),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: config.auth.requireEmailVerification,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      schema: {
        member: {
          fields: {
            organizationId: "orgId",
          },
        },
        invitation: {
          fields: {
            organizationId: "orgId",
          },
        },
        session: {
          fields: {
            activeOrganizationId: "activeOrganizationId",
          },
        },
      },
    }),
    apiKey({
      enableMetadata: true,
    }),
  ],
  advanced: {
    database: {
      generateId: () => Bun.randomUUIDv7(), // Generate UUIDv7 to match our schema
    },
    cookiePrefix: "scheduling",
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: !isDev,
    },
  },
});

export type Auth = typeof auth;
