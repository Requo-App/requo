# Contributing to Requo

Thanks for considering a contribution. Requo is SaaS for service businesses (inquiry → quote → follow-up → invoice, manual payments only).

## Ground rules

- Read `AGENTS.md` first, then the relevant doc in `docs/` (`architecture.md`, `domain.md`, `data.md`, `authentication.md`, `frontend.md`, `DESIGN.md`).
- `app/` stays thin (routes only). Product logic lives in `features/`. Infra lives in `lib/`. Reuse `components/ui/*` + `components/shared/*` before custom markup.
- Preserve tenant isolation: every business query filters by `businessId` via `getBusinessActionContext`. Never trust IDs from client/URL alone.
- Better Auth only. All AI through `lib/ai/`. Never write `businesses.plan` directly (via `lib/billing/subscription-service.ts` only).
- Never filter navigation by plan (role only). Gate paid features with `features/entitlements/` + server-side `hasFeatureAccess`.
- Keep diffs small and feature-scoped. Do not invent APIs, fields, env vars, or services.

## Local setup

Cloud Supabase (fill `.env.local` with cloud Supabase + database values):

```bash
cp .env.example .env.local
npm install
npm run db:migrate
npm run dev
```

Full local (Supabase CLI + Docker):

```bash
cp .env.example .env.local   # local values from `npx supabase status`
npx supabase start
npm run db:local:setup
docker compose up --build
```

See `docs/setup/local.md` for full setup, `docs/setup/deployment.md` for deploy, `docs/setup/billing.md` for Polar.

## Verification

```bash
npm run check
npm run test
npm run test:integration
npm run build
npm run test:e2e:smoke
```

Update tests when behavior changes. Update `docs/` when architecture or behavior changes materially.

## Pull requests

- One logical change per PR, with a clear description and test plan.
- Ensure `npm run check` and `npm run test` pass.
- For DB changes: `db:generate` → `db:migrate` → commit together. Never edit committed migrations in `drizzle/`.
