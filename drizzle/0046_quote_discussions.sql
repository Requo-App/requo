CREATE TYPE "public"."quote_discussion_sender_type" AS ENUM('customer', 'business');--> statement-breakpoint
ALTER TYPE "public"."business_notification_type" ADD VALUE 'quote_discussion_message' BEFORE 'quote_viewed';--> statement-breakpoint
CREATE TABLE "quote_discussion_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"discussion_id" text NOT NULL,
	"sender_type" "quote_discussion_sender_type" NOT NULL,
	"sender_user_id" text,
	"sender_name" text NOT NULL,
	"body" text NOT NULL,
	"guest_session_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_discussion_messages_body_length" CHECK (char_length("quote_discussion_messages"."body") between 1 and 4000 and char_length("quote_discussion_messages"."sender_name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "quote_discussion_reads" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"discussion_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_discussions" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"quote_id" text NOT NULL,
	"archived_at" timestamp with time zone,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_discussion_messages" ADD CONSTRAINT "quote_discussion_messages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_discussion_messages" ADD CONSTRAINT "quote_discussion_messages_discussion_id_quote_discussions_id_fk" FOREIGN KEY ("discussion_id") REFERENCES "public"."quote_discussions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_discussion_messages" ADD CONSTRAINT "quote_discussion_messages_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_discussion_reads" ADD CONSTRAINT "quote_discussion_reads_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_discussion_reads" ADD CONSTRAINT "quote_discussion_reads_discussion_id_quote_discussions_id_fk" FOREIGN KEY ("discussion_id") REFERENCES "public"."quote_discussions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_discussion_reads" ADD CONSTRAINT "quote_discussion_reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_discussions" ADD CONSTRAINT "quote_discussions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_discussions" ADD CONSTRAINT "quote_discussions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_discussion_messages_discussion_created_idx" ON "quote_discussion_messages" USING btree ("discussion_id","created_at","id");--> statement-breakpoint
CREATE INDEX "quote_discussion_messages_business_created_idx" ON "quote_discussion_messages" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_discussion_reads_discussion_user_unique" ON "quote_discussion_reads" USING btree ("discussion_id","user_id");--> statement-breakpoint
CREATE INDEX "quote_discussion_reads_user_business_idx" ON "quote_discussion_reads" USING btree ("user_id","business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_discussions_quote_unique" ON "quote_discussions" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quote_discussions_business_activity_idx" ON "quote_discussions" USING btree ("business_id","last_message_at");--> statement-breakpoint
CREATE INDEX "quote_discussions_business_archived_activity_idx" ON "quote_discussions" USING btree ("business_id","archived_at","last_message_at");--> statement-breakpoint
-- Discussion rows are read and written only through Drizzle's direct
-- connection. Deny anon/authenticated access through PostgREST, matching the
-- default-deny policy used by every other public table.
ALTER TABLE "public"."quote_discussions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."quote_discussion_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."quote_discussion_reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'quote_discussions' AND policyname = 'deny_all') THEN
    CREATE POLICY "deny_all" ON "public"."quote_discussions" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'quote_discussion_messages' AND policyname = 'deny_all') THEN
    CREATE POLICY "deny_all" ON "public"."quote_discussion_messages" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'quote_discussion_reads' AND policyname = 'deny_all') THEN
    CREATE POLICY "deny_all" ON "public"."quote_discussion_reads" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;