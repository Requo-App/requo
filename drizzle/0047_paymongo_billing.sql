CREATE TYPE "public"."paymongo_checkout_intent_status" AS ENUM('pending', 'succeeded', 'failed', 'expired');--> statement-breakpoint
ALTER TYPE "public"."billing_provider" ADD VALUE 'paymongo';--> statement-breakpoint
CREATE TABLE "paymongo_checkout_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider_session_id" text,
	"plan" text NOT NULL,
	"interval" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" "billing_currency" DEFAULT 'PHP' NOT NULL,
	"status" "paymongo_checkout_intent_status" DEFAULT 'pending' NOT NULL,
	"provider_payment_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paymongo_checkout_intents" ADD CONSTRAINT "paymongo_checkout_intents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paymongo_checkout_intents" ADD CONSTRAINT "paymongo_checkout_intents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paymongo_checkout_intents_provider_session_id_unique" ON "paymongo_checkout_intents" USING btree ("provider_session_id");--> statement-breakpoint
CREATE INDEX "paymongo_checkout_intents_business_id_idx" ON "paymongo_checkout_intents" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "paymongo_checkout_intents_status_idx" ON "paymongo_checkout_intents" USING btree ("status");--> statement-breakpoint
-- Checkout intents are read and written only through Drizzle's direct
-- connection. Deny anon/authenticated access through PostgREST, matching the
-- default-deny policy used by every other public table.
ALTER TABLE "public"."paymongo_checkout_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'paymongo_checkout_intents' AND policyname = 'deny_all') THEN
    CREATE POLICY "deny_all" ON "public"."paymongo_checkout_intents" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;