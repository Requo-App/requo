import path from "node:path";

import { test, type TestInfo } from "@playwright/test";

/**
 * Registry of Playwright spec files that are allowed to tag tests with
 * `@smoke`. Each entry maps the spec's basename to the human-readable
 * workflow label(s) it covers.
 *
 * The smoke workflows are:
 *   1. owner sign-in
 *   2. public inquiry submission
 *   3. quote creation and sending
 *   4. quote sharing
 *   5. public quote response
 *   6. invoice creation
 *   7. payment recording
 *   8. Agent conversation
 *   9. assistant conversation
 *   10. non-member denial
 *
 * Adding an entry here is an explicit acknowledgement that the spec's
 * `@smoke`-tagged tests cover one of the registered workflows. Tagging a
 * spec with `@smoke` without registering it here fails the Playwright
 * run via `registerSmokeGuard()`.
 */
export const SMOKE_REGISTRY = {
  "auth-and-dashboard.spec.ts": ["owner sign-in", "quote sharing"],
  "public-inquiry.spec.ts": ["public inquiry submission"],
  "dashboard-workflows.spec.ts": ["quote creation and sending"],
  "public-quote.spec.ts": ["public quote response"],
  "invoices.spec.ts": ["invoice creation", "payment recording"],
  "agent-conversation.spec.ts": ["Agent conversation"],
  "assistant-conversation.spec.ts": ["assistant conversation"],
  "business-members.spec.ts": ["non-member denial"],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** Basename of a spec file allowed to use the `@smoke` tag. */
export type SmokeSpecFilename = keyof typeof SMOKE_REGISTRY;

/** Workflow label registered under a specific smoke spec. */
export type SmokeWorkflowLabel =
  (typeof SMOKE_REGISTRY)[SmokeSpecFilename][number];

const SMOKE_TAG = "@smoke";

function isRegisteredSmokeSpec(basename: string): basename is SmokeSpecFilename {
  return Object.hasOwn(SMOKE_REGISTRY, basename);
}

/**
 * Fails the current test/hook if the test carries the `@smoke` tag but its
 * containing spec file is not present in {@link SMOKE_REGISTRY}.
 *
 * The spec's file basename is derived from `testInfo.file`; if that is
 * empty (unlikely in Playwright runs), `testInfo.titlePath[0]` is used as
 * a fallback since Playwright seeds the title path with the spec filename.
 */
export function assertSmokeSpecIsRegistered(testInfo: TestInfo): void {
  const tags = testInfo.tags ?? [];
  if (!tags.includes(SMOKE_TAG)) {
    return;
  }

  const rawKey = testInfo.file
    ? path.basename(testInfo.file)
    : (testInfo.titlePath[0] ?? "");
  const basename = path.basename(rawKey);

  if (!isRegisteredSmokeSpec(basename)) {
    const registered = Object.keys(SMOKE_REGISTRY).join(", ");
    throw new Error(
      `[smoke-registry] "${testInfo.titlePath.join(" > ")}" is tagged ` +
        `${SMOKE_TAG} but its spec file "${basename}" is not registered in ` +
        `tests/e2e/smoke-registry.ts. Either remove the ${SMOKE_TAG} tag or ` +
        `add "${basename}" to SMOKE_REGISTRY with the workflow label it ` +
        `covers. Registered specs: ${registered}.`,
    );
  }
}

/**
 * Installs a Playwright `test.beforeAll` hook that enforces the smoke
 * registry for the calling spec file. Import and invoke this at the top
 * of every e2e spec that participates in the smoke lane (Requirements
 * 6.9, 6.10).
 */
export function registerSmokeGuard(): void {
  test.beforeAll(async ({}, testInfo) => {
    assertSmokeSpecIsRegistered(testInfo);
  });
}
