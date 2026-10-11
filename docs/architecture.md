# Requo Architecture

How Requo is technically structured. Codebase is the source of truth.

Related: `docs/domain.md` (business concepts), `docs/data.md` (database), `docs/authentication.md` (auth/authz), `docs/ai.md` (AI system), `docs/frontend.md` (App Router patterns), `DESIGN.md` (visual system). Deep dives: `docs/architecture/assistant-and-agent.md`, `docs/architecture/instant-navigation.md`, ADRs in `docs/architecture/adr-*.md`.

## System overview

Requo is an owner-led SaaS for service businesses: capture inquiries → qualify → draft quotes → share/send → follow up → track responses → invoice accepted work (manual payment tracking only, no gateway).

Systems that compose it:

- Next.js 16.3 App Router (`app/`), React 19, TypeScript strict.
- Feature modules (`features/`), shared infra (`lib/`), shared UI (`components/`).
- Drizzle ORM + Supabase-hosted Postgres (system of record).
- Better Auth (only auth system; no Supabase Auth).
- Supabase Storage (private buckets) + Realtime (notification bell only).
- Vercel AI SDK 6 with 7-provider routing (`lib/ai/`).
- Polar billing (business-scoped subscriptions, merchant of record).
- Inngest (cron + event-driven background work).
- Upstash Redis (rate limiting + AI cache only, cross-instance concerns).
- Web Push (VAPID). Crisp chat widget (support-only).

What Requo is **not**: no jobs product, no workflow-automation engine, no payment gateway, no live-chat product surface (see `AGENTS.md` Product Constraints).

## Repository structure

```text
app/                 # Routes, layouts, loading states, route handlers only
  (marketing)/       # Landing, pricing, legal
  (auth)/            # Signup, login, password reset, check-email
  (public)/          # b/[slug], inquire/[slug], quote/[token]
  (business)/        # new/ + [businessSlug]/(main|settings|preview|print)
  (checkout)/        # account/billing/checkout
  admin/             # Subdomain-routed console
  api/               # auth, billing/polar, business, cron, inngest, ai, inquiries, approvals, public, push
  onboarding/ invite/ verify-email/ home/ .well-known/
  llms.txt/ pricing.md/ sitemap + robots (agent-readable + SEO)
features/            # Product logic: validation, queries, actions, mutations, UI
  ai/                # Quote drafting only (no chat orchestrator)
  ai-agent/          # Customer Agent (anonymous public chat)
  owner-assistant/   # Owner Assistant (authenticated chat)
  memory/            # Extraction, chunking, embeddings, RAG retriever
  inquiries/ quotes/ invoices/ follow-ups/ customers/
  analytics/ notifications/ billing/ businesses/ business-members/
   settings/ onboarding/ importer/ audit/ admin/ ...
lib/                 # Cross-cutting infra
  ai/ auth/ billing/ cache/ db/ email/ inngest/ supabase/
  plans/ push/ rate-limit/ security/ seo/ openrouter/ ...
components/          # ui/ (shadcn primitives), shared/ (layout wrappers), shell/ (nav)
emails/templates/    # Transactional email templates
drizzle/             # Sequential SQL migrations (never edit committed ones)
scripts/ tests/ types/
```

Rules: `app/` stays thin (routing, composition, loading). Product logic lives in `features/`. Provider clients and shared utilities live in `lib/`. Reuse `components/ui/*` + `components/shared/*` (`DashboardPage`, `PageHeader`, `DashboardSection`, `FormSection`, `FormActions`) before custom markup.

## Runtime architecture

- `next dev` / `next build` / `next start`. Dev entry: `npm run dev:app` (preferred for app work); `npm run dev` adds Inngest dev + ngrok for webhooks.
- `next.config.ts`: `cacheComponents: true`, `partialPrefetching: true`, `staleTimes { dynamic: 60, static: 180 }`, security headers + per-surface cache headers, `/:businessSlug/forms/*` → `/services/*` redirects.
- `vercel-build` runs `db:migrate:strict && next build` (apply migrations, never generate against prod).
- DB connections: runtime uses `DATABASE_URL` (pooler, port 6543); migrations use `DATABASE_MIGRATION_URL` (direct, port 5432). See `lib/db/client.ts`, `lib/db/connection-options.ts`, `scripts/migrate.ts`, `drizzle.config.ts`.
- `proxy.ts` (middleware) does routing/headers, plus the one auth check that cannot live anywhere else: the `/admin` gate. A real `403` status has to be produced before the response streams, and `app/admin/layout.tsx` cannot block (its pages export `instant = true`), so the proxy is the only layer that can reject a non-admin before the admin shell is flushed. It is an optimistic cookie-cache check, never the sole boundary — see `docs/authentication.md`. Everything else is routing/headers: `X-Robots-Tag` for authenticated routes, `/` + `Accept: text/markdown` → `/api/public/markdown`, legacy `/account/*` → business settings, business-slug cookie.

## Request lifecycle

**Authenticated dashboard page:** `proxy.ts` (cookie) → layout (session via `lib/auth/session.ts`) → sync shell + `<Suspense>` regions → async child calls `getBusinessActionContext(businessSlug)` (`lib/db/business-access.ts`) → scoped Drizzle queries → render. Mutations revalidate cache tags (`lib/cache/*`).

**Server action (e.g. inquiry update):** Zod validation → `getBusinessActionContext` (role + plan-state check) → entitlement check (`hasFeatureAccess`) → scoped Drizzle write → audit log + notification + Inngest event → `revalidateTag`.

**Public inquiry submit:** honeypot → business/form lookup → rate limit (`lib/public-action-rate-limit.ts`) → plan-scoped form config → Zod → `createInquirySubmission` (`features/inquiries/mutations.ts`) → attachment upload (Supabase Storage) → qualification + AI-draft event + ack email + notification + audit + push event. See `docs/workflows.md`.

**AI chat:** boundary checks (Zod, rate limits, entitlements) → orchestrator (`features/ai-agent/orchestrator.ts` or `features/owner-assistant/orchestrator.ts`) → `streamText` with tools over UI message stream (`app/api/ai/*/chat/route.ts`). See `docs/ai.md`.

## Application layers

| Layer | Location | Responsibility |
|---|---|---|
| UI | `features/*/components`, `components/*` | Server components by default; `"use client"` only for interactivity |
| Route/page | `app/` | Layouts, pages (sync shell), `loading.tsx`, route handlers |
| Server actions | `features/*/actions.ts` | Validation + authz + mutation orchestration |
| Business logic | `features/*/mutations.ts`, `queries.ts`, `schemas.ts` | Writes, reads, Zod schemas |
| Data access | `lib/db/*` + Drizzle schema | Connection, scoped queries, transactions |
| Database | Supabase Postgres | 31 schema modules (`lib/db/schema/`) |
| External | `lib/email`, `lib/supabase`, `lib/billing`, `lib/push` | Email, storage, realtime, billing, push |
| AI | `lib/ai` + `features/ai*` + `features/memory` | Routing, drafting, chats, RAG |
| Background | `lib/inngest/*`, `features/*/jobs/*` | Cron + event-driven jobs |

There is no generic "service layer" or "repository layer" — `features/*/mutations.ts` + `queries.ts` are the pattern. Do not invent one.

## State and data defaults

- Prefer server-first data flow: server components, server actions, cached query helpers, and targeted `<Suspense>` boundaries before introducing client data infrastructure.
- Keep most UI state local to the feature component tree (form drafts, dialogs, filters, editors, transient interaction). When client state must persist across navigations, prefer route/URL state or feature-scoped browser storage (e.g. Agent token in `sessionStorage`) before introducing a global store. The Assistant live-chat stream (`features/owner-assistant/live-chat-store.ts`) is the exception, not the pattern.
- Hot server reads use the two-layer cache: inner `"use cache"` functions (cross-request) plus `React.cache()` wrappers (within-request dedup). Invalidate with cache tags (`lib/cache/*`) + `revalidateTag`/`updateTag`, never a second app-wide cache.
- No Zustand, no TanStack Query in the dependency tree (`package.json`) — do not add either without a clearly bounded need (cross-component coordination pressure, or background-refetch/optimistic-coordination complexity that local state + server actions cannot carry).
- Upstash Redis **is** a baseline dependency, but scoped: rate limiting (`lib/rate-limit/`) + AI cache/capacity/cooldown/dedup (`lib/ai/cache-layer.ts`) for cross-instance concerns only — not a general cache.

## Boundaries

- **Authentication:** Better Auth session (`lib/auth/session.ts`) in layouts/actions/route handlers, re-validated at every server entry. `proxy.ts` is not a substitute for that: its only auth is the optimistic `/admin` cookie-cache gate, which exists solely to produce a real `403` before the admin shell streams.
- **Authorization:** `getBusinessActionContext` family at the action/handler boundary, then `businessId`-scoped Drizzle predicates. Public routes use opaque tokens (`publicToken` HMAC), never membership.
- **Data:** every business-scoped table has `businessId` + composite indexes; private Storage access server-side only.
- **AI:** all provider calls go through `lib/ai/router.ts` + `capacity-selector.ts`. Do not call providers directly.
- **External services:** provider code stays in `lib/`; feature code calls the wrapper, not the SDK.
- **Billing writes:** `lib/billing/subscription-service.ts` is the single write path; `business_subscriptions` authoritative, `businesses.plan` read cache.

## Architectural invariants (must not break)

1. Tenant isolation: every business query filters by `businessId` resolved server-side (never from LLM/client/URL alone).
2. Better Auth only — do not add Supabase Auth.
3. `businesses.plan` is a cache; never write it directly.
4. AI pricing: model returns `unitPriceInCents: 0` + candidate IDs; server applies DB prices (`features/ai/quote-generator.ts`).
5. Agent transcripts reach the business only via an Inquiry snapshot (ADR 004) — no browse/search surface.
6. Entitlement-visibility: nav filtered by role only, never by plan; paid features render locked with paywall components (`features/paywall/`), enforced server-side.
7. Migrations: one sequential history in `drizzle/`; never edit committed files; `db:generate` → `db:migrate` → commit together.
