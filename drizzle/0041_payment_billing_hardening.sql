ALTER TYPE "public"."subscription_status" ADD VALUE 'paused' BEFORE 'canceled';--> statement-breakpoint
ALTER TABLE "billing_events" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "business_subscriptions" ADD COLUMN "provider_event_at" timestamp with time zone;--> statement-breakpoint

-- Existing installations may already contain duplicate payment attempts
-- because the old code inserted a row per delivery. Keep the succeeded row
-- when one exists; otherwise keep the newest row before enforcing uniqueness.
DELETE FROM "payment_attempts" AS older
USING "payment_attempts" AS newer
WHERE older.provider = newer.provider
  AND older.provider_payment_id = newer.provider_payment_id
  AND older.id <> newer.id
  AND (
    -- Any succeeded row outranks any non-succeeded row.
    (older.status <> 'succeeded' AND newer.status = 'succeeded')
    OR (
      -- Within the same success category, keep the newest row.
      (older.status = 'succeeded') = (newer.status = 'succeeded')
      AND (
        older.created_at < newer.created_at
        OR (older.created_at = newer.created_at AND older.id < newer.id)
      )
    )
  );--> statement-breakpoint

CREATE UNIQUE INDEX "payment_attempts_provider_payment_id_unique" ON "payment_attempts" USING btree ("provider","provider_payment_id");