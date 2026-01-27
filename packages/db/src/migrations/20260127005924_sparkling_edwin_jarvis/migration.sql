CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE INDEX "appointment_type_resources_resource_idx" ON "appointment_type_resources" ("resource_id","appointment_type_id");--> statement-breakpoint
CREATE INDEX "appointments_calendar_range_gist_idx" ON "appointments" USING gist ("calendar_id",tstzrange("start_at", "end_at", '[)')) WHERE "status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "blocked_time_calendar_range_gist_idx" ON "blocked_time" USING gist ("calendar_id",tstzrange("start_at", "end_at", '[)'));
