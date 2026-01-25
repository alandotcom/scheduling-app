-- Migration: RLS for org_memberships table
-- Enables row-level security for org_memberships using both org_id and user_id context

-- Create the helper function to get current user context
CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid;
$$ LANGUAGE SQL STABLE;

-- Enable RLS on org_memberships
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see memberships in their current org OR their own memberships
-- This allows:
--   1. Viewing all members of an org you belong to (when org context is set)
--   2. Viewing your own memberships (when user context is set)
CREATE POLICY user_org_memberships ON org_memberships
  FOR ALL
  USING (
    org_id = current_org_id() OR user_id = current_user_id()
  )
  WITH CHECK (
    org_id = current_org_id() OR user_id = current_user_id()
  );
