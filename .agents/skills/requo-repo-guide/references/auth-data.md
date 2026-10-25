# Auth, Data, and Providers

## Contents

- Identity and onboarding
- Tenant isolation
- Proxy gate (early, not only)
- RLS reality
- Public tokens and files
- Validation
- Provider boundaries

## Identity and onboarding

Better Auth only (`lib/auth/`, route `app/api/auth/[...all]/route.ts`). Do not add Supabase Auth.

- Signup creates user + profile (`ensureProfileForUser` in `lib/auth/business-bootstrap.ts`, called from `lib/auth/config.ts`).
- Onboarding creates the first business (`app/onboarding/page.tsx` + `features/onboarding/actions.ts` `completeOnboardingAction`; redirects when memberships exist). Additional businesses are explicit business flows.

## Tenant isolation

Scope every business read/write by verified membership + `businessId`:

- Actions: `getBusinessActionContext({ minimumRole })` / `getOperationalBusinessActionContext()` (`lib/db/business-access.ts`); on `!ok` return `{ error }`. Pass `businessId` from `access.businessContext.business.id` into `*ForBusiness({ ..., businessId, actorUserId })`. Never trust a client- or model-supplied business ID.
- Queries: `eq(column, businessId)` everywhere; reads live in `features/*/queries.ts` (`import "server-only"`).
- Backend permission changes require integration tests with denial cases.

## Proxy gate (early, not only)

`proxy.ts` sets business-slug cookies, private/noindex headers, Markdown negotiation, legacy redirects, and an optimistic `/admin` gate (real `403` document, `/admin/stop-impersonating` exempt). It is not the authorization boundary: admin pages/actions/queries also call `requireAdminUser()` (`features/admin/access.ts`).

Bounded consistency risk at the proxy only: the proxy's optimistic gate trusts Better Auth's cached `admin` role / unbanned state for up to 300s (`lib/auth/admin-identity.ts`, `lib/auth/config.ts`). The server guard `requireAdminUser()` (`features/admin/access.ts`) always re-reads role and ban state from the database and grants only on `role = "admin"`, so a demotion/ban is enforced on the next admin operation. `ADMIN_EMAILS` is a bootstrap input and a proxy hint, not an authorization grant. Do not move authorization into the proxy.

## RLS reality

`drizzle/0007_enable_rls_all_tables.sql` enables RLS with default-deny for Supabase `anon`/`authenticated`. App traffic uses direct Postgres via Drizzle and bypasses those policies — server-side authorization and tenant-scoped queries are essential, not defense in depth. See `docs/security/SECURITY.md`.

## Public tokens and files

- Quote/approval/chat tokens are narrow capabilities: validate scope, expiry, business/record server-side.
- Quote public tokens store plaintext + HMAC hash (owner resend/copy recovers the link). DB read = bearer access: never log or return plaintext tokens in lists/unrelated queries. Invite/approval tokens use hashed lookups; Agent session tokens are separately scoped and expire.
- Private Supabase Storage objects download through authenticated server routes only. Service-role credentials stay server-side. Validate file metadata; use existing safe path/name helpers.
- Public inquiry intake keeps server validation, rate limits, abuse checks — preserve them on intake changes.

## Validation

Validate external input with Zod at the boundary: `schema.safeParse(...)` then `getValidationActionState(...)` (`lib/action-state.ts`); user-safe errors via `getUserSafeErrorMessage`, never leak internals. Representative form: `features/invoices/actions.ts`.

## Provider boundaries

- Better Auth: sessions, password flows. Supabase: private Storage + authenticated Realtime notification plumbing only (not ORM/auth).
- Email: `lib/email/` provider fallback — Resend primary, Mailtrap/Brevo fallback.
- AI: all provider SDKs behind `lib/ai/` (`router.ts` + `selectModels`); never import a provider SDK in `features/`.
- Billing: Polar card subscriptions via `lib/billing/`. No payment gateways.
- Jobs: Inngest events/cron (`lib/inngest/`, `/api/inngest`) + selected Vercel Cron routes (`vercel.json`); check both registrations. Upstash Redis is optional (AI cache, dedup, capacity, rate limits) with in-process fallbacks — not the primary DB.
- Env: `lib/env.ts` validates names; `.env.example` lists safe names/placeholders. Commit names only, never values; `NEXT_PUBLIC_*` is public by design.
