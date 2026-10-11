# Requo Data Layer

How data is stored and accessed. See `docs/database-migrations.md` for the migration workflow; this file describes the shape and patterns.

## Technology

- **Postgres hosted on Supabase**, accessed only via **Drizzle ORM 0.45** + `postgres-js` (`lib/db/client.ts`). Singleton via `globalThis` in non-prod.
- **Connection:** runtime `DATABASE_URL` (pooler, port 6543, `prepare: false`, small pool); migrations `DATABASE_MIGRATION_URL` (direct, port 5432, `max: 1`). Strict migrate rejects pooler URLs (`scripts/migrate.ts`, `drizzle.config.ts`: `dialect: postgresql`, `strict: true`, schema `./lib/db/schema/index.ts`, out `./drizzle`).
- **IDs** are `text` PKs. New Requo-owned rows get UUIDv7 via `newEntityId()` (`lib/ids.ts`); existing IDs stay stable (mixed historical formats). Human document numbers (`Q-NNNN`, `INV-NNNNNN`, `PAY-YYYY-NNNN`) are separate fields, never identity. Authoritative rule: `docs/architecture/adr-014-entity-id-standard.md`. Timestamps `timestamptz defaultNow()`. Money in integer cents with `CHECK` constraints (e.g. `total = subtotal - discount + tax`).
- **No pgvector.** `business_memories.embedding` and `business_knowledge_chunks.embedding` are `jsonb number[]`; cosine similarity computed app-side (`features/memory/retrieval.ts`). Works because per-business memory counts are small — retrieval caps candidates by recency (`KNOWLEDGE_CANDIDATE_LIMIT_MEMORIES = 200`, `KNOWLEDGE_CANDIDATE_LIMIT_CHUNKS = 500`) rather than loading the whole corpus. Still no full-text search and no Postgres extension: lexical matching is whole-token in application code (`lib/ai/text-terms.ts`). Null embeddings are repaired by the hourly `cron-embedding-backfill`, so no schema change was needed for that either.
- **RLS default-deny** (`drizzle/0007_*`) exists only to silence the Supabase linter — the app connects directly via Drizzle and bypasses RLS. Tenant isolation is enforced in application code, not policies.

## Schema organization

Source of truth: `lib/db/schema/index.ts` (barrel over 31 modules). Key modules:

| Module | Tables | Notes |
|---|---|---|
| `businesses.ts` | `businesses`, `business_members`, `profiles`, `user_recent_businesses`, `business_member_invites`, `business_invite_links` | `businesses.slug` unique + format check; `plan` read cache; role enum `owner/manager/staff`, unique `(businessId, userId)` |
| `auth.ts` | `user`, `session`, `account`, `verification`, `rate_limit` | Better Auth tables via drizzle adapter |
| `inquiries.ts` | `inquiries`, `inquiry_messages`, `inquiry_attachments`, `inquiry_notes`, `inquiry_duplicates` | Status enum; indexes on `(business, status)`, submitted dates; partial open-deadline index |
| `quotes.ts` | `quotes`, `quote_items`, `quote_versions`, `quote_revision_requests` | `quoteNumber` unique per business; `publicTokenHash` unique; partial `sent_valid_until` / auto-follow-up indexes |
| `invoices.ts` | `invoices`, `invoice_line_items`, `payments` | Unique partial `(businessId, quoteId)` for non-void; manual payments only |
| `follow-ups.ts` | `follow_ups` | Check `inquiryId OR quoteId`; partial `pending_due` index; `send_mode` enum `manual/automatic` |
| `business-inquiry-forms.ts` | `business_inquiry_forms` | User-facing name "Service"; slug unique per business |
| `business-packs.ts` | `business_pack_assignments`, `business_pack_assignment_history` | Behavior-pack assignment (F-01): one nullable-`pack` row per business + append-only history; `behavior_pack` enum of 6 |
| `pack-recipes.ts` | `pack_recipes` | Versioned recipes per (business, kind); one active per kind (partial unique); `pack_recipe_kind` enum of 5 |
| `scope-blocks.ts` | `quote_scope_blocks` | Typed scope sections; `scope_block_kind` enum of 10, `scope_block_state` enum of 3; waiver consistency CHECK |
| `approvals.ts` | `approval_chains`, `approvals`, `approval_artifacts` | P1: chain identity + version rows (one pending per chain) + one-directional artifacts; subject exactly-one CHECKs |
| `change-orders.ts` | `change_orders`, `change_order_lines` | P2: append-only COs (one pending per quote) + target-exactly-one deltas |
| `schedules.ts` | `commercial_schedules`, `commercial_schedule_items` | P5: versioned schedules; one editable per quote; amount/% exclusivity CHECKs |
| `quote-library.ts` | `quote_library_entries`, `quote_library_entry_items` | Kinds `block/package/template` |
| `memories.ts` / `knowledge-files.ts` | `business_memories`, `business_knowledge_files`, `business_knowledge_chunks` | Categories incl. `pricing_knowledge` (context only); file status enum |
| `ai.ts` / `ai-agent.ts` / `owner-assistant.ts` | `ai_usage_events`, `ai_token_logs`; `ai_agent_sessions/messages/runs`; `owner_assistant_sessions/messages` | Usage metering + chat persistence |
| `analytics.ts` | `analytics_events`, `analytics_daily_rollups`, `analytics_benchmarks`, `analytics_scheduled_reports`, … | Event types `inquiry_form_viewed`, `quote_public_viewed` |
| `notifications.ts` | `business_notifications`, `business_notification_states`, `business_notification_reads` | Read = watermark OR explicit row |
| `subscriptions.ts` | `account_subscriptions`, `business_subscriptions`, `billing_events`, `payment_attempts`, `refunds` | `business_subscriptions.businessId` unique; `billing_events.providerEventId` unique (idempotency) |
| `email.ts` | `email_outbox`, `email_attempts` | `idempotencyKey` unique; status `pending/sending/sent/failed/unknown` |
| `audit.ts` / `admin.ts` / `activity.ts` | `audit_logs`, `admin_audit_logs`, `activity_logs` | Business audit vs admin audit (no businessId) |
| `push-subscriptions.ts` / `reply-snippets.ts` / `public-actions.ts` / `compliance.ts` | misc | Push endpoints; orphaned snippets; rate-limit ledger; exports + AI security events |

Every business-scoped table carries `business_id NOT NULL → businesses.id ON DELETE CASCADE` plus composite indexes. Soft-delete (`deleted_at/by`), archive (`archived_at`) where applicable.

## Data-access patterns

- Reads/writes live in `features/*/queries.ts` / `mutations.ts` (`"server-only"`), called from `features/*/actions.ts` (`"use server"`) or route handlers. There is no repository layer.
- **Tenant scoping:** resolve `businessContext` once via `getBusinessActionContext` (`lib/db/business-access.ts`), then predicate every query with `and(eq(table.businessId, businessContext.business.id), …)`. Public routes scope by opaque token hash instead of membership.
- **Transactions** for multi-row writes that must stay consistent (e.g. knowledge-file chunk replacement, confirmation consumption with `FOR UPDATE`).
- **Caching:** hot reads wrap `React.cache()` (request dedup) around a `"use cache"` inner function (cross-request). Tags in `lib/cache/shell-tags.ts` (user) + `lib/cache/business-tags.ts` (business); mutations call `revalidateTag`. Circuit-breaker (`lib/db/circuit-breaker.ts`) guards dashboard reads only — auth/billing/migrations bypass it.
- **Validation:** all external input through Zod (`features/*/schemas.ts`) before any DB work.

## Supabase: what is actually used

| Capability | Used? | How |
|---|---|---|
| Postgres | Yes (system of record) | Via Drizzle/`postgres-js` only; no PostgREST reads in app paths |
| Storage | Yes (private buckets, server-side only) | `inquiry-attachments`, `knowledge-files`, `business-assets` (logos), `profile-assets` (avatars) — via `createSupabaseAdminClient()` (service role); downloads through authenticated route handlers |
| Realtime | Yes (notifications only) | Browser subscribes with 15-min HS256 JWT (`lib/supabase/realtime-auth.ts`, issued at `app/api/business/notifications/realtime-token/route.ts`) |
| Auth | **No** | Better Auth only; Supabase clients set `persistSession: false` |
| pgvector / Edge Functions | **No** | Embeddings in `jsonb`; no edge functions |

Bucket names: `features/inquiries/mutations.ts` (attachments), `features/memory/processing.ts` (knowledge-files), `features/settings/*` + `features/onboarding/actions.ts` (logos), `features/account/*` (avatars). Per-entity CSV exports stream from the `app/api/business/[slug]/*/export` route handlers (no export storage bucket).

## Migrations

37 SQL files (`drizzle/0000_init` → `0036_verticalization_primitives`; no `0019`; `0021` duplicated — see `docs/technical-debt.md`). Notable: `0012` removed jobs/automations, `0014` renamed pricing → product library, `0016` agent v1, `0018` owner assistant, `0021` invoice payment tracking, `0029` AI usage plan attribution, `0030` dropped the dead `quote_post_acceptance_status` enum, `0031` manual payment upgrade, `0032` quote acceptances, `0033` follow-up send mode, `0034` private storage buckets, `0035` behavior-pack assignments, `0036` verticalization primitives (approvals, change orders, scope blocks, schedules).

Dev flow: edit `lib/db/schema/*` → `npm run db:generate -- --name descriptive_name` → `npm run db:migrate` → commit schema + SQL together. Prod: `vercel-build` applies only. Never `db:push`/`db:generate` against production; never edit a committed migration. Full procedure: `docs/database-migrations.md`.
