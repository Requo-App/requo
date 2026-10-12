---
name: requo-repo-guide
description: Requo repository-specific architecture, design system, provider boundaries, and verification workflow. Use when modifying, reviewing, or planning changes in this repository so work follows DESIGN.md, shared wrappers, onboarding-first business creation, Better Auth and Supabase boundaries, and the repo's CI checks.
---

# Requo Repo Guide

Read these sources first when relevant (paths relative to this skill file):

- `../../../DESIGN.md` for UI work; `../../../app/globals.css` for tokens, surfaces, motion
- `../../../docs/README.md` for the source-of-truth map
- `../../../docs/architecture/TRD.md` for application architecture and boundaries
- `../../../docs/product/PRD.md` for current product scope
- `../../../CONTEXT.md` for domain language; `../../../docs/architecture/instant-navigation.md` for App Router rendering
- `../../../docs/security/SECURITY.md` for auth/authz and tenant boundaries
- `../../../docs/engineering/DEVELOPMENT.md` for commands
- `../../../docs/technical-debt.md` for known inconsistencies (read before "fixing" them)
- `../../../components/shared/dashboard-layout.tsx`, `../../../components/shared/form-layout.tsx`, `../../../components/shared/page-header.tsx` for layout patterns
- `../../../app/onboarding/page.tsx` and `../../../lib/auth/config.ts` for auth and onboarding behavior

## Working Defaults

- Inspect existing files before editing.
- Keep diffs small and feature-scoped.
- Keep `app/` focused on routes, layouts, loading states, and route handlers.
- Keep business logic, validation, queries, actions, and mutations in `features/`.
- Keep provider integrations and shared utilities in `lib/`.
- Stay within current product scope: owner-first service-business inquiry, quote, follow-up, invoice, and manual payment records, with workspace billing and role-based membership. Do not add marketplace, general calendar/dispatch, mobile app, payroll, payment gateways, or general-purpose chat unless explicitly requested.

## UI System

- Treat `DESIGN.md` as the canonical UI system.
- Reuse shared wrappers and `components/ui/*` primitives before building custom markup.
- Prefer semantic utilities and tokens such as `surface-*`, `control-*`, `overlay-*`, `table-*`, `meta-label`, `hero-panel`, `section-panel`, and `soft-panel`.
- Preserve the calm, modern, minimalist Requo visual language.
- Do not copy legacy raw status colors or `space-y-*` stacks from older files into new work.

## Auth, Data, And Providers

- Use Better Auth only. Do not introduce Supabase Auth.
- Signup creates the user and profile. Onboarding creates the first business. Additional businesses are explicit business flows.
- Enforce business ownership through scoped queries and business-aware helpers.
- Keep private asset access server-side.
- Validate external input with Zod.
- Keep provider boundaries narrow:
  - Better Auth for sessions and password flows
  - Supabase for storage and realtime-backed notification plumbing
- Resend for transactional email (Mailtrap/Brevo fallback)
- Groq, Cerebras, Gemini, Mistral, Cloudflare Workers AI, NVIDIA NIM, and OpenRouter through `lib/ai` for server-side AI
- Polar for card subscriptions (multi-currency, merchant of record)

## Billing

- Subscriptions are business-scoped.
- `business_subscriptions` is authoritative; `businesses.plan` is a denormalized read cache.
- `lib/billing/subscription-service.ts` is the single write path for subscription mutations.
- `lib/billing/webhook-processor.ts` records provider events in `billing_events` for idempotency.
- Refunds are portal-initiated in Polar and reach Requo via subscription webhooks (no refunds module in `lib/billing/`).
- Polar webhook route: `app/api/billing/polar/webhook/route.ts`.

## Pitfalls (caught by past audits — do not repeat)

- **Agent ≠ Assistant.** Agent = customer-facing anonymous chat (`features/ai-agent/`); Assistant = owner-facing authenticated chat (`features/owner-assistant/`). Never swap the words (ADR 003).
- **Agent has 4 tools**, not 5: `search_knowledge`, `get_business_info`, `get_services`, `propose_inquiry`. The handoff helper exists but is not wired as a model tool.
- **Inquiry sources** are `service_form | ai_assistant | manual | api | unknown` (`features/inquiries/types.ts`); legacy values (`ai_agent`, …) normalize via `normalizeInquirySource`. Never write legacy values.
- **Models never emit money.** Quote-draft prompts return `unitPriceInCents: 0` + candidate IDs; the server hydrates DB prices. Never trust model prices.
- **Route all provider calls through `lib/ai/router.ts`** + `selectModels`. Never import a provider SDK in `features/`.
- **Customer-visible or pipeline-mutating AI writes need confirmation** (`send_quote`, `update_inquiry_status`); draft-only writes do not.
- **Plan locks, role hides.** Never filter navigation by plan — gate with `features/paywall/` components + server-side `hasFeatureAccess` before expensive work.
- **Dashboard pages:** `export const instant = true`, synchronous shell, dynamic reads only in `<Suspense>` children. Never `instant = false` to silence a failure — use the escape-hatch registry.
- **Panel padding is baked in** (`section-panel`, `soft-panel`); opt out with `data-padding="none"`. Call-site padding on the same attribute is silently ignored and fails `audit:density`.
- **Do not add** Supabase Auth (Better Auth only), pgvector (embeddings are `jsonb`), payment gateways, or a `lib/billing/refunds.ts` (refunds are portal-initiated).
- **Update `docs/` when architecture or behavior changes materially**, and re-grep for dangling references when deleting or moving docs.

## Testing

- Test behavior and product risk, not implementation details.
- Backend permission tests are required for business/workspace access changes.
- Prefer DB-backed integration tests for server actions, route handlers, workflow mutations, billing webhooks, and authorization-sensitive behavior.
- Keep component tests for meaningful interaction only. Avoid shallow render checks and snapshots.

## Verification

- Docs-only changes: read through the edited files and run targeted grep checks.
- Most code changes: run `npm run check`.
- Logic, validation, or component changes: also run `npm run test`.
- Server action, route handler, billing, authz, or DB-backed changes: also run `npm run test:integration`.
- Route, layout, or system wiring changes: also run `npm run build`.
- Covered user-flow changes: run the relevant `npm run test:e2e:smoke`; use `npm run test:e2e` for broader browser journeys.
- CI baseline is lint, typecheck, unit/component tests, build, DB-backed integration tests, and Playwright smoke coverage.

## Loading Skeletons & Tours

- A route `loading.tsx` mirrors its page's Static Shell: the same PageHeader
  (eyebrow/title/description/actions), tab bars, grid column counts, and
  section order as the page it loads. When a page's structure changes, its
  loading file changes in the same commit.
- If a page renders its PageHeader synchronously, the loading file must render
  it too (same copy) so navigation never pops a header in after the content.
- Prefer reusing colocated `*Fallback` exports from feature components and
  shared skeletons in `components/shell/` and `components/shared/`; add a new
  shared skeleton only when two or more routes need it.
- Keep the two product tours in sync with the product surface:
  - **Dashboard Tour** (`features/onboarding/components/dashboard-tour.tsx`)
    walks the sidebar nav order (Home, Inquiries, Quotes, Follow-ups,
    Assistant, Services, Products, Members, Analytics) — non-nav deep-dives
    (e.g. "Draft with AI") sit directly beside the nav item they extend, so
    the sidebar highlight never moves backwards — previews live in
    `features/onboarding/components/tour-modal.tsx`.
  - **Form Editor Tour** (`features/onboarding/components/form-editor-tour.tsx`)
    mirrors the Service editor tabs (Form | Service page | Settings).

## Optimistic CRUD UI

Use the shared optimistic stack for dashboard create/update/delete flows:

- **List surfaces:** `hooks/use-animated-list.ts` with `.motion-list-item` and `data-motion-state` from `app/globals.css`.
- **Single-record toggles or kanban moves:** `useOptimistic` directly or `hooks/use-optimistic-mutation.ts`.
- **Forms and server-action buttons:** `components/shared/server-action-button.tsx` with optional `optimistic` callbacks; prefer `useDeferredRefresh()` over immediate `router.refresh()`.
- **Temporary create IDs:** `lib/optimistic/id.ts` (`createOptimisticId`, `isOptimisticId`).

Standard mutation flow:

1. Apply optimistic UI immediately inside `startTransition`.
2. Await the existing Server Action in the background.
3. On success, replace temp IDs when the action returns `entity.id`, then schedule deferred refresh.
4. On failure, revert optimistic state and show `toast.error`; do not refresh.

Keep server-side cache tag invalidation in actions unchanged. Client refresh is reconciliation, not the primary UX update.
