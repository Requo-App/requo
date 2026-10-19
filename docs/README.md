# Requo documentation

Start with [AGENTS.md](../AGENTS.md) for repository-wide agent instructions. This
index is the map to the product, current implementation, and recurring work.

## Sources of truth

- **Agent behavior:** [`AGENTS.md`](../AGENTS.md) says how contributors and
  coding agents work in this repository; it does not define product behavior.
- **Product intent and current scope:** [Product requirements](product/PRD.md).
- **Current technical behavior:** [Technical reference](architecture/TRD.md),
  implementation, migrations, configuration, and tests. When they disagree,
  verify against the running code and its executable checks; update the docs
  that summarize it.
- **Current architecture:** [Technical reference](architecture/TRD.md) explains
  the system and its important invariants; source code and tests establish the
  precise current behavior.
- **Visual language:** [`DESIGN.md`](../DESIGN.md).
- **Domain language:** [`CONTEXT.md`](../CONTEXT.md).
- **Public security reporting:** [`SECURITY.md`](../SECURITY.md).

## Choose a guide

- New contributor or local environment: [Development](engineering/DEVELOPMENT.md)
  and [local setup](setup/local.md).
- Test changes: [`tests/README.md`](../tests/README.md).
- Security-sensitive work: [Security](security/SECURITY.md).
- Production operations: [Deployment](operations/DEPLOYMENT.md), then the
  detailed [deployment setup](setup/deployment.md) and
  [database migration guide](database-migrations.md).
- Billing, email, Redis, or provider setup:
  [setup guides](#setup-guides).
- App Router rendering and navigation: [instant navigation](architecture/instant-navigation.md).
- Known implementation inconsistencies: [technical debt](technical-debt.md).

## Repository orientation

This is a single Next.js application. `app/` owns route entry points and
layouts; `features/` owns product behavior; `lib/` owns shared infrastructure;
`components/` and `hooks/` provide UI; `lib/db/schema/` and `drizzle/` define
the database contract; `tests/` holds executable checks.

## Setup guides

- [Billing and Polar](setup/billing.md)
- [AI provider limits](setup/ai-provider-limits.md)
- [Crisp support](setup/crisp-support.md)
- [Redis](setup/redis.md)

## Framework references

Next.js is pinned to 16.3.8 in `package.json`. Before changing framework code,
read the relevant installed guide under `node_modules/next/dist/docs/` (resolve
the package from the project containing the code). The installed docs and
configuration are authoritative for supported APIs. The public [Next.js AI
agent guide](https://nextjs.org/docs/app/guides/ai-agents) describes this
version-matched documentation model.
