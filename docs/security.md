# Requo Security Architecture

Lasting security invariants for future developers. Point-in-time audit reports are removed once their findings are resolved — this file holds what stays true.

## Trust boundaries

Browser → Next.js server → Drizzle → Postgres. Public token holders → scoped public queries only. Members → own businesses only. AI model → tools (never direct DB). Uploads → RAG text only. Webhooks/cron → HMAC/bearer verified.

## Authentication (Better Auth only)

- Better Auth is the only auth system. Do not add Supabase Auth.
- `proxy.ts` does routing/headers, plus one deliberately optimistic auth check: the `/admin` gate, which rejects a non-admin before the admin shell streams so the response can carry a real `403`. It reads Better Auth's cookie cache, so it can lag the database by up to `session.cookieCache.maxAge` (300s) and is **never** the only boundary. Every server entry re-validates via `lib/auth/session.ts` + `lib/db/business-access.ts`.
- Sessions: 7d expiry, 1d updateAge, cookieCache enabled, `useSecureCookies` off `BETTER_AUTH_URL` protocol, cross-subdomain `.requo.app` in prod.
- Verification required, `revokeSessionsOnPasswordReset:true`, magic-link 900s hashed, OAuth `storeStateStrategy:cookie`, admin impersonation 1h, no admin-on-admin.
- API routes must return JSON 401 (`getOptionalSession` + explicit check), never throw `redirect()` — add `requireUserForApi()` if missing.

## Authorization / tenant isolation (critical)

1. **Never trust client `businessId`/`userId` for authz.** Resolve `businessContext` via `getBusinessActionContext({businessSlug})` / `getBusinessRequestContextForSlug(slug)` / `getCurrentBusinessRequestContext()`, then use `businessContext.business.id` for every predicate. Reject `businessId !== context.business.id` with generic 404.
2. **Mutations take scoped IDs only.** Follow `archiveScopedBusiness` pattern — never pass raw `(businessId, businessSlug)` pairs into unscoped mutations. Lifecycle/billing mutations must join `businessMembers` on actor as defense-in-depth.
3. **No silent fallback.** `getBusinessContextForUser` must return null (not `memberships[0]`) when an explicit slug was requested but not a membership. Cookie-dependent paths must prefer explicit slug.
4. **Server-generated IDs.** `biz_*` (and all PKs) are server-generated via `createId()`. Never accept PKs from FormData/body.
5. **404, not 403/401, on tenant miss** to avoid enumeration. Keep `hasFeatureAccess` server-side; nav filtered by role only, never by plan.
6. **Storage paths always `${businessId}/...` + `upsert:false`.** Downloads only through authenticated handlers that re-check `businessId`, with `attachment` disposition + `nosniff` + `private,no-store`. Buckets stay private; service-role stays in `server-only` (`lib/supabase/admin.ts`).

## Data / DB

- Every business-scoped table has `businessId` + composite indexes. Every query includes `eq(table.businessId, context.business.id)`.
- RLS `deny_all` on all tables blocks PostgREST; app uses direct Drizzle. Never add `SECURITY DEFINER` without review. Never edit committed `drizzle/*` migrations.
- Public queries select allowlisted columns only, enforce `publicInquiryEnabled`, hide `draft` quotes, exclude archived/locked/deleted businesses.
- Public tokens: quote HMAC (`hashOpaqueToken`, `APP_TOKEN_HASH_SECRET ?? BETTER_AUTH_SECRET`) + 64-hex agent sessions with expiry. Never put tokens in logs; prefer body/bearer over URL query.

## AI / RAG

- All provider calls via `lib/ai/router.ts`. No direct provider SDK calls, no user-selected models.
- **Never trust the model for authz.** Tools enforce `eq(businessId)` + `requireToolRole` server-side; high-risk ops (`send_quote`, `update_inquiry_status`) require `requestToolConfirmation` + exactly-once `consumeToolConfirmation(businessId,userId,sessionId,confirmationId)` + Zod re-parse in `confirmAssistantToolAction`.
- RAG retrieval always `eq(businessId)` + `status=ready`. Tool context (`businessId`, `userId`, `role`, `plan`) is server-built from session/token, never from client.
- Treat model output as untrusted: `ChatMarkdown` only (no `rehype-raw`, no `img`, hardened `a rel`). `filterAiOutput` must receive real fragments + canary; log (not just `console.warn`) on failure.
- Treat owner/customer content (`businessName`, `instructions`, `details`, card values, RAG chunks, tool results) as data, not instructions: delimit/quote blocks, sanitize before interpolation, never `JSON.stringify` unsanitized values into system prompts.
- Input sanitizer is a signal, not a boundary. Quotas (`checkUsageLimit` business-month + daily + session lifetime) + rate limits backstop denial-of-wallet.

## Files / email

- Validate uploads server-side: final-extension allowlist (anchored group), extension→MIME map (ignore client `file.type`), magic bytes for executables/documents, 5 MB cap enforced twice. Sanitize filenames (`sanitizeStorageFileName`), derive `contentType` server-side.
- Sanitize memory/RAG content before persist (`sanitizeMemoryContent`) and assume bypass — retrieval thresholds + tool authz contain impact.
- Email: Zod-validate recipients (blocks header injection), escape template fields (`escapeHtml/escapeAttribute`, hex-color allowlist), outbox + `quote:{id}:sent:{recipient}` idempotency for all sends, `replyTo` validated.

## Abuse / infra

- Public mutations: honeypot + `assertPublicActionRateLimit` fail-closed (Redis → DB ledger, IP+UA hash). Authenticated AI/email/export: `assertBusinessActionRateLimit`/`checkUsageLimit` — fail-closed for wallet-relevant actions.
- Webhooks: Polar Standard-Webhooks verify + `withIdempotency`; Inngest signing; cron `Bearer CRON_SECRET` with constant-time compare.
- Headers: baseline + per-surface (`private,no-store` for auth, `s-maxage=60` only for truly public token/slug pages). Evaluate CSP before adding remote scripts. Keep `remotePatterns:[]` until a remote `<Image>` is needed.
- Secrets: server-only via `lib/env.ts` (Zod). Never `NEXT_PUBLIC_*` for secrets, never raw `process.env` for new keys, never commit live creds (extend `secrets.test.ts` to cover examples). Rotate on exposure.
- Dependencies: `npm audit --audit-level=high` clean for `next` + `@ai-sdk/*` before release; stage majors (`drizzle-kit`, `ngrok`) separately; CI must run `npm run check` (compensates `ignoreBuildErrors:true`).

## Verification before ship

`npm run check` → `npm run test` → `npm run test:integration` (DB) → `npm run build` → `npm run test:e2e:smoke`. New tenant-sensitive code needs an integration test proving User A / Business A cannot read/write Business B (see `tests/integration/business-access.test.ts`, `ai-agent-tenant-isolation.test.ts` as templates).
