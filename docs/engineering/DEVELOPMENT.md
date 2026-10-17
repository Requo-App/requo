# Development Guide

This guide records verified repository commands. For environment-specific
details, use [Local Setup](../setup/local.md); for test tiers, see
[`tests/README.md`](../../tests/README.md).

## Prerequisites

- Node.js 22 or newer (`.nvmrc`), npm, and either a cloud Supabase project or
  Docker for the full-local stack. Copy `.env.example` to `.env.local`;
  `lib/env.ts` defines required and optional names. Do not commit secrets.
  Storage, email, AI, billing, and background-job credentials are needed only
  for the corresponding flows. Full-local setup (Supabase CLI + Docker) is in
  [Local Setup](../setup/local.md).

## Install and run

Cloud Supabase:

```bash
npm ci
npm run db:migrate   # first run, or after pulling new migrations
npm run dev          # app + Inngest Dev Server
```

Full local (Supabase CLI + Docker): see [Local Setup](../setup/local.md) for
the `npx supabase start` → `npm run db:local:setup` → `docker compose up
--build` flow.

`npm run dev:tunnel` adds an ngrok tunnel when testing inbound callbacks or
webhooks. `npm run dev:check` runs the repository health check without starting
the app.

## Database changes

Edit the authoritative TypeScript schema in `lib/db/schema/`, generate a new
SQL migration with `npm run db:generate -- --name descriptive_name`, apply it
locally with `npm run db:migrate`, and commit schema and migration together.
Never edit a committed migration or use `db:push` as a production migration
workflow. Full procedure and production constraints: [Database Migrations](../database-migrations.md).

## Quality checks

| Purpose | Command |
|---|---|
| Repository checks (ESLint, TypeScript, configured audits, model catalog) | `npm run check` |
| Unit and component tests | `npm run test` |
| Database integration tests | `npm run test:integration` |
| Browser smoke tests | `npm run test:e2e:smoke` |
| Full Playwright suite | `npm run test:e2e` |
| Production build | `npm run build` |

Focused commands include `npm run test:unit`, `npm run test:components`, and
`npm run check:models`. `npm run test:integration` checks the database, applies
migrations, then runs integration tests. PR CI (`.github/workflows/ci.yml`)
runs three parallel jobs — `check` (`npm run check` with dummy base env and
`CATALOG_DRIFT_ALLOW_MISSING=1`, so live provider listing is skipped),
`test` (`npm run test`), and `build` (`npm run build` with placeholder
`NEXT_PUBLIC_*`) — it does not run integration or Playwright suites. The live
catalog comparison runs strictly in the scheduled `model-drift` workflow with
real provider secrets (`npm run check:models` without the allow-missing flag).

## Repository conventions

Read the [documentation index](../README.md), the relevant PRD/TRD sections,
and the current implementation before making product or architecture changes.
Keep route entry points thin, place product rules in the owning `features/`
module, and use `lib/` for shared infrastructure. Reuse existing UI and
authorization/data-access patterns. Update authoritative docs when a material
behavior or architectural fact changes.

## Canonical patterns

These patterns are verified against the current tree. Follow them for new
code; do not copy legacy variants described in
[technical debt](../technical-debt.md).

### Layout and naming

- `app/` owns route groups (`(marketing)`, `(auth)`, `(business)`,
  `(public)`, `(checkout)`, `admin/`, `api/`) plus layouts, loading states,
  and thin route handlers. Example:
  [`app/(business)/[businessSlug]/(main)/invoices/page.tsx`](../../app/(business)/%5BbusinessSlug%5D/(main)/invoices/page.tsx).
- `features/<domain>/` owns product rules with predictable members:
  `actions.ts`, `queries.ts`, `mutations.ts`, `schemas.ts`, `types.ts`,
  `utils.ts`, `components/`. Example:
  [`features/invoices/`](../../features/invoices/).
- `lib/` owns shared infrastructure: database access, auth, AI routing,
  billing, email, caching, plans. Example:
  [`lib/db/business-access.ts`](../../lib/db/business-access.ts).
- `components/ui/*` are primitives, `components/shared/*` are compositions
  (`page-header.tsx`, `form-layout.tsx`, `dashboard-layout.tsx`,
  `status-badge.tsx`), `components/shell/*` are navigation/shell behavior.
- Imports use the `@/` alias (`@/*` maps to `./*` in `tsconfig.json`).
  Reuse a matching component, helper, or schema before adding a new one.

### TypeScript and validation

- `tsconfig.json` enforces `strict: true`. Prefer `unknown` with guards over
  `any` (see `features/ai-agent/schemas.ts`, `lib/action-state.ts`).
- Validate external input with Zod at the boundary: `schema.safeParse(...)`
  then `getValidationActionState(...)` from
  [`lib/action-state.ts`](../../lib/action-state.ts). Representative form:
  [`features/invoices/actions.ts`](../../features/invoices/actions.ts).
- Return user-safe errors with `getUserSafeErrorMessage(error, fallback)`;
  never leak internal error text to the client.

### Server actions and mutations

Canonical action shape (`"use server"` at the top of `features/*/actions.ts`):

1. `const access = await getOperationalBusinessActionContext()` (or
   `getBusinessActionContext({ minimumRole })`); return `{ error }` when not ok.
2. `safeParse` the input; return validation state on failure.
3. Call `*ForBusiness({ ..., businessId, actorUserId })` in the sibling
   `mutations.ts`; never trust a client-supplied business ID.
4. Invalidate with the paired `updateTag` + `revalidateTag` helper
   (see `invalidate()` in `features/invoices/actions.ts`).
5. Check paid access server-side with `hasFeatureAccess` before expensive or
   state-changing work; hiding navigation is not authorization.

### Queries and route handlers

- Reads live in `features/*/queries.ts`, marked `import "server-only"`, and
  are called from async Server Components (cached/tagged reads, e.g.
  `features/invoices/queries.ts`).
- Route handlers validate params with `slugParamSchema`/query schemas from
  `lib/api/params.ts`, resolve context with `requireExportContext(slug)`
  (`lib/api/exports.ts`), and answer `NextResponse.json({ error }, { status })`.
  Representative handler:
  `app/api/business/[slug]/quotes/export/route.ts`.
- Scope every business query with `eq(column, businessId)`; see
  [`lib/db/business-access.ts`](../../lib/db/business-access.ts).

### React, rendering, and loading states

- Server Components by default; `"use client"` on line 1 only for interactive
  leaves (forms, chat, editors, optimistic lists). Enforced by
  `audit:use-client-placement`.
- Dashboard routes use `export const instant = true` with a synchronous shell
  and dynamic reads below `<Suspense>`; `loading.tsx` mirrors the page's
  header/tabs/sections. Never set `instant = false` to silence a failure.
  Details: [Instant Navigation](../architecture/instant-navigation.md).
- Compose pages from `PageHeader`, `FormSection`/`FieldGroup`/`Field`/
  `FormActions`, and `StatusBadge` (tone map in
  `components/shared/status-badge.tsx`); reuse colocated `*Fallback` exports
  and shared skeletons in `components/shell/` and `components/shared/`.

### Styling, forms, and accessibility

- `DESIGN.md` is the visual source of truth. Use semantic tokens
  (`surface-*`, `control-*`, `overlay-*`, `table-*`, `meta-label`,
  `section-panel`, `soft-panel`) from `app/globals.css`.
- Do not copy legacy raw status colors (`text-emerald-*`, `bg-amber-*`),
  `space-y-*`/`space-x-*` stacks (use `gap-*`), per-page primitive restyles,
  or `!important` overrides into new work. Enforced by `audit:density`,
  `audit:radius`, and `audit:status-tokens`.
- Forms: label every control, surface field errors from the action state,
  and provide loading/error/empty/disabled states. Keep interactions keyboard
  operable with visible focus and `prefers-reduced-motion` respected.

### Domain invariants to preserve

- **Agent vs Assistant:** Agent is anonymous customer chat
  (`features/ai-agent/`, 4 tools, proposal requires visitor approval);
  Assistant is authenticated owner chat (`features/owner-assistant/`,
  confirmation for customer-visible or pipeline-mutating writes). Never swap
  the terms (see [`CONTEXT.md`](../../CONTEXT.md)).
- **Models never emit money:** quote-draft prompts return candidates with
  `unitPriceInCents: 0`; the server hydrates DB prices. Route provider calls
  through `lib/ai/router.ts`.
- **Payments are manual records:** `source: manual` only, voided rather than
  edited/deleted; never describe them as processed payments. IDs are UUIDv7
  (`lib/ids.ts`); display numbers (`Q-NNNN`, `INV-*`, `PAY-YYYY-NNNN`) are
  separate from internal IDs.
- **Billing writes:** `lib/billing/subscription-service.ts` is the single
  write path; `business_subscriptions` is authoritative,
  `businesses.plan` is a read cache; webhook events are recorded for
  idempotency in `billing_events`.

### Database changes

Edit `lib/db/schema/`, generate with
`npm run db:generate -- --name descriptive_name`, apply with
`npm run db:migrate`, commit schema plus migration together. Never edit a
committed migration. Full workflow:
[Database Migrations](../database-migrations.md).

## Testing new behavior

[`tests/README.md`](../../tests/README.md) is the authoritative testing
guide. Select the narrowest tier that proves the behavior:

| Change | Run |
|---|---|
| Logic, schemas, helpers | `npm run test` (unit + component) |
| Component interaction | `npm run test` (Testing Library, accessible queries) |
| Server actions, routes, authz, workflow mutations, billing webhooks | `npm run test:integration` (real Postgres) |
| Route/layout wiring | `npm run build` |
| Covered browser journeys | `npm run test:e2e:smoke` |

Authorization and tenant-boundary changes require integration coverage with
denial cases. Integration fixtures use per-file prefixes and clean up in
`afterAll` (`tests/support/`). Do not add snapshot-only or render-only tests.

## When you meet a legacy pattern

1. Read [technical debt](../technical-debt.md) before "fixing" a known
   inconsistency (e.g. duplicate `0021` migration prefix, remaining raw
   palette on non-pill surfaces, `space-y-*` stacks, cascade `!` overrides).
2. Follow the canonical pattern above for the code you touch; keep the fix
   scoped to the request and do not reformat unrelated areas.
3. If evidence conflicts (tooling vs shared abstraction vs nearby code),
   prefer enforced configuration, then established shared abstractions, then
   correct representative implementations with tests.
