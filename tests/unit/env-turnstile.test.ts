import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Turnstile environment configuration", () => {
  it("rejects a site key without its secret key", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");

    await expect(import("@/lib/env")).rejects.toThrow(
      /NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must be set together/,
    );
  });

  it("disables the challenge when both keys are unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");

    const { getTurnstileConfig } = await import("@/lib/env");

    expect(getTurnstileConfig()).toBeNull();
  });

  it("returns both keys when configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");

    const { getTurnstileConfig } = await import("@/lib/env");

    expect(getTurnstileConfig()).toEqual({
      siteKey: "site-key",
      secretKey: "secret-key",
    });
  });
});
