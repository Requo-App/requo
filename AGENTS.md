<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Requo Development Guide

Requo is a single Next.js application for service-business inquiry, quote,
follow-up, and invoice workflows. The authoritative documentation map is
[`docs/README.md`](docs/README.md).

## Source of truth

- This file defines how to work; it is not product or architecture reference.
- When modifying, reviewing, or planning repository changes, load the
  `requo-repo-guide` skill and follow the reference file it points to
  for the task.
- Read the documentation index and the relevant sections of the
  [PRD](docs/product/PRD.md) and [TRD](docs/architecture/TRD.md) for product or
  architecture changes. Read [`DESIGN.md`](DESIGN.md) before UI work.
- Reuse the established `components/ui/`, `components/shared/`, and
  `components/shell/` patterns. Read [`technical-debt.md`](docs/technical-debt.md)
  before changing a known inconsistency.
- Source code, installed dependencies and their docs, migrations, config, and
  tests establish current behavior. Treat prose as a map to those sources.
- If docs conflict with executable behavior, verify the behavior and update
  the authoritative doc. Source code, tests, migrations, and config establish
  current behavior; accepted user direction governs requested changes.

## Framework correctness

- Preserve and follow the Next.js managed block above exactly.
- Before writing or changing Next.js code, resolve the installed `next` package
  from the project/workspace containing the file, then read the relevant
  version-matched guide in that package's `dist/docs/`. Do not assume the
  package is installed at the repository root in a monorepo.
- In this repository, Next.js is pinned in `package.json`; its installed docs
  are under `node_modules/next/dist/docs/`. Check current configuration and
  heed deprecations and breaking changes.

## Repository practice

- Inspect the affected route, feature, infrastructure, tests, and nearby
  patterns before editing. Keep `app/` focused on routing/rendering and route
  handlers, product logic in `features/`, and shared infrastructure in `lib/`.
- Reuse existing abstractions and components. Avoid speculative abstractions,
  broad rewrites, or unrelated cleanup.
- Keep the customer journey and domain terms consistent with the PRD and
  [`CONTEXT.md`](CONTEXT.md). Do not turn commercial schedules into calendar
  scheduling or manual payment records into payment processing.
- Use verified scripts from `package.json` and relevant guides. Run checks
  appropriate to the change; never claim a command passed unless it ran.
- For code changes, run `npm run check` and `npm run test` when feasible;
  add `npm run test:integration` for DB/auth/workflow changes,
  `npm run build` for route/system wiring, and `npm run test:e2e:smoke` for
  covered browser journeys.
- Update tests when behavior changes. Update the PRD/TRD or a focused guide
  when a material product, architecture, security, or operations fact changes.

## Data and security

- Preserve Better Auth as the application identity provider and business
  isolation through verified membership plus `businessId`-scoped access.
- Keep role authorization separate from plan entitlement and enforce paid
  access on the server; navigation visibility alone is not an access control.
- Authorization belongs in server-side actions, handlers, queries, and
  mutations. A route proxy or hidden UI is not the only access check.
- Treat public tokens, file metadata, user text, retrieved knowledge, and model
  output as untrusted. Preserve existing validation, rate limits, confirmation,
  and file-access boundaries.
- Never expose secrets or put environment-variable values in committed docs.
  Do not invent fields, APIs, environment names, commands, or service behavior.

## Change management

- Keep edits scoped to the request and preserve unrelated working-tree changes.
- Never rewrite committed SQL migrations; follow
  [`Database Migrations`](docs/database-migrations.md).
- When behavior or architecture changes, update the one authoritative
  documentation source and link to it instead of duplicating detail here.
- For tests, setup, security, deployment, and domain guidance, use
  the links and source hierarchy in [`docs/README.md`](docs/README.md).
