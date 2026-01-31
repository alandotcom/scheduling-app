CREATE TYPE "org_role" AS ENUM('admin', 'staff');--> statement-breakpoint
ALTER TABLE "api_tokens" ALTER COLUMN "scope" SET DATA TYPE "org_role" USING "scope"::"org_role";--> statement-breakpoint
ALTER TABLE "org_memberships" ALTER COLUMN "role" SET DATA TYPE "org_role" USING "role"::"org_role";