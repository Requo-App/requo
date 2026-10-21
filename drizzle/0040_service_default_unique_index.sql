-- Enforce the "at most one default service per business" invariant in the
-- database. The application already unsets every default before setting one,
-- but a partial unique index makes the invariant a fact rather than a
-- convention.
--
-- Existing rows are reconciled first: keep the oldest default per business
-- and clear the rest so the index can be created.
with ranked as (
  select
    id,
    row_number() over (
      partition by business_id
      order by created_at asc, id asc
    ) as position
  from business_inquiry_forms
  where is_default = true
)
update business_inquiry_forms as forms
set is_default = false, updated_at = now()
where forms.id in (select id from ranked where position > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "business_inquiry_forms_one_default_per_business" ON "business_inquiry_forms" USING btree ("business_id") WHERE "business_inquiry_forms"."is_default" = true;
