CREATE TABLE "ai_routing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"correlation_id" text NOT NULL,
	"event_type" text NOT NULL,
	"task_type" text NOT NULL,
	"user_id" text,
	"business_id" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"reason" text,
	"status_code" integer,
	"latency_ms" integer,
	"attempt" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_routing_events_correlation_idx" ON "ai_routing_events" USING btree ("correlation_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_routing_events_created_at_idx" ON "ai_routing_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_routing_events_business_idx" ON "ai_routing_events" USING btree ("business_id","created_at");--> statement-breakpoint
-- Routing telemetry is application-internal: read only through Drizzle by the
-- admin console. Match the default-deny policy used by every other public table.
ALTER TABLE "public"."ai_routing_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_routing_events' AND policyname = 'deny_all') THEN
    CREATE POLICY "deny_all" ON "public"."ai_routing_events" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;
