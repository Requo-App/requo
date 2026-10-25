import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const store = new Map<string, string>();
  const setCalls: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];

  return {
    store,
    setCalls,
    authOptions: {
      baseURL: "https://app.example.com",
      advanced: {
        useSecureCookies: true,
        cookiePrefix: "better-auth",
        crossSubDomainCookies: {
          enabled: true,
          domain: ".example.com",
        },
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        cookieCache: { enabled: true, maxAge: 300 },
      },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () =>
      Array.from(state.store, ([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      state.store.set(name, value);
      state.setCalls.push({ name, value, options });
    },
  }),
}));

vi.mock("@/lib/auth/server", () => ({
  auth: { options: state.authOptions },
}));

import { clearAuthSessionCookies } from "@/lib/auth/cookies";

describe("clearAuthSessionCookies", () => {
  beforeEach(() => {
    state.store.clear();
    state.setCalls.length = 0;
  });

  it("expires session cookies, chunked cache cookies, and the admin session cookie", async () => {
    state.store.set("__Secure-better-auth.session_data.0", "chunk-0");
    state.store.set("__Secure-better-auth.session_data.1", "chunk-1");
    state.store.set("unrelated", "keep-me");

    await clearAuthSessionCookies();

    const names = state.setCalls.map((call) => call.name);

    expect(names.sort()).toEqual([
      "__Secure-better-auth.account_data",
      "__Secure-better-auth.admin_session",
      "__Secure-better-auth.dont_remember",
      "__Secure-better-auth.session_data",
      "__Secure-better-auth.session_data.0",
      "__Secure-better-auth.session_data.1",
      "__Secure-better-auth.session_token",
    ]);

    for (const call of state.setCalls) {
      expect(call.value).toBe("");
      expect(call.options).toEqual(
        expect.objectContaining({
          domain: ".example.com",
          httpOnly: true,
          maxAge: 0,
          path: "/",
          sameSite: "lax",
          secure: true,
        }),
      );
    }

    expect(state.store.has("unrelated")).toBe(true);
  });
});
