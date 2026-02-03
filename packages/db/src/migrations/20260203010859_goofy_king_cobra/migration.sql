ALTER TABLE "orgs" ADD COLUMN "default_timezone" text DEFAULT 'America/New_York';--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "default_business_hours_start" text DEFAULT '09:00';--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "default_business_hours_end" text DEFAULT '17:00';--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "default_business_days" jsonb DEFAULT '[1,2,3,4,5]';--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "notifications_enabled" boolean DEFAULT true;