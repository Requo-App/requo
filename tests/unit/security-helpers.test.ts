import { afterEach, describe, expect, it, vi } from "vitest";

describe("security helpers", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("stores quote public tokens in plaintext while hashing lookups", async () => {
    const {
      createStoredQuotePublicToken,
      resolveStoredQuotePublicToken,
      tryResolveStoredQuotePublicToken,
    } = await import("@/features/quotes/token-storage");
    const storedToken = createStoredQuotePublicToken("quote-public-token");

    expect(storedToken.publicToken).toBe("quote-public-token");
    expect(storedToken.publicTokenHash).toBeTruthy();
    expect(storedToken.publicTokenHash).not.toContain("quote-public-token");
    expect(
      tryResolveStoredQuotePublicToken({
        publicToken: storedToken.publicToken,
      }),
    ).toBe("quote-public-token");
    expect(
      tryResolveStoredQuotePublicToken({
        publicToken: null,
      }),
    ).toBeNull();
    expect(() =>
      resolveStoredQuotePublicToken({
        publicToken: null,
      }),
    ).toThrow("recoverable public token");
  });

  it("hashes opaque lookup tokens without exposing the original token", async () => {
    // BETTER_AUTH_SECRET is already seeded by tests/setup.ts -> applyTestEnv().
    // Do not inline real secret values in test files.
    vi.stubEnv("APP_TOKEN_HASH_SECRET", "0123456789abcdef0123456789abcdef");

    const { hashOpaqueToken } = await import("@/lib/security/tokens");

    const hash = hashOpaqueToken("quote-public-token");

    expect(hash).toBe(hashOpaqueToken("quote-public-token"));
    expect(hash).not.toContain("quote-public-token");
  });
});
