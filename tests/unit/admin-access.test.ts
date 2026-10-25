import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  // If a future change reintroduces the allowlist as a server-side grant, the
  // allowlisted-email test below must catch it.
  process.env.ADMIN_EMAILS = "admin@example.com";

  return {
    session: null as null | {
      user: {
        id: string;
        email: string;
        role: string | null;
        banned: boolean;
      };
    },
    rows: [] as Array<{ role: string | null; banned: boolean }>,
    selectCalls: 0,
    dbError: null as Error | null,
    forbidden: vi.fn(() => {
      throw new Error("NEXT_FORBIDDEN");
    }),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
  };
});

vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("next/navigation", () => ({
  forbidden: state.forbidden,
  redirect: state.redirect,
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => {
      state.selectCalls += 1;
      if (state.dbError) {
        throw state.dbError;
      }
      return {
        from: () => ({
          where: () => ({
            limit: async () => state.rows,
          }),
        }),
      };
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: async () => state.session,
}));

import { requireAdminUser } from "@/features/admin/access";

const cachedAdminSession = {
  user: {
    id: "user_admin",
    email: "admin@example.com",
    role: "admin",
    banned: false,
  },
};

beforeEach(() => {
  state.session = null;
  state.rows = [];
  state.selectCalls = 0;
  state.dbError = null;
  state.forbidden.mockClear();
  state.redirect.mockClear();
});

describe("requireAdminUser", () => {
  it("refuses a cached admin role when the database has demoted the user", async () => {
    state.session = cachedAdminSession;
    state.rows = [{ role: "user", banned: false }];

    await expect(requireAdminUser()).rejects.toThrow("NEXT_FORBIDDEN");

    expect(state.selectCalls).toBe(1);
    expect(state.forbidden).toHaveBeenCalledOnce();
  });

  it("refuses a cached admin role when the database has banned the user", async () => {
    state.session = cachedAdminSession;
    state.rows = [{ role: "admin", banned: true }];

    await expect(requireAdminUser()).rejects.toThrow("NEXT_FORBIDDEN");

    expect(state.selectCalls).toBe(1);
  });

  it("admits a freshly promoted admin whose cached role is still user", async () => {
    state.session = {
      user: { ...cachedAdminSession.user, role: "user" },
    };
    state.rows = [{ role: "admin", banned: false }];

    const context = await requireAdminUser();

    expect(context.user.id).toBe("user_admin");
    expect(state.selectCalls).toBe(1);
  });

  it("refuses an allowlisted email whose database role is not admin", async () => {
    state.session = cachedAdminSession;
    state.rows = [{ role: "user", banned: false }];

    await expect(requireAdminUser()).rejects.toThrow("NEXT_FORBIDDEN");

    expect(state.selectCalls).toBe(1);
  });

  it("refuses an admin session with no database user row", async () => {
    state.session = cachedAdminSession;
    state.rows = [];

    await expect(requireAdminUser()).rejects.toThrow("NEXT_FORBIDDEN");
  });

  it("propagates database failures instead of granting access", async () => {
    state.session = cachedAdminSession;
    state.dbError = new Error("database unavailable");

    await expect(requireAdminUser()).rejects.toThrow("database unavailable");
  });

  it("refuses a cached ban without querying the database", async () => {
    state.session = {
      user: { ...cachedAdminSession.user, banned: true },
    };

    await expect(requireAdminUser()).rejects.toThrow("NEXT_FORBIDDEN");

    expect(state.selectCalls).toBe(0);
  });

  it("redirects unauthenticated visitors to login", async () => {
    await expect(requireAdminUser()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(state.redirect).toHaveBeenCalledWith("/login");
    expect(state.selectCalls).toBe(0);
  });
});
