ALTER TYPE "public"."subscription_status" ADD VALUE 'trialing' BEFORE 'pending';--> statement-breakpoint
CREATE TABLE "business_trial_claims" (
	"user_id" text PRIMARY KEY NOT NULL,
	"business_id" text,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_trial_claims" ADD CONSTRAINT "business_trial_claims_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_trial_claims_business_id_idx" ON "business_trial_claims" USING btree ("business_id");