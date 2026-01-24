-- Migration: RLS Policy for API Tokens
-- Ensures API tokens are isolated by org

-- API Tokens
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation_api_tokens ON api_tokens
  FOR ALL
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());
