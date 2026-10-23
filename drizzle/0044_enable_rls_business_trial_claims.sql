-- Trial claims are owner-level rows read only through Drizzle's direct
-- connection. Grant no access through PostgREST/Supabase's anon or
-- authenticated roles, matching the default-deny policy used by every other
-- public table.
ALTER TABLE "public"."business_trial_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'business_trial_claims' AND policyname = 'deny_all') THEN
    CREATE POLICY "deny_all" ON "public"."business_trial_claims" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;
