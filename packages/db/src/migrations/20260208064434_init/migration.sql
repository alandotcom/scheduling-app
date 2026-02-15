-- Extensions
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
-- RLS helper functions (must exist before policies)
CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.current_org_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;
--> statement-breakpoint
CREATE TYPE "appointment_status" AS ENUM('scheduled', 'confirmed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "invitation_status" AS ENUM('pending', 'accepted', 'rejected', 'canceled');--> statement-breakpoint
CREATE TYPE "org_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL UNIQUE,
	"user_id" uuid NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer DEFAULT 0 NOT NULL,
	"remaining" integer,
	"last_request" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"permissions" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_type_calendars" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"appointment_type_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_type_resources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"appointment_type_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"quantity_required" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_types" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"duration_min" integer NOT NULL,
	"padding_before_min" integer DEFAULT 0,
	"padding_after_min" integer DEFAULT 0,
	"capacity" integer DEFAULT 1,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"appointment_type_id" uuid NOT NULL,
	"client_id" uuid,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"status" "appointment_status" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "availability_overrides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"calendar_id" uuid NOT NULL,
	"date" text NOT NULL,
	"time_ranges" jsonb DEFAULT '[]' NOT NULL,
	"interval_min" integer,
	"group_id" uuid
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"calendar_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"interval_min" integer,
	"group_id" uuid
);
--> statement-breakpoint
CREATE TABLE "blocked_time" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"calendar_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"recurring_rule" text
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" citext,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_phone_e164_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{1,14}$')
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets_encrypted" text,
	"secret_salt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workflow_execution_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"execution_id" uuid,
	"event_type" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_execution_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workflow_execution_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"node_name" text NOT NULL,
	"node_type" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_run_id" text,
	"status" text NOT NULL,
	"trigger_type" text,
	"is_dry_run" boolean DEFAULT false NOT NULL,
	"trigger_event_type" text,
	"trigger_event_id" text,
	"correlation_key" text,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"waiting_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration" text
);
--> statement-breakpoint
ALTER TABLE "workflow_executions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workflow_wait_states" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"node_name" text NOT NULL,
	"wait_type" text NOT NULL,
	"status" text NOT NULL,
	"hook_token" text,
	"wait_until" timestamp with time zone,
	"correlation_key" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resumed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workflow_wait_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"graph" jsonb NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "org_role" DEFAULT 'member'::"org_role" NOT NULL,
	"status" "invitation_status" DEFAULT 'pending'::"invitation_status" NOT NULL,
	"inviter_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"team_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_memberships" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" DEFAULT 'member'::"org_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"slug" text DEFAULT replace(uuidv7()::text, '-', '') NOT NULL UNIQUE,
	"logo" text,
	"metadata" jsonb,
	"default_timezone" text DEFAULT 'America/New_York',
	"default_business_hours_start" text DEFAULT '09:00',
	"default_business_hours_end" text DEFAULT '17:00',
	"default_business_days" jsonb DEFAULT '[1,2,3,4,5]',
	"notifications_enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scheduling_limits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"calendar_id" uuid,
	"group_id" uuid,
	"min_notice_hours" integer,
	"max_notice_days" integer,
	"max_per_slot" integer,
	"max_per_day" integer,
	"max_per_week" integer
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"token" text NOT NULL UNIQUE,
	"active_organization_id" uuid,
	"impersonated_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_type_calendars_type_calendar_idx" ON "appointment_type_calendars" ("appointment_type_id","calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_type_resources_type_resource_idx" ON "appointment_type_resources" ("appointment_type_id","resource_id");--> statement-breakpoint
CREATE INDEX "appointment_type_resources_resource_idx" ON "appointment_type_resources" ("resource_id","appointment_type_id");--> statement-breakpoint
CREATE INDEX "appointments_org_start_at_id_idx" ON "appointments" ("org_id","start_at","id");--> statement-breakpoint
CREATE INDEX "appointments_calendar_start_at_idx" ON "appointments" ("calendar_id","start_at") WHERE "status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "appointments_calendar_range_gist_idx" ON "appointments" USING gist ("calendar_id",tstzrange("start_at", "end_at", '[)')) WHERE "status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "audit_events_action_id_idx" ON "audit_events" ("action","id");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_overrides_calendar_date_unique_idx" ON "availability_overrides" ("calendar_id","date");--> statement-breakpoint
CREATE INDEX "availability_overrides_calendar_id_id_idx" ON "availability_overrides" ("calendar_id","id");--> statement-breakpoint
CREATE INDEX "availability_rules_calendar_weekday_start_id_idx" ON "availability_rules" ("calendar_id","weekday","start_time","id");--> statement-breakpoint
CREATE INDEX "availability_rules_calendar_id_id_idx" ON "availability_rules" ("calendar_id","id");--> statement-breakpoint
CREATE INDEX "blocked_time_calendar_start_idx" ON "blocked_time" ("calendar_id","start_at");--> statement-breakpoint
CREATE INDEX "blocked_time_calendar_id_id_idx" ON "blocked_time" ("calendar_id","id");--> statement-breakpoint
CREATE INDEX "blocked_time_calendar_end_idx" ON "blocked_time" ("calendar_id","end_at");--> statement-breakpoint
CREATE INDEX "blocked_time_calendar_range_gist_idx" ON "blocked_time" USING gist ("calendar_id",tstzrange("start_at", "end_at", '[)'));--> statement-breakpoint
CREATE INDEX "blocked_time_calendar_recurring_idx" ON "blocked_time" ("calendar_id") WHERE "recurring_rule" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_org_email_unique_idx" ON "clients" ("org_id","email") WHERE "email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_org_phone_unique_idx" ON "clients" ("org_id","phone") WHERE "phone" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_org_key_unique_idx" ON "integrations" ("org_id","key");--> statement-breakpoint
CREATE INDEX "integrations_org_key_idx" ON "integrations" ("org_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "org_memberships_org_user_idx" ON "org_memberships" ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "scheduling_limits_calendar_id_idx" ON "scheduling_limits" ("calendar_id");--> statement-breakpoint
CREATE INDEX "workflow_execution_events_org_workflow_created_at_idx" ON "workflow_execution_events" ("org_id","workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_execution_events_org_execution_created_at_idx" ON "workflow_execution_events" ("org_id","execution_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_execution_logs_org_execution_id_idx" ON "workflow_execution_logs" ("org_id","execution_id");--> statement-breakpoint
CREATE INDEX "workflow_execution_logs_org_execution_timestamp_idx" ON "workflow_execution_logs" ("org_id","execution_id","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_executions_org_workflow_run_id_uidx" ON "workflow_executions" ("org_id","workflow_run_id") WHERE "workflow_run_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_executions_org_workflow_trigger_event_uidx" ON "workflow_executions" ("org_id","workflow_id","trigger_event_id") WHERE "trigger_type" = 'domain_event' AND "trigger_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "workflow_executions_org_workflow_started_at_idx" ON "workflow_executions" ("org_id","workflow_id","started_at");--> statement-breakpoint
CREATE INDEX "workflow_executions_org_workflow_correlation_key_idx" ON "workflow_executions" ("org_id","workflow_id","correlation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_wait_states_hook_token_uidx" ON "workflow_wait_states" ("hook_token") WHERE "hook_token" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "workflow_wait_states_org_execution_status_idx" ON "workflow_wait_states" ("org_id","execution_id","status");--> statement-breakpoint
CREATE INDEX "workflow_wait_states_org_workflow_correlation_status_idx" ON "workflow_wait_states" ("org_id","workflow_id","correlation_key","status");--> statement-breakpoint
CREATE INDEX "workflow_wait_states_org_run_id_idx" ON "workflow_wait_states" ("org_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_org_name_ci_uidx" ON "workflows" ("org_id",lower("name"));--> statement-breakpoint
CREATE INDEX "workflows_org_updated_at_id_idx" ON "workflows" ("org_id","updated_at","id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointment_type_calendars" ADD CONSTRAINT "appointment_type_calendars_gHcf7toxCUtt_fkey" FOREIGN KEY ("appointment_type_id") REFERENCES "appointment_types"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointment_type_calendars" ADD CONSTRAINT "appointment_type_calendars_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointment_type_resources" ADD CONSTRAINT "appointment_type_resources_6XPhdSeLmkCN_fkey" FOREIGN KEY ("appointment_type_id") REFERENCES "appointment_types"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointment_type_resources" ADD CONSTRAINT "appointment_type_resources_resource_id_resources_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointment_types" ADD CONSTRAINT "appointment_types_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_appointment_type_id_appointment_types_id_fkey" FOREIGN KEY ("appointment_type_id") REFERENCES "appointment_types"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "blocked_time" ADD CONSTRAINT "blocked_time_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_inviter_id_users_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "scheduling_limits" ADD CONSTRAINT "scheduling_limits_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fkey" FOREIGN KEY ("impersonated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_execution_events" ADD CONSTRAINT "workflow_execution_events_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "workflow_execution_events" ADD CONSTRAINT "workflow_execution_events_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_execution_events" ADD CONSTRAINT "workflow_execution_events_execution_id_workflow_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_executions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD CONSTRAINT "workflow_execution_logs_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD CONSTRAINT "workflow_execution_logs_execution_id_workflow_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_wait_states" ADD CONSTRAINT "workflow_wait_states_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
ALTER TABLE "workflow_wait_states" ADD CONSTRAINT "workflow_wait_states_execution_id_workflow_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_wait_states" ADD CONSTRAINT "workflow_wait_states_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id");--> statement-breakpoint
CREATE POLICY "org_isolation_appointment_types" ON "appointment_types" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_appointments" ON "appointments" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_audit_events" ON "audit_events" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_calendars" ON "calendars" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_clients" ON "clients" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_integrations" ON "integrations" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_locations" ON "locations" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_resources" ON "resources" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_workflow_execution_events" ON "workflow_execution_events" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_workflow_execution_logs" ON "workflow_execution_logs" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_workflow_executions" ON "workflow_executions" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_workflow_wait_states" ON "workflow_wait_states" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_workflows" ON "workflows" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());
