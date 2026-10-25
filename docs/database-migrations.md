# Database Migrations

## Overview

Requo uses [Drizzle ORM](https://orm.drizzle.team/) with sequential SQL migrations in `drizzle/`.

- `lib/db/schema/*` is the schema source of truth.
- `drizzle/*.sql` is the migration history that gets applied in all environments.
- Dev and prod use separate databases, but share the same migration history.

## Environment Strategy (Dev vs Prod)

Use separate direct URLs for migrations and runtime:

| Variable | Used by | Requirement |
|---|---|---|
| `DATABASE_URL` | App runtime queries | Pooler is fine in prod |
| `DATABASE_MIGRATION_URL` | Drizzle migrations (`db:migrate`) | Must be **direct** Postgres URL |

For Supabase:

- Pooler: `6543` (runtime)
- Direct Postgres: `5432` (migrations)

`db:migrate` now rejects pooler URLs on `6543` to prevent broken DDL runs.

## Commands

| Command | Purpose |
|---|---|
| `npm run db:generate -- --name <name>` | Generate SQL migration from schema changes (dev only) |
| `npm run db:migrate` | Apply migrations in normal mode |
| `npm run db:migrate:strict` | Apply migrations and require `DATABASE_MIGRATION_URL` |
| `npm run db:reset` | Drop local DB objects and re-run migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npx tsx scripts/mark-migrations-applied.ts` | Mark existing migrations as applied without executing SQL |

## Standard Workflow

### 1) Development schema change

```bash
# Edit schema files
# lib/db/schema/*.ts

# Generate migration
npm run db:generate -- --name descriptive_name

# Apply locally
npm run db:migrate

# Commit schema + migration together
git add lib/db/schema drizzle
git commit -m "feat: ..."
```

### 2) Deploy (preview/prod)

Production should never generate new migrations.
It should only apply committed ones.

`vercel-build` runs:

```bash
npm run db:migrate:strict && next build
```

`db:migrate:strict` fails if `DATABASE_MIGRATION_URL` is missing.

### 3) Deployment order and backward compatibility

The production build applies migrations before `next build`. While that build
runs, the previous deployment is still serving traffic, and it must keep
working against the migrated schema. A failed build leaves that previous
deployment in place against the new schema; it does not roll the database back.
Treat every migration as a change the currently deployed code must survive.

Use expand/contract for changes that remove or reshape data:

1. **Expand** — add the new table, column, or index in one migration. New
   columns are nullable or have a safe default so the old code can ignore them.
2. **Migrate** — deploy code that writes both shapes and reads the new one.
   Backfill existing rows in bounded, idempotent batches; do not put a large
   backfill in the same deploy as the DDL.
3. **Contract** — only after the new code has been live for a release, remove
   the old column or table in a later migration.

Consequences:

- Do not drop, rename, or narrow a column in the same deploy that stops using
  it. The previous deployment still reads the old shape.
- Add `NOT NULL` in a follow-up migration after the backfill and after every
  writer supplies the value.
- Rename by adding the new column, dual-writing and backfilling, switching
  reads, then dropping the old column in a later release.
- Keep new reads tolerant of rows written by the previous deployment during the
  rollout window (for example, a null optional column).
- If the build fails after migration, fix forward with a new migration or code
  change. Do not rewrite or delete the applied migration; committed migration
  history is immutable.
- Prefer a separate, explicit backfill job for large tables so the migration
  transaction stays short and a retry is safe.

Reviewers should answer both questions before approving:

- Can the currently deployed application version run against this schema?
- Can the new application version run against rows written by the previous
  version during the deploy window?

If either answer is no, split the change across releases.

## Rebaseline / Migration Reset Playbook

Use this when migration history is messy or duplicate/conflicting migrations are causing drift.

### A) New/empty production database

1. Keep the cleaned migration history in git.
2. Set `DATABASE_MIGRATION_URL` to direct prod URL.
3. Run `npm run db:migrate:strict`.

No marking step is required for empty DBs.

### B) Existing production database with schema already present

If you reset/squash local migration history but prod already has tables:

1. Deploy updated migration files.
2. Run:

```bash
DATABASE_MIGRATION_URL=<prod-direct-url> npx tsx scripts/mark-migrations-applied.ts
```

3. Verify migration table and app startup.

This records migration tags in `drizzle.__drizzle_migrations` without re-running DDL.

## Guardrails

1. Never run `db:generate` or `db:push` against production.
2. Use `DATABASE_MIGRATION_URL` (direct DB URL) for all migrations.
3. Prefer `db:migrate:strict` in CI/deploy.
4. Commit schema and migration changes in the same PR.
5. Avoid editing old migration files unless intentionally doing a rebaseline.
6. Keep schema changes backward-compatible with the currently deployed
   application; destructive changes land one release after the code stops
   using them. See
   [Deployment order and backward compatibility](#3-deployment-order-and-backward-compatibility).

## Troubleshooting

### `invalid input syntax` / DDL errors on deploy

- Check `DATABASE_MIGRATION_URL` points to direct URL, not pooler.
- Ensure deploy env has `DATABASE_MIGRATION_URL` configured.

### Migration says already applied / relation exists

- Existing DB likely has schema but missing migration metadata.
- Use `scripts/mark-migrations-applied.ts` once for that environment.

### Local DB drift or corruption

```bash
npm run db:reset
```

This rebuilds local schema from `drizzle/`.
