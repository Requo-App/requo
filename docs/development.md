# Requo Development

How to run, test, build, and deploy. Commands verified against `package.json`. Environment reference: `.env.example` (203 lines). Setup guides: `docs/setup/local.md`, `docs/setup/deployment.md`, `docs/setup/billing.md`, `docs/setup/ai-provider-limits.md`, `docs/setup/crisp-support.md`.

## Prerequisites

npm, a Postgres (local recommended for dev — remote pooler adds ~100ms per query), Supabase project (storage + realtime), at least one AI provider key, Polar sandbox account for billing work. Copy `.env.example` → `.env.local` and fill `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` first.

## Commands

| Task | Command |
|---|---|
| Install | `npm install` |
| Dev (app only, preferred) | `npm run dev:app` |
| Dev (app + Inngest + ngrok, for webhooks) | `npm run dev` |
| Inngest dev only | `npm run dev:inngest` |
| Health check | `npm run dev:check` (`scripts/dev-health-check.ts`) |
| Lint | `npm run lint` (`eslint`) |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) |
| SEO + nav + model audits | `npm run check:seo`, `npm run check:models` (`--probe` for live) |
| Full check | `npm run check` (lint + typecheck + seo + models) |
| Unit + component tests | `npm run test` (sequential: `test:unit`, `test:components`) |
| DB-backed integration | `npm run test:integration` (checks DB, migrates, `vitest.integration.config.ts`) |
| E2E smoke / full | `npm run test:e2e:smoke` (Playwright `@smoke`), `npm run test:e2e` |
| All / coverage | `npm run test:all`, `npm run test:coverage` |
| Build / start | `npm run build` (`next build`), `npm run start` |
| Vercel build | `npm run vercel-build` (`db:migrate:strict && next build`) |
| DB generate / migrate | `npm run db:generate -- --name descriptive_name`, `npm run db:migrate` (`db:migrate:strict` in CI/prod) |
| DB reset / studio / seed | `npm run db:reset` (local only, refuses remote), `npm run db:studio`, `npm run db:seed-demo` |

Pre-push baseline: `npm run check` → `npm run test` → `npm run test:integration` → `npm run build` → `npm run test:e2e:smoke`.

## Database workflow

Local-first: `DATABASE_URL` + `DATABASE_MIGRATION_URL` pointing at local Postgres (see `.env.example:1-7`, `docs/setup/local.md`). Edit `lib/db/schema/*` → generate → migrate → commit schema + SQL together. Never edit committed `drizzle/*.sql`; never `db:push`/`db:generate` against production. `drizzle.config.ts` + `scripts/migrate.ts` reject pooler URLs for migrations. Refresh demo/e2e fixtures after schema changes: `npm run db:migrate` + `npm run db:seed-demo`. Full rules: `docs/database-migrations.md`.

## Environment essentials

Groups: Database (`DATABASE_URL` pooler / `DATABASE_MIGRATION_URL` direct), Auth (`BETTER_AUTH_SECRET/URL`, `GOOGLE_*`, `ADMIN_EMAILS`), Supabase (URL, anon, service-role, `SUPABASE_JWT_SECRET` for realtime), Email (`RESEND_API_KEY`, `MAILTRAP_API_TOKEN`, `BREVO_API_KEY`, `EMAIL_DOMAIN`, `EMAIL_FROM_*`), AI (7 provider keys + `AI_TPM_*` budgets), Billing (Polar token/secret/server/product IDs), Push (VAPID pair), Inngest keys, `CRON_SECRET`. Generate secrets with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.

## Debugging

- Dev trace (`.next/dev/trace`) shows render-path latency; `next.config.ts` dev levers (`preloadEntriesOnStart: false`, `instantInsights manual-warning`) keep 83-page dev boot fast — don't "fix" them.
- `npm run dev:check` before reporting broken dev; Inngest Dev Server at `localhost:8288` (`INNGEST_DEV=1`); ngrok only via `npm run dev` for Polar/Inngest callbacks.
- AI issues: `npm run check:models` (catalog drift) → provider dashboards (authoritative limits) → `ai_token_logs` / `ai_agent_runs` rows → `ai_security_events` for injection/output-filter hits.
- `build` skips type-checking (`typescript.ignoreBuildErrors`, Turbopack route-validator workaround) — `npm run check` is the type gate, not the build.

## Deploy

Vercel via Git integration. Production env mirrors `.env.example` with direct + pooler URLs (same host/creds, ports 5432/6543), Polar **production** products + webhook + token as a matched set (sandbox first — cutover checklist in `docs/setup/billing.md`), Inngest Cloud keys, `CRON_SECRET` for `vercel.json` crons (`expire-quotes`, `expire-subscriptions`, `token-log-cleanup`). Low-quota email deployments: `LOW_EMAIL_MODE=1` (keeps auth + quote delivery); never `DISABLE_TRANSACTIONAL_EMAILS=1`.
