DROP TRIGGER IF EXISTS check_appointment_capacity_update ON appointments;--> statement-breakpoint
DROP INDEX IF EXISTS appointments_calendar_start_at_idx;--> statement-breakpoint
DROP INDEX IF EXISTS appointments_calendar_range_gist_idx;--> statement-breakpoint
DROP INDEX IF EXISTS idx_appointments_resource_check;--> statement-breakpoint
CREATE TYPE "appointment_status" AS ENUM('scheduled', 'confirmed', 'cancelled', 'no_show');--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "status" SET DATA TYPE "appointment_status" USING "status"::"appointment_status";--> statement-breakpoint
CREATE INDEX appointments_calendar_start_at_idx ON appointments (calendar_id, start_at) WHERE (status <> 'cancelled');--> statement-breakpoint
CREATE INDEX appointments_calendar_range_gist_idx ON appointments USING gist (calendar_id, tstzrange(start_at, end_at, '[)')) WHERE (status <> 'cancelled');--> statement-breakpoint
CREATE INDEX idx_appointments_resource_check ON appointments (appointment_type_id, start_at, end_at) WHERE (status <> 'cancelled');--> statement-breakpoint
CREATE TRIGGER check_appointment_capacity_update BEFORE UPDATE ON appointments FOR EACH ROW WHEN (((old.status = 'cancelled') AND (new.status <> 'cancelled')) OR (old.start_at <> new.start_at) OR (old.end_at <> new.end_at) OR (old.calendar_id <> new.calendar_id) OR (old.appointment_type_id <> new.appointment_type_id)) EXECUTE FUNCTION check_appointment_capacity();