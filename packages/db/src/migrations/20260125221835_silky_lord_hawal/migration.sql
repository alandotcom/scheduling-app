CREATE INDEX "appointments_calendar_start_at_idx" ON "appointments" ("calendar_id","start_at") WHERE "status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "audit_events_action_id_idx" ON "audit_events" ("action","id");--> statement-breakpoint
CREATE INDEX "availability_overrides_calendar_date_idx" ON "availability_overrides" ("calendar_id","date");--> statement-breakpoint
CREATE INDEX "availability_rules_calendar_idx" ON "availability_rules" ("calendar_id");--> statement-breakpoint
CREATE INDEX "blocked_time_calendar_start_idx" ON "blocked_time" ("calendar_id","start_at");--> statement-breakpoint
CREATE INDEX "blocked_time_calendar_end_idx" ON "blocked_time" ("calendar_id","end_at");--> statement-breakpoint
CREATE INDEX "blocked_time_calendar_recurring_idx" ON "blocked_time" ("calendar_id") WHERE "recurring_rule" is not null;