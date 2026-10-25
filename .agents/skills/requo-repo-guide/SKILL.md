---
name: requo-repo-guide
description: Requo single-app Next.js conventions, design tokens, auth and tenant boundaries, AI and billing invariants. Use when modifying, reviewing, or planning changes in this repository — dashboard routes, server actions, business-scoped queries, Agent or Assistant AI, feature gates, StatusBadge, instant navigation, or verification commands.
license: MIT
metadata:
  author: requo
  version: "2.0.0"
---

# Requo Repo Guide

## Overview

Single Next.js app for service-business inquiry → quote → follow-up → invoice → manual payment records. `app/` routes, `features/` domain rules, `lib/` shared infrastructure. Source, migrations, config, and tests beat prose; docs map behavior to them.

## When to Use

Use when touching dashboard pages, server actions, route handlers, business-scoped reads/writes, Better Auth, Supabase storage, Agent/Assistant, Polar billing, feature gates, status pills, loading skeletons, tours, or optimistic CRUD.

Do not use for generic React/Next.js performance (see `vercel-react-best-practices`) or generic Postgres design (see `supabase-postgres-best-practices`).

## Quick Reference

| Task | Read |
|---|---|
| UI, tokens, wrappers, lists, loading, tours, optimistic updates | [references/ui.md](references/ui.md) |
| Auth, onboarding, businessId scoping, proxy gate, RLS, tokens, files, validation | [references/auth-data.md](references/auth-data.md) |
| Agent vs Assistant, 4 Agent tools, money rule, router, confirmations, entitlement vs role, billing | [references/ai-billing.md](references/ai-billing.md) |
| Domain words, IDs vs numbers, payment/follow-up/acceptance terms | [references/domain.md](references/domain.md) |
| File layout, TS/Zod, action/mutation/query/handler shapes, cache tags, migrations, tests, checks | [references/workflows.md](references/workflows.md) |

## Working Defaults

- Inspect the affected route, feature, tests, and nearby patterns before editing. Keep diffs small and feature-scoped.
- Doc map: `docs/README.md`; scope: `docs/product/PRD.md`; architecture: `docs/architecture/TRD.md`; visuals: `DESIGN.md`; words: `CONTEXT.md`; inconsistencies: `docs/technical-debt.md` (read before "fixing" them).
- Stay in scope: inquiry, quote, follow-up, invoice, manual payment records, business billing, role membership. No marketplace, calendar/dispatch, mobile, payroll, gateways, general chat unless asked.
- Next.js 16.4.2 pinned: read the version-matched guide under `node_modules/next/dist/docs/` before framework code. Preserve the `nextjs-agent-rules` block in `AGENTS.md`.
- Reuse before inventing: `components/ui/*`, `components/shared/*`, `components/shell/*`, `lib/` helpers, `features/` siblings.

## Workflows

**New/changed behavior:**

```
1. Read the matching reference + nearby code; implement in the owning layer
2. Update tests with the behavior change
3. Run checks per references/workflows.md matrix; update the authoritative doc for material facts; re-grep dangling refs on moves/deletes
```

**When you meet a legacy pattern:** canonical pattern wins for code you touch; keep the fix scoped; never rewrite committed SQL migrations.

## Red Flags — STOP and re-read the reference

- Swapping Agent (public anonymous) with Assistant (authenticated member)
- Letting a model emit `unitPriceInCents` or importing a provider SDK in `features/`
- Trusting a client/model-supplied `businessId`
- Hiding navigation by plan instead of gating with `FeatureGate` + server `hasFeatureAccess`
- Setting `instant = false` to silence a failure; status color outside `StatusBadge`
- Re-declaring `section-panel`/`soft-panel` padding; `space-y-*` or raw palette in new code
- Calling manual payment records processed payments

| Excuse | Reality |
|---|---|
| "One more Agent tool is harmless" | 4 tools only; handoff helper is not a model tool |
| "The model price looks right" | Prompts return `unitPriceInCents: 0`; server hydrates DB prices |
| "Proxy already gates it" | Proxy is early-only; every page/action/query re-checks server-side |
| "Hiding the link blocks access" | Visibility is not authorization; gate server-side before expensive work |
