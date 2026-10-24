# Workflows

## Contents

- Layout and naming
- TypeScript and validation
- Server actions and mutations
- Queries and route handlers
- Cache invalidation
- Database changes
- Testing tiers
- Verification matrix
- Docs and change rules

## Layout and naming

- `app/` route groups (`(marketing)`, `(auth)`, `(business)`, `(public)`, `(checkout)`, `admin/`, `api/`) + layouts, `loading.tsx`, thin handlers. `features/<domain>/` owns rules: `actions.ts`, `queries.ts`, `mutations.ts`, `schemas.ts`, `types.ts`, `utils.ts`, `components/`. `lib/` owns infra (db, auth, ai, billing, email, cache, plans). Imports via `@/` alias. See `docs/engineering/DEVELOPMENT.md`.

## TypeScript and validation

`strict: true`; prefer `unknown` + guards over `any`. Zod at the boundary (`safeParse` → `getValidationActionState` in `lib/action-state.ts`); user-safe errors only.

## Server actions and mutations

`"use server"` atop `features/*/actions.ts`:

1. `await getOperationalBusinessActionContext()` (or `getBusinessActionContext({ minimumRole })`); return `{ error }` when not ok.
2. `safeParse` input; return validation state on failure.
3. Call `*ForBusiness({ ..., businessId, actorUserId })` in `mutations.ts`; never trust client `businessId`.
4. Invalidate via paired `updateTag` + `revalidateTag` helper (see `invalidate()` in `features/invoices/actions.ts`).
5. `hasFeatureAccess` server-side before expensive/state-changing work.

## Queries and route handlers

Reads in `features/*/queries.ts` (`server-only`), called from async Server Components (cached/tagged). Handlers validate with `slugParamSchema`/query schemas (`lib/api/params.ts`), resolve with `requireExportContext(slug)` (`lib/api/exports.ts`), answer `NextResponse.json({ error }, { status })`.

## Cache invalidation

Next.js Cache Components + tags (`lib/cache/`); mutations call per-feature `updateCacheTags` (`updateTag`) alongside `revalidateTag`. Prefetch invalidation refreshes next navigation. Consult `lib/cache/` before changing invalidation.

## Database changes

Edit `lib/db/schema/`, `npm run db:generate -- --name descriptive_name`, `npm run db:migrate`, commit schema + migration together. Never edit committed migrations or use `db:push` for production. Strict path: `npm run db:migrate:strict` needs `DATABASE_MIGRATION_URL`; `vercel-build` migrates before `next build`. See `docs/database-migrations.md`. Watch the duplicate `0021` prefix history — journal order governs.

## Testing tiers

`tests/README.md` is authoritative. Narrowest tier that proves it:

| Change | Run |
|---|---|
| Logic, schemas, helpers | `npm run test` (unit + component) |
| Component interaction | `npm run test` (Testing Library, accessible queries; no snapshots/render-only) |
| Server actions, routes, authz, workflow mutations, billing webhooks | `npm run test:integration` (real Postgres; per-file prefix, `afterAll` cleanup) |
| Route/layout wiring | `npm run build` |
| Covered browser journeys | `npm run test:e2e:smoke` (`tests/e2e/smoke-registry.ts`); full suite `npm run test:e2e` |

Authz/tenant changes need denial cases at the server/data boundary.

## Verification matrix

- Docs-only: read edited files + targeted greps.
- Most code: `npm run check` (lint + typecheck + SEO audits + model catalog).
- Logic/validation/components: + `npm run test`.
- Actions/handlers/billing/authz/DB: + `npm run test:integration`.
- Route/layout/system wiring: + `npm run build`.
- Covered user flows: relevant `npm run test:e2e:smoke`.
- CI runs `check` + `test` + `integration` (real Postgres, migrations applied) + `build`; Playwright suites remain local. Never claim a command passed unless it ran.

## Docs and change rules

Update PRD/TRD/focused guide when a material product/architecture/security/ops fact changes; keep edits scoped; preserve unrelated working-tree changes. On moves/deletes, re-grep dangling references. `components/ui/*` uses the `app/globals.css` token layer — it stays.
