# Requo Integrations

Every external integration actually used: purpose, package, where, auth, env, failure behavior. Only listed integrations exist — do not invent others.

## Supabase (Postgres + Storage + Realtime)

- Packages: `@supabase/ssr`, `@supabase/supabase-js`. Clients: `lib/supabase/admin.ts` (service role, server-only), `server.ts` / `browser.ts` (anon, `persistSession: false`).
- Postgres is the system of record via Drizzle (not PostgREST). Storage buckets (private, server-side only): `inquiry-attachments` (`features/inquiries/mutations.ts`), `knowledge-files` (`features/memory/processing.ts`, `actions.ts`), `business-assets` logos (`features/settings/*`, `features/onboarding/actions.ts`, served at `app/api/public/businesses/[slug]/logo/route.ts`), `profile-assets` avatars (`features/account/*`). Downloads go through authenticated route handlers. CSV exports stream directly from the per-entity `app/api/business/[slug]/*/export` route handlers (no storage bucket).
- Realtime only for the notification bell (`features/notifications/components/dashboard-notification-bell.tsx`): channels `business-notifications:{biz}:{user}` etc., auth via 15-min HS256 JWT (`lib/supabase/realtime-auth.ts`, issued at `app/api/business/notifications/realtime-token/route.ts`; 503 if `SUPABASE_JWT_SECRET` unset).
- Env: `DATABASE_URL` (pooler 6543), `DATABASE_MIGRATION_URL` (direct 5432), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.
- Failure: Storage upload failure fails the enclosing mutation loudly (inquiry submit reports; knowledge file → `failed` status with `failureReason`). Missing JWT secret disables realtime subscribe (bell falls back to polling state).

## Email: Resend → Mailtrap → Brevo

- Package: `resend`. Code: `sendEmailWithFallback` (`lib/email/send-email.ts`), provider order + `isConfigured()` filter (`lib/email/providers/index.ts:8-12`), per-provider send (`providers/{resend,mailtrap,brevo}.ts`), error classification (`lib/email/errors.ts`), senders (`lib/email/senders.ts`). Outbox: `email_outbox` (idempotencyKey unique) + `email_attempts`.
- Env: `RESEND_API_KEY`, `MAILTRAP_API_TOKEN`, `BREVO_API_KEY`, `EMAIL_DOMAIN`, `EMAIL_FROM_*` (+ legacy `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO_EMAIL`), `LOW_EMAIL_MODE`, `DISABLE_MAGIC_LINK`.
- Failure: provider errors classified (rate-limit vs auth vs transient) and tried down the chain; final state `failed`/`unknown` recorded with attempts. Keep one provider configured for small deployments; verify sending domains per provider.

## AI providers (7, server-side only)

- SDKs: `ai`, `@ai-sdk/groq`, `@ai-sdk/cerebras`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/openai-compatible` (Cloudflare + NVIDIA), `@openrouter/ai-sdk-provider`, `@ai-sdk/react` (chat hooks). All calls through `lib/ai/router.ts` + `capacity-selector.ts` — never from feature code.
- Fallback order: Groq → Cerebras → Gemini → Mistral → Cloudflare → NVIDIA NIM → OpenRouter. Routing profiles in `lib/ai/routing-profiles.ts`; catalog in `lib/ai/catalog.ts`.
- Env: `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`, `NVIDIA_NIM_API_KEY`, `OPENROUTER_API_KEY`; budgets `AI_TPM_*`, `AI_RPM_*`/`AI_RPD_*`/`AI_TPD_*` overrides, `AI_NEURONS_CLOUDFLARE_DAILY`; `AI_CANARY_SECRET`. Configure at least one provider. Limits reference: `docs/setup/ai-provider-limits.md`.
- Failure: per-provider timeouts, 429 backoff (capped 5s), dead-model list (6h), oversized-context reorder, streaming fallback preserving the stream. Exhaustion surfaces as typed quota errors, never fabricated content.

## Polar billing (sole processor, merchant of record)

- Packages: `@polar-sh/nextjs@0.9.6`, `@polar-sh/sdk@0.47.1`. Single write path `lib/billing/subscription-service.ts` (syncs authoritative `business_subscriptions` → cache `businesses.plan`); webhook processor + `billing_events` idempotency (`lib/billing/webhook-processor.ts`); refunds are portal-initiated (no refunds module in `lib/billing/`).
- Routes: `app/api/billing/polar/{checkout,customer-portal,webhook}/route.ts` (+ `webhook/handlers/order.ts`); thin `app/api/account/billing/checkout/route.ts`. Identity: `customer.externalId = business.id`, fallback `providerCustomerId`/`metadata.businessId`. Refunds happen in the Polar customer portal and reach Requo via `subscription.canceled` / `subscription.revoked` events.
- Env: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER` (sandbox|production, must match token origin), `POLAR_{PRO,BUSINESS}_{,YEARLY}_PRODUCT_ID` (+ legacy IDs for reverse-resolution), `NEXT_PUBLIC_APP_URL`. Webhook events: `subscription.created/active/updated/canceled/uncanceled/revoked`, `order.paid/updated/refunded`. Setup + cutover: `docs/setup/billing.md`.
- Failure: webhook processor records and ignores duplicates; token/server mismatch fails at request time (silent — verify dashboard pairing first).

## Inngest (background jobs)

- Package: `inngest`. Client/events/send/batch: `lib/inngest/*`; functions: `lib/inngest/functions/{cron,events,knowledge,index}.ts`; feature jobs: `features/*/jobs/*`; webhook: `app/api/inngest/route.ts`. Dev: `npm run dev:inngest` + `INNGEST_DEV=1`.
- Events (`lib/inngest/events.ts`): `requo/inquiry.qualified` → AI draft; `requo/knowledge.file-uploaded` → chunk+embed (concurrency 5/business, 2 retries); push events (inquiry-received, quote-sent, quote-response, invoice-*); `requo/quotes.enable-auto-follow-up`. Cron: follow-up reminders, follow-up auto-send, auto-follow-ups, quote-viewed/expiring, auto-archive, expire quotes/subscriptions, analytics rollup/digest/reports/benchmarks, session expiry, token-log cleanup, embedding backfill (`cron-embedding-backfill`, hourly, `concurrency: limit 1` — repairs `embedding IS NULL` rows).
- Env: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_DEV`. Vercel cron (`vercel.json` + `CRON_SECRET`): `expire-quotes`, `expire-subscriptions`, `token-log-cleanup` only.

## Upstash Redis (rate limits + AI cache)

- Package: `@upstash/redis`. Use: sliding-window rate limits (`lib/rate-limit/redis-rate-limiter.ts`, 2s timeout, DB fallback to `public_action_events`), AI cache/capacity/cooldown/dedup (`lib/ai/cache-layer.ts`, dual-write Redis + in-memory Map), and the 24h content-hash embedding cache (`lib/ai/embeddings.ts`). Not a general cache.
- Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Missing in dev → in-memory fallback (single-instance semantics). `isRedisConfigured` (`lib/env.ts`) is the single source of truth; the admin health check probes `<url>/ping` for real. Because the fallback is silent, the consequence worth knowing is that without Redis the embedding cache never hits across cold starts and identical text re-embeds every time. Setup + verification: `docs/setup/redis.md`.

## Web Push (VAPID)

- Package: `web-push`. Send: `lib/push/send.ts`, VAPID: `lib/push/vapid.ts`; client: `features/notifications/push-client.ts`; subscribe/unsubscribe: `app/api/push/*`; storage: `push_subscriptions` (unique user+business+endpoint).
- Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. Failure: expired endpoints removed on 410; send failures never block the triggering mutation.

## Crisp (support-only)

- Package: `crisp-sdk-web`. Widget: `components/integrations/crisp/*`, mounted in `app/(marketing)/layout.tsx`, gated in business Support settings. Env: `CRISP_WEBSITE_ID`. Not a product surface — never build customer messaging on it. Details: `docs/setup/crisp-support.md`.

## Google OAuth (login only)

- Better Auth Google provider (`lib/auth/config.ts`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). Optional; absence only disables Google login. There is no Calendar integration — do not describe one.
