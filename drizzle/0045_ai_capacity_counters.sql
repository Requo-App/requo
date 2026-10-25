CREATE TABLE "ai_capacity_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
-- Capacity counters are application-internal rows read and written only
-- through Drizzle's direct connection. Grant no access through
-- PostgREST/Supabase's anon or authenticated roles, matching the default-deny
-- policy used by every other public table.
ALTER TABLE "public"."ai_capacity_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_capacity_counters' AND policyname = 'deny_all') THEN
    CREATE POLICY "deny_all" ON "public"."ai_capacity_counters" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;
