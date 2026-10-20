import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq, gte } from "drizzle-orm";

/**
 * DB-backed regression test for the public rate limiter.
 *
 * The limiter's fingerprint mixes the client IP and the User-Agent, and the
 * User-Agent is client-controlled. The scope-wide counter is what actually
 * bounds a caller that rotates its User-Agent to mint fresh buckets.
 */

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

const userAgent = { current: "test-agent/1" };

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) =>
      name === "user-agent" ? userAgent.current : "203.0.113.10",
  })),
}));

import { assertPublicActionRateLimit } from "@/lib/public-action-rate-limit";
import { publicActionEvents } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";

// The fingerprint rows are keyed by a hash that never contains the prefix,
// so a rerun inside the window would reuse the same buckets. The timestamp
// suffix gives every run its own keys.
const prefix = `${derivePerFilePrefix(__filename)}_${Date.now()}`;
const action = "public-inquiry-submit" as const;
const windowMs = 60_000;
const runStart = new Date();

describe("public action rate limit", () => {
  afterAll(async () => {
    // The fingerprint keys are hashes, so they are matched by action and
    // creation time rather than by the prefix.
    await testDb
      .delete(publicActionEvents)
      .where(
        and(
          eq(publicActionEvents.action, action),
          gte(publicActionEvents.createdAt, runStart),
        ),
      );
    await closeTestDb();
  }, 30_000);

  it("stops a caller that rotates its User-Agent to mint new buckets", async () => {
    const scope = `${prefix}:business:form`;

    // Each attempt uses a different User-Agent, so the per-fingerprint
    // limit never trips.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      userAgent.current = `test-agent/${attempt}`;

      const allowed = await assertPublicActionRateLimit({
        action,
        scope,
        limit: 4,
        scopeLimit: 5,
        windowMs,
      });

      if (attempt < 5) {
        expect(allowed).toBe(true);
      } else {
        // The scope-wide ceiling is not influenced by the User-Agent.
        expect(allowed).toBe(false);
      }
    }
  });

  it("still allows a caller inside the fingerprint limit", async () => {
    const scope = `${prefix}:other-business:form`;

    userAgent.current = "test-agent/stable";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const allowed = await assertPublicActionRateLimit({
        action,
        scope,
        limit: 4,
        scopeLimit: 10,
        windowMs,
      });

      expect(allowed).toBe(true);
    }
  });

  it("records a scope row alongside the fingerprint row", async () => {
    const scope = `${prefix}:recorded-business:form`;

    userAgent.current = "test-agent/recorded";

    await assertPublicActionRateLimit({
      action,
      scope,
      limit: 4,
      scopeLimit: 10,
      windowMs,
    });

    const rows = await testDb
      .select({ key: publicActionEvents.key })
      .from(publicActionEvents)
      .where(eq(publicActionEvents.action, action));

    const scopeRows = rows.filter((row) => row.key === `scope:${scope}`);
    expect(scopeRows).toHaveLength(1);
  });
});
