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
before running.

## Fixtures and isolation

Shared test-only setup and fixtures live in `tests/support/`. Integration test
data must use a per-file prefix from `derivePerFilePrefix()` and clean up its
fixtures in `afterAll`. The final `zzz-residue.test.ts` check reports fixture
rows left behind by a test.

Use the workflow fixture for common membership and inquiry scenarios, billing
fixtures for subscription states, and quote fixtures for quote lifecycle
states. Add a shared helper only when it removes repeated setup without hiding
the behavior a test is meant to prove.

## Conventions

- Assert observable outcomes and important failure cases, not private call
  sequences unless the call itself is the behavior under test.
- Keep authorization and tenant-isolation checks at the integration boundary.
- Keep each test independent, deterministic, and focused on a distinct behavior.
- Use a real database for persistence and transaction guarantees; mock external
  providers at their boundary.
- Put executable tests under one of the four tiers so the normal test commands
  discover and run them.
