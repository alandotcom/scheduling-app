-- BetterAuth organization plugin schema sync.
-- This is intentionally destructive and does not preserve org-role data.

ALTER TABLE "sessions"
  ADD COLUMN "active_organization_id" uuid;

ALTER TABLE "orgs"
  ADD COLUMN "slug" text NOT NULL DEFAULT replace(uuidv7()::text, '-', ''),
  ADD COLUMN "logo" text,
  ADD COLUMN "metadata" jsonb;

ALTER TABLE "orgs"
  ADD CONSTRAINT "orgs_slug_unique" UNIQUE ("slug");

ALTER TABLE "api_tokens"
  ALTER COLUMN "scope" DROP DEFAULT,
  ALTER COLUMN "scope" TYPE text USING 'member';

DROP TABLE "org_memberships";
DROP TYPE "org_role";
CREATE TYPE "org_role" AS ENUM ('owner', 'admin', 'member');

ALTER TABLE "api_tokens"
  ALTER COLUMN "scope" TYPE "org_role" USING 'member'::"org_role",
  ALTER COLUMN "scope" SET DEFAULT 'member'::"org_role";

CREATE TABLE "org_memberships" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "org_role" NOT NULL DEFAULT 'member'::"org_role",
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "org_memberships_org_user_idx" ON "org_memberships" ("org_id", "user_id");

CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'rejected', 'canceled');

CREATE TABLE "org_invitations" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(),
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" "org_role" NOT NULL DEFAULT 'member'::"org_role",
  "status" "invitation_status" NOT NULL DEFAULT 'pending'::"invitation_status",
  "inviter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "team_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
