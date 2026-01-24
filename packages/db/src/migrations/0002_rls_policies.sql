-- Migration: RLS Policies for Multi-tenant Isolation
-- This migration creates Row Level Security policies to enforce org isolation

-- Create the helper function to get current org context
CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.current_org_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

-- Enable RLS on all org-scoped tables
-- Note: We enable RLS but don't force it on the table owner (for migrations/admin)

-- Locations
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation_locations ON locations
  FOR ALL
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- Calendars
ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation_calendars ON calendars
  FOR ALL
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- Appointment Types
ALTER TABLE appointment_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation_appointment_types ON appointment_types
  FOR ALL
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- Resources
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation_resources ON resources
  FOR ALL
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- Clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation_clients ON clients
  FOR ALL
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- Appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation_appointments ON appointments
  FOR ALL
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- Event Outbox
ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation_event_outbox ON event_outbox
  FOR ALL
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- Note: Tables without org_id don't need RLS:
-- - orgs (root table)
-- - users (shared across orgs, filtered via org_memberships)
-- - org_memberships (controls user-org relationships)
-- - sessions, accounts, verifications (BetterAuth tables)
-- - availability_rules, availability_overrides, blocked_time, scheduling_limits
--   (these are scoped via calendar_id, which is already org-scoped)
