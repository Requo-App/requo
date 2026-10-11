# Tests

Requo's automated tests are organized by product risk into four top-level tiers plus a shared `tests/support/` helper tree. The first three tiers run on [Vitest](https://vitest.dev) (unit and component in jsdom, integration in node), and end-to-end coverage runs on [Playwright](https://playwright.dev) against either a local `npm run dev:app` server or a Vercel preview URL. For the full rationale, tiering rules, guard invariants, and fixture contracts, see the design and root contributor guide.

- Design: [`docs/architecture.md`](../docs/architecture.md)
- Repo-wide conventions: [`AGENTS.md`](../AGENTS.md)

## Tiers

### `tests/unit/`

Pure logic. Zod schemas at inquiry, quote, billing, and route-handler input boundaries, pure utilities (price rounding, currency conversion, slug generation, token parsing, plan access, workflow status transitions), and round-trip parse/print tests for serializers. These tests must never reach the database, file system, network, clock, or random source at import time; the outbound-HTTP guard in `tests/setup.ts` enforces the HTTP half of that rule.

```bash
npm run test:unit
```

### `tests/components/`

React components rendered in jsdom through Testing Library. Scoped to components whose output varies with user interaction, authentication, or subscription plan (login form, public inquiry form, quote editor, send-quote dialog, paywalled command menu). Queries go through accessible role, name, label, placeholder, or visible text; user input goes through `@testing-library/user-event`.

```bash
npm run test:components
```

### `tests/integration/`

Postgres-backed server actions, queries, and route handlers. Each test runs in the node environment against the live Test_Database reached through `DATABASE_URL`, with `npm run db:migrate` applied before the first test. Coverage includes authorization (owner, manager, staff, outsider, archived business), the full quote lifecycle, billing webhook idempotency, and public analytics rate limiting.

```bash
npm run test:integration
```

### `tests/e2e/`

Playwright smoke coverage for the five critical user flows: owner sign-in, non-member denial, public inquiry submission, quote creation and sending, and public quote response. The default `@smoke` set is the fast validation slice for local work and Vercel preview checks; the full suite is available for broader browser journeys.

```bash
npm run test:e2e:smoke
# or, for the full Playwright suite
npm run test:e2e
```

### `tests/support/`

Shared fixtures, env seeding, DOM stubs, the outbound-HTTP guard, third-party client mocks, and the test DB client. Anything imported by two or more `*.test.ts` files lives here so helpers are not duplicated next to test files. Nothing in `tests/support/` is imported by product code at runtime; it is a test-only tree.

## Fixtures

Three deterministic factories live under `tests/support/fixtures/`. Each one namespaces every row it creates by the caller's `Per_File_Prefix` so tests running in parallel do not collide on unique constraints.

- **`createWorkflowFixture(prefix)` (aka `Workflow_Fixture`)** — creates the standard cast used across workflow integration tests: owner, manager, staff, and outsider users; three businesses (primary, other, archived) with matching inquiry forms; and three seeded inquiries (qualified, waiting, cross-business). Idempotent: it calls `cleanupWorkflowFixture(prefix)` first so a failed previous run cannot wedge the next one.

- **`createBillingFixture(prefix, states)`** — drives `business_subscriptions` through each requested state (`active`, `past_due`, `canceled`, `grace_period`) via `lib/billing/subscription-service.ts` so the denormalized `businesses.plan` column stays in sync. Produces the identifiers `${prefix}_business` and `${prefix}_sub_${state}`. Never writes raw SQL against the billing tables.

- **`createQuoteFixture(prefix, states, workflow)`** — creates one quote per requested state (`draft`, `sent`, `viewed`, `accepted`, `rejected`, `expired`, `voided`) attached to the primary business and qualified inquiry from the workflow fixture. Public tokens are shaped `${prefix}_token_${state}` so public-page tests can address a specific quote without querying the database first.

## `Per_File_Prefix` rule

Every integration test computes its prefix by passing its own filename to `derivePerFilePrefix` from `@/tests/support/prefix`, then hands that prefix to every fixture factory it calls:

```ts
import { derivePerFilePrefix } from "@/tests/support/prefix";
import { createWorkflowFixture } from "@/tests/support/fixtures/workflow";

const prefix = derivePerFilePrefix(__filename);
const workflow = await createWorkflowFixture(prefix);
```

The derivation strips the extension, collapses non-alphanumeric characters to `_`, and trims leading and trailing underscores. Concrete example:

```ts
derivePerFilePrefix("quote-mutations.test.ts") === "quote_mutations";
```

At the end of every integration run, `tests/integration/zzz-residue.test.ts` scans the cleanup table set defined in Requirement 10.4 and fails the run if any `${prefix}_...` rows remain. Every fixture must therefore own its own teardown, and `afterAll` hooks must call the fixture's cleanup helper on both the passing and failing paths.

## Environment variables

### Required for every test run

`tests/support/env.ts`'s `applyTestEnv()` seeds the following `Test_Secret_Placeholder` defaults. It only writes values that are currently `undefined`, so an explicit empty string from the caller is preserved as an intentional opt-out:

| Variable | Default |
| --- | --- |
| `BETTER_AUTH_SECRET` | `test-secret-at-least-32-characters-long-so-zod-passes` |
| `APP_ENCRYPTION_KEYS` | `v1:AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=` |
| `APP_TOKEN_HASH_SECRET` | `test-token-hash-secret-at-least-32-characters` |
| `BETTER_AUTH_URL` | `http://127.0.0.1:3000` |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | `http://127.0.0.1:3000/api/auth` |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/requo` |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://localhost:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `test-anon-key` |
| `SUPABASE_SERVICE_ROLE_KEY` | `test-service-key` |
| `RESEND_API_KEY` | empty string |
| `GROQ_API_KEY` | empty string |
| `GEMINI_API_KEY` | empty string |
| `OPENROUTER_API_KEY` | empty string |

Unit, component, integration, and local smoke runs all complete successfully with every third-party credential set to an empty string or a placeholder — network calls to Resend, Groq, Gemini, OpenRouter, and Supabase storage are mocked per test and blocked at the global `fetch` level by `tests/support/fetch-guard.ts`.

### Required only for local integration and e2e against a live database

`DATABASE_URL` must point at a reachable Postgres instance. `npm run test:integration` and the local path of `npm run test:e2e:smoke` both short-circuit through `scripts/test/check-db.mjs` (smoke uses `--if-local`), which exits non-zero with a message naming `DATABASE_URL` when the host is unreachable within 10 seconds.

### Required only for demo seeding (`npm run db:seed`)

The development seed reads `DATABASE_URL` and the normal application environment values. See [`scripts/seed.ts`](../scripts/seed.ts); test runs do not need seed-only provider credentials.

### Optional for Playwright preview runs

- `PLAYWRIGHT_BASE_URL` — when set, Playwright uses it as the `baseURL`, skips the local `webServer` block, and skips the migrate/seed step. `scripts/test/check-db.mjs --if-local` also short-circuits to exit 0 so preview runs do not require a local Postgres.

## Structural guards

Each guard lives next to the tests it protects and runs as part of the normal Vitest pipeline, so an invariant violation fails the run immediately.

- `tests/unit/_guards/layout.test.ts` — recursively walks `tests/`; fails with the absolute path of any `*.test.ts`, `*.test.tsx`, or `*.spec.ts` that lives outside the four allowed tiers.
- `tests/unit/_guards/secrets.test.ts` — scans `tests/`, `reports/`, `playwright-report/`, and `test-results/`; fails with any file that contains the verbatim value of a `Test_Secret_Placeholder` from `tests/support/env.ts`.
- `tests/unit/_guards/outbound-http.test.ts` — self-tests the fetch guard by issuing a request to `https://example.com` against a disposable `globalThis.fetch` and asserting the error names the blocked host.
- `tests/unit/_guards/timing.test.ts` — records per-test durations and fails when a Vitest test exceeds 30s or a component test exceeds 10s without an explicit per-test timeout and a justification comment on the preceding line.
- `tests/integration/zzz-residue.test.ts` — the last integration test. Scans the Requirement 10.4 cleanup tables for any row whose identifier matches a known `Per_File_Prefix` and fails with the offending file and table.

## Related docs

- Design document: [`docs/architecture.md`](../docs/architecture.md)
- Requirements document: [`docs/development.md`](../docs/development.md)
- Root agent guide: [`AGENTS.md`](../AGENTS.md)
