# Tests

Tests are split by the behavior boundary they exercise. Prefer the narrowest
tier that can prove the behavior; keep database, browser, or provider work out
of unit tests.

## Tiers

- `tests/unit/` — deterministic logic, schemas, and helper behavior. External
  services are mocked; outbound HTTP is blocked by `tests/support/fetch-guard.ts`.
- `tests/components/` — user-visible component behavior and interactions in
  jsdom. Prefer accessible queries and `userEvent`; avoid snapshots and tests
  that only prove a component renders.
- `tests/integration/` — server actions, queries, routes, authorization, and
  workflow mutations against the test PostgreSQL database.
- `tests/e2e/` — browser journeys across the running app. The `@smoke` subset
  is defined by `tests/e2e/smoke-registry.ts`; other browser checks run in the
  full Playwright suite.

## Commands

```bash
npm run test:unit
npm run test:components
npm run test:integration
npm run test:e2e:smoke
npm run test:e2e
```

`npm run test` runs unit and component tests. Integration and local E2E tests
need a reachable test database; `npm run test:integration` applies migrations
before running. PR CI runs `npm run check`, `npm run test`, `npm run
test:integration`, `npm run test:e2e:smoke`, and `npm run build`; the full
Playwright suite remains a local or pre-release check.

## Fixtures and isolation

Shared test-only setup and fixtures live in `tests/support/`. Integration test
data must use a per-file prefix from `derivePerFilePrefix()` and clean up its
fixtures in `afterAll`. The final `zzz-residue.test.ts` check reports fixture
rows left behind by a test.

Use the workflow fixture for common membership and inquiry scenarios, billing
fixtures for subscription states, and quote fixtures for quote lifecycle
states. Add a shared helper only when it removes repeated setup without hiding
the behavior a test is meant to prove.

## Browser conventions

- Playwright owns the server. `npm run test:e2e` migrates and seeds the demo
  database, then starts the dev server from `config/playwright.config.ts`. Use
  `PORT=3100 npm run test:e2e` when the default port is taken. If
  `PLAYWRIGHT_BASE_URL` points at an already-running app, migrate and seed that
  database yourself before running
  `npx playwright test --config config/playwright.config.ts`.
- The Playwright web server blanks live email, AI, and Redis configuration.
  Browser tests must not depend on a provider call; mock chat endpoints with
  `page.route`, as the Agent and Assistant specs do.
- Demo accounts and public tokens come from `tests/e2e/fixtures.ts`. The seed
  hard-codes the owner credentials, so do not reintroduce env overrides for
  accounts the seed does not read. Call `assignIsolatedTestClientIp(page)`
  before signing in: Better Auth rate-limits sign-in per client IP and the
  suite signs in repeatedly. The TEST-NET-1 header is applied to local targets
  only.
- E2E specs share one seeded database, so mutating journeys use
  `test.describe.configure({ mode: "serial" })` and restore state when it is
  cheap. The suite runs with a single worker.
- Prefer web-first assertions and explicit readiness markers over
  `networkidle`; dashboard prefetch keeps the network busy. Dev routes compile
  on first visit, so warm a heavy route when the test measures navigation, and
  size `test.setTimeout` or assertion timeouts to that cold compile. Never
  raise a timeout to hide a product failure; use `expect(...).toPass()` only for
  hydration races where a click before client handlers attach is a no-op.
- `@smoke` membership is enforced by `tests/e2e/smoke-registry.ts`. Tagging a
  new smoke journey requires adding its spec and workflow label there.

## Conventions

- Assert observable outcomes and important failure cases, not private call
  sequences unless the call itself is the behavior under test.
- Keep authorization and tenant-isolation checks at the integration boundary.
- Keep each test independent, deterministic, and focused on a distinct behavior.
- Use a real database for persistence and transaction guarantees; mock external
  providers at their boundary.
- Put executable tests under one of the four tiers so the normal test commands
  discover and run them.
