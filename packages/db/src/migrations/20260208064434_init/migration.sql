-- Extensions
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
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
CREATE TYPE "journey_delivery_status" AS ENUM('planned', 'sent', 'failed', 'canceled', 'skipped');--> statement-breakpoint
CREATE TYPE "journey_mode" AS ENUM('live', 'test');--> statement-breakpoint
CREATE TYPE "journey_run_mode" AS ENUM('live', 'test');--> statement-breakpoint
CREATE TYPE "journey_trigger_entity_type" AS ENUM('appointment', 'client');--> statement-breakpoint
CREATE TYPE "journey_run_status" AS ENUM('planned', 'running', 'completed', 'canceled', 'failed');--> statement-breakpoint
CREATE TYPE "journey_run_step_log_status" AS ENUM('pending', 'running', 'success', 'error', 'cancelled');--> statement-breakpoint
CREATE TYPE "journey_state" AS ENUM('draft', 'published', 'paused');--> statement-breakpoint
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
	"client_id" uuid NOT NULL,
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
	"date" date NOT NULL,
	"time_ranges" jsonb DEFAULT '[]' NOT NULL,
	"group_id" uuid
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"calendar_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
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
	"slot_interval_min" integer DEFAULT 15 NOT NULL,
	"requires_confirmation" boolean DEFAULT false NOT NULL,
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
	"reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_phone_e164_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{1,14}$')
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TYPE "custom_attribute_type" AS ENUM('TEXT', 'NUMBER', 'DATE', 'DATE_TIME', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'RELATION_CLIENT');--> statement-breakpoint
CREATE TYPE "custom_attribute_relation_target_entity" AS ENUM('CLIENT');--> statement-breakpoint
CREATE TYPE "custom_attribute_relation_value_mode" AS ENUM('single', 'multi');--> statement-breakpoint
CREATE TYPE "custom_attribute_relation_paired_role" AS ENUM('forward', 'reverse');--> statement-breakpoint
CREATE TABLE "client_custom_attribute_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"type" "custom_attribute_type" NOT NULL,
	"slot_column" text,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"relation_target_entity" "custom_attribute_relation_target_entity",
	"relation_value_mode" "custom_attribute_relation_value_mode",
	"paired_definition_id" uuid,
	"paired_role" "custom_attribute_relation_paired_role",
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_custom_attribute_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_custom_attribute_values" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"t0" text,
	"t1" text,
	"t2" text,
	"t3" text,
	"t4" text,
	"t5" text,
	"t6" text,
	"t7" text,
	"t8" text,
	"t9" text,
	"n0" numeric(18, 4),
	"n1" numeric(18, 4),
	"n2" numeric(18, 4),
	"n3" numeric(18, 4),
	"n4" numeric(18, 4),
	"d0" timestamp with time zone,
	"d1" timestamp with time zone,
	"d2" timestamp with time zone,
	"b0" boolean,
	"b1" boolean,
	"b2" boolean,
	"b3" boolean,
	"b4" boolean,
	"j0" jsonb,
	"j1" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_custom_attribute_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_custom_attribute_relations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"source_client_id" uuid NOT NULL,
	"target_client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_car_source_target_distinct_chk" CHECK ("source_client_id" <> "target_client_id")
);
--> statement-breakpoint
ALTER TABLE "client_custom_attribute_relations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
CREATE TABLE "journey_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"journey_run_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"channel" text NOT NULL,
	"action_type" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "journey_delivery_status" NOT NULL,
	"reason_code" text,
	"deterministic_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journey_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journey_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"journey_version_id" uuid,
	"trigger_entity_type" "journey_trigger_entity_type" DEFAULT 'appointment'::"journey_trigger_entity_type" NOT NULL,
	"trigger_entity_id" uuid NOT NULL,
	"appointment_id" uuid,
	"client_id" uuid,
	"mode" "journey_run_mode" NOT NULL,
	"status" "journey_run_status" NOT NULL,
	"journey_name_snapshot" text NOT NULL,
	"journey_version_snapshot" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "journey_runs_trigger_identity_check" CHECK ((("trigger_entity_type" = 'appointment' AND "appointment_id" IS NOT NULL AND "trigger_entity_id" = "appointment_id") OR ("trigger_entity_type" = 'client' AND "appointment_id" IS NULL AND ("client_id" IS NULL OR "trigger_entity_id" = "client_id"))))
);
--> statement-breakpoint
ALTER TABLE "journey_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journey_run_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"journey_run_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journey_run_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journey_run_step_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"journey_run_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"node_type" text NOT NULL,
	"status" "journey_run_step_log_status" NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journey_run_step_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journey_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"journey_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition_snapshot" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journey_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journeys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"state" "journey_state" DEFAULT 'draft'::"journey_state" NOT NULL,
	"mode" "journey_mode" DEFAULT 'live'::"journey_mode" NOT NULL,
	"draft_definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journeys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"org_id" uuid NOT NULL,
	"calendar_id" uuid,
	"group_id" uuid,
	"min_notice_minutes" integer,
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
CREATE INDEX "audit_events_org_id_idx" ON "audit_events" ("org_id","id");--> statement-breakpoint
CREATE INDEX "audit_events_org_entity_id_idx" ON "audit_events" ("org_id","entity_type","entity_id","id");--> statement-breakpoint
CREATE INDEX "audit_events_org_created_at_id_idx" ON "audit_events" ("org_id","created_at","id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_brin_idx" ON "audit_events" USING brin ("created_at");--> statement-breakpoint
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
CREATE UNIQUE INDEX "clients_org_reference_id_unique_idx" ON "clients" ("org_id","reference_id") WHERE "reference_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "clients_org_updated_id_idx" ON "clients" ("org_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "clients_first_name_trgm_idx" ON "clients" USING gin ("first_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clients_last_name_trgm_idx" ON "clients" USING gin ("last_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clients_email_trgm_idx" ON "clients" USING gin ((email::text) gin_trgm_ops) WHERE "email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_org_key_unique_idx" ON "integrations" ("org_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_deliveries_org_deterministic_key_uidx" ON "journey_deliveries" ("org_id","deterministic_key");--> statement-breakpoint
CREATE INDEX "journey_deliveries_org_run_scheduled_for_idx" ON "journey_deliveries" ("org_id","journey_run_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "journey_deliveries_org_status_idx" ON "journey_deliveries" ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_runs_org_identity_uidx" ON "journey_runs" ("org_id","journey_version_id","trigger_entity_type","trigger_entity_id","mode");--> statement-breakpoint
CREATE INDEX "journey_runs_org_status_idx" ON "journey_runs" ("org_id","status");--> statement-breakpoint
CREATE INDEX "journey_runs_org_mode_started_at_idx" ON "journey_runs" ("org_id","mode","started_at");--> statement-breakpoint
CREATE INDEX "journey_runs_org_client_started_at_idx" ON "journey_runs" ("org_id","client_id","started_at");--> statement-breakpoint
CREATE INDEX "journey_runs_org_appointment_started_at_idx" ON "journey_runs" ("org_id","appointment_id","started_at");--> statement-breakpoint
CREATE INDEX "journey_run_events_org_run_created_at_idx" ON "journey_run_events" ("org_id","journey_run_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_run_step_logs_org_run_step_uidx" ON "journey_run_step_logs" ("org_id","journey_run_id","step_key");--> statement-breakpoint
CREATE INDEX "journey_run_step_logs_org_run_started_at_idx" ON "journey_run_step_logs" ("org_id","journey_run_id","started_at");--> statement-breakpoint
CREATE INDEX "journey_run_step_logs_org_step_key_idx" ON "journey_run_step_logs" ("org_id","step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_versions_org_journey_version_uidx" ON "journey_versions" ("org_id","journey_id","version");--> statement-breakpoint
CREATE INDEX "journey_versions_org_journey_published_at_idx" ON "journey_versions" ("org_id","journey_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "journeys_org_name_ci_uidx" ON "journeys" ("org_id",lower("name"));--> statement-breakpoint
CREATE INDEX "journeys_org_updated_at_id_idx" ON "journeys" ("org_id","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_memberships_org_user_idx" ON "org_memberships" ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "scheduling_limits_calendar_id_idx" ON "scheduling_limits" ("calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_limits_org_default_uidx" ON "scheduling_limits" ("org_id") WHERE "calendar_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_limits_org_calendar_uidx" ON "scheduling_limits" ("org_id","calendar_id") WHERE "calendar_id" is not null;--> statement-breakpoint
CREATE INDEX "appointments_client_id_idx" ON "appointments" ("client_id");--> statement-breakpoint
CREATE INDEX "appointments_appointment_type_id_active_idx" ON "appointments" ("appointment_type_id") WHERE "status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" ("user_id");--> statement-breakpoint
CREATE INDEX "journey_run_events_created_at_brin_idx" ON "journey_run_events" USING brin ("created_at");--> statement-breakpoint
CREATE INDEX "journey_run_step_logs_created_at_brin_idx" ON "journey_run_step_logs" USING brin ("created_at");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointment_type_calendars" ADD CONSTRAINT "appointment_type_calendars_gHcf7toxCUtt_fkey" FOREIGN KEY ("appointment_type_id") REFERENCES "appointment_types"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointment_type_calendars" ADD CONSTRAINT "appointment_type_calendars_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointment_type_resources" ADD CONSTRAINT "appointment_type_resources_6XPhdSeLmkCN_fkey" FOREIGN KEY ("appointment_type_id") REFERENCES "appointment_types"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointment_type_resources" ADD CONSTRAINT "appointment_type_resources_resource_id_resources_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointment_types" ADD CONSTRAINT "appointment_types_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_appointment_type_id_appointment_types_id_fkey" FOREIGN KEY ("appointment_type_id") REFERENCES "appointment_types"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "blocked_time" ADD CONSTRAINT "blocked_time_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journey_deliveries" ADD CONSTRAINT "journey_deliveries_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journey_deliveries" ADD CONSTRAINT "journey_deliveries_journey_run_id_journey_runs_id_fkey" FOREIGN KEY ("journey_run_id") REFERENCES "journey_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journey_runs" ADD CONSTRAINT "journey_runs_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journey_runs" ADD CONSTRAINT "journey_runs_journey_version_id_journey_versions_id_fkey" FOREIGN KEY ("journey_version_id") REFERENCES "journey_versions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "journey_runs" ADD CONSTRAINT "journey_runs_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "journey_run_events" ADD CONSTRAINT "journey_run_events_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journey_run_events" ADD CONSTRAINT "journey_run_events_journey_run_id_journey_runs_id_fkey" FOREIGN KEY ("journey_run_id") REFERENCES "journey_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journey_run_step_logs" ADD CONSTRAINT "journey_run_step_logs_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journey_run_step_logs" ADD CONSTRAINT "journey_run_step_logs_journey_run_id_journey_runs_id_fkey" FOREIGN KEY ("journey_run_id") REFERENCES "journey_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journey_versions" ADD CONSTRAINT "journey_versions_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journey_versions" ADD CONSTRAINT "journey_versions_journey_id_journeys_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_inviter_id_users_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "scheduling_limits" ADD CONSTRAINT "scheduling_limits_calendar_id_calendars_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fkey" FOREIGN KEY ("impersonated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "journey_runs" ADD CONSTRAINT "journey_runs_appointment_id_appointments_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "scheduling_limits" ADD CONSTRAINT "scheduling_limits_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "org_isolation_appointment_types" ON "appointment_types" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_appointments" ON "appointments" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_audit_events" ON "audit_events" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_calendars" ON "calendars" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_clients" ON "clients" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_integrations" ON "integrations" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_journey_deliveries" ON "journey_deliveries" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_journey_runs" ON "journey_runs" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_journey_run_events" ON "journey_run_events" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_journey_run_step_logs" ON "journey_run_step_logs" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_journey_versions" ON "journey_versions" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_journeys" ON "journeys" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_locations" ON "locations" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_resources" ON "resources" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE UNIQUE INDEX "client_cad_org_field_key_uidx" ON "client_custom_attribute_definitions" USING btree ("org_id","field_key");--> statement-breakpoint
CREATE UNIQUE INDEX "client_cad_org_slot_column_uidx" ON "client_custom_attribute_definitions" USING btree ("org_id","slot_column");--> statement-breakpoint
CREATE UNIQUE INDEX "client_cav_org_client_uidx" ON "client_custom_attribute_values" USING btree ("org_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_car_org_definition_source_target_uidx" ON "client_custom_attribute_relations" USING btree ("org_id","definition_id","source_client_id","target_client_id");--> statement-breakpoint
CREATE INDEX "client_car_org_definition_source_idx" ON "client_custom_attribute_relations" USING btree ("org_id","definition_id","source_client_id");--> statement-breakpoint
CREATE INDEX "client_car_org_definition_target_idx" ON "client_custom_attribute_relations" USING btree ("org_id","definition_id","target_client_id");--> statement-breakpoint
ALTER TABLE "client_custom_attribute_definitions" ADD CONSTRAINT "client_custom_attribute_definitions_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "client_custom_attribute_definitions" ADD CONSTRAINT "client_custom_attribute_definitions_paired_definition_id_client_custom_attribute_definitions_id_fkey" FOREIGN KEY ("paired_definition_id") REFERENCES "client_custom_attribute_definitions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "client_custom_attribute_values" ADD CONSTRAINT "client_custom_attribute_values_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "client_custom_attribute_values" ADD CONSTRAINT "client_custom_attribute_values_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "client_custom_attribute_relations" ADD CONSTRAINT "client_custom_attribute_relations_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "client_custom_attribute_relations" ADD CONSTRAINT "client_custom_attribute_relations_definition_id_client_custom_attribute_definitions_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "client_custom_attribute_definitions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "client_custom_attribute_relations" ADD CONSTRAINT "client_custom_attribute_relations_source_client_id_clients_id_fkey" FOREIGN KEY ("source_client_id") REFERENCES "clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "client_custom_attribute_relations" ADD CONSTRAINT "client_custom_attribute_relations_target_client_id_clients_id_fkey" FOREIGN KEY ("target_client_id") REFERENCES "clients"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "org_isolation_client_custom_attribute_definitions" ON "client_custom_attribute_definitions" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());--> statement-breakpoint
CREATE POLICY "org_isolation_client_custom_attribute_values" ON "client_custom_attribute_values" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());
--> statement-breakpoint
CREATE POLICY "org_isolation_client_custom_attribute_relations" ON "client_custom_attribute_relations" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER set_updated_at_accounts BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_apikey BEFORE UPDATE ON apikey FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_sessions BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_verifications BEFORE UPDATE ON verifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_org_memberships BEFORE UPDATE ON org_memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_orgs BEFORE UPDATE ON orgs FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_locations BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_calendars BEFORE UPDATE ON calendars FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_appointment_types BEFORE UPDATE ON appointment_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_resources BEFORE UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_clients BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_client_custom_attribute_definitions BEFORE UPDATE ON client_custom_attribute_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_client_custom_attribute_values BEFORE UPDATE ON client_custom_attribute_values FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_client_custom_attribute_relations BEFORE UPDATE ON client_custom_attribute_relations FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_integrations BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_appointments BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_journeys BEFORE UPDATE ON journeys FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_journey_deliveries BEFORE UPDATE ON journey_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_journey_run_step_logs BEFORE UPDATE ON journey_run_step_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_updated_at_audit_events BEFORE UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
