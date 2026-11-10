import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Server-side enforcement for the optional Turnstile challenge.
 *
 * The captcha plugin runs before the password handlers, so these cases do not
 * touch the database. Keep the coverage at the auth-handler boundary: a typo
 * in the endpoint list or expected action must not leave password auth
 * silently unprotected.
 */

const BASE_URL = "http://localhost:3000";
const SITE_KEY = "1x0000000000000000000000000000000AA";
const SECRET_KEY = "1x0000000000000000000000000000000AA";

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  if (String(input).includes("challenges.cloudflare.com/turnstile/v0/siteverify")) {
    return new Response(
      JSON.stringify({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  throw new Error(`Unexpected fetch: ${String(input)}`);
});

let auth: typeof import("@/lib/auth/config")["auth"];

function authRequest(
  path: string,
  body: Record<string, unknown>,
  token?: string,
) {
  return new Request(`${BASE_URL}/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: BASE_URL,
      referer: `${BASE_URL}/login`,
      ...(token ? { "x-captcha-response": token } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("Turnstile auth enforcement", () => {
  beforeAll(async () => {
    vi.stubEnv("BETTER_AUTH_URL", BASE_URL);
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", SITE_KEY);
    vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET_KEY);
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    ({ auth } = await import("@/lib/auth/config"));

    // The captcha check runs before the password handlers; keep the database
    // rate limiter out of this boundary test. Rate limiting has its own
    // integration coverage.
    const context = await auth.$context;
    context.rateLimit.enabled = false;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it.each([
    [
      "/sign-up/email",
      {
        name: "Owner",
        email: "owner@example.com",
        password: "Password123!",
      },
    ],
    [
      "/sign-in/email",
      { email: "owner@example.com", password: "Password123!" },
    ],
    [
      "/request-password-reset",
      { email: "owner@example.com", redirectTo: "/reset-password" },
    ],
  ])("rejects %s without a captcha token", async (path, body) => {
    fetchMock.mockClear();

    const response = await auth.handler(authRequest(path, body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: "Missing CAPTCHA response",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a token that Cloudflare does not verify", async () => {
    fetchMock.mockClear();

    const response = await auth.handler(
      authRequest(
        "/sign-in/email",
        { email: "owner@example.com", password: "Password123!" },
        "invalid-token",
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      message: "Captcha verification failed",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not challenge endpoints outside the configured list", async () => {
    fetchMock.mockClear();

    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, {
        headers: { origin: BASE_URL },
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
