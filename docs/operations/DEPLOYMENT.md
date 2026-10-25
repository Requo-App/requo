# Deployment Reference

This is a concise map of the checked-in deployment topology. Detailed provider
setup lives in [Deployment Setup](../setup/deployment.md); database rollout is
documented in [Database Migrations](../database-migrations.md).

## Topology

- The application is a Next.js App Router deployment configured for Vercel.
- `vercel.json` enables Git deployments from `main` and disables them for
  other branches. It also schedules route handlers for quote expiry,
  subscription expiry, AI token-log cleanup, and approval expiry.
- PostgreSQL is the application database. Supabase provides storage and
  Realtime integrations. Inngest handles registered event-driven and cron
  functions through `/api/inngest`.
- Polar, transactional email providers, AI providers, Upstash Redis, and web
  push are external services configured by environment variables when used.

## Build and migrations

`npm run build` runs `next build`. `package.json` defines `vercel-build` as
`npm run db:migrate:strict && next build`; strict migration mode requires
`DATABASE_MIGRATION_URL` and rejects the pooler port. Keep application runtime
`DATABASE_URL` separate from the direct migration connection where required.
Never edit committed migrations. Verify the selected target and migration
state before deployment; no rollback guarantee is encoded by this repository.

## Configuration and operations

Runtime names and validation are in `lib/env.ts`; the safe inventory is
`.env.example`. Required values vary by enabled provider and feature. Do not
copy secrets into docs or logs. Keep Better Auth URL/origins, Supabase storage
and Realtime settings, Inngest keys, Polar server/products/webhook secret, and
email sender/provider settings aligned with the deployment.

Vercel cron routes use `CRON_SECRET` where implemented. Inngest schedules and
event functions are registered in `lib/inngest/functions/`; Vercel Cron and
Inngest are separate scheduling systems. The
[scheduler ownership inventory](SCHEDULER-OWNERSHIP.md) is the authoritative
list of which scheduler owns each recurring task. Verify both service
dashboards after changing job registration or schedules. Provider dashboards
are authoritative for external service health and quotas.

Vercel Analytics and Speed Insights are included in the application layout.
The repository does not document a tested rollback process or a general
distributed tracing setup. Confirm operational procedures with the deployment
owner before relying on them. For provider-specific steps, see
[`docs/setup/`](../README.md#setup-guides).
