-- Migration: Exclusion Constraint for Non-overlapping Appointments
-- This migration adds database-enforced non-overlapping appointments per calendar

-- Enable btree_gist extension required for exclusion constraints with multiple types
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Add exclusion constraint to prevent overlapping appointments on the same calendar
-- Uses '[)' range (inclusive start, exclusive end) to allow back-to-back appointments
-- Only enforced for non-cancelled appointments (cancelled appointments don't block slots)
ALTER TABLE appointments ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING gist (
    calendar_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status != 'cancelled');

-- Add index for efficient availability queries
-- Partial index excludes cancelled appointments since they don't affect availability
CREATE INDEX idx_appointments_calendar_time
  ON appointments (calendar_id, start_at, end_at)
  WHERE status != 'cancelled';
