ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "org_isolation_audit_events" ON "audit_events" AS PERMISSIVE FOR ALL TO public USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());
