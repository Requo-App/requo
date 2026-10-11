import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const dbRows: Array<{ role: string | null; banned: boolean }> = [];
  const limit = vi.fn(async () => dbRows);
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit,
      }),
    }),
  }));
  return {
    getOptionalSessionMock: vi.fn(),
    forbiddenMock: vi.fn(),
    redirectMock: vi.fn(),
    dbRows,
    selectMock: select,
    limitMock: limit,
  };
});

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  forbidden: mocks.forbiddenMock,
  redirect: mocks.redirectMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: mocks.getOptionalSessionMock,
}));

vi.mock("@/lib/db/client", () => ({
  db: { select: mocks.selectMock },
  dbConnection: { end: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: {
    ADMIN_EMAILS: "allowlisted@example.com",
    BETTER_AUTH_URL: "http://127.0.0.1:3000",
  },
}));

import {
  requireAdminConsoleUser,
  requireAdminUser,
} from "@/features/admin/access";

const {
  getOptionalSessionMock,
  forbiddenMock,
  redirectMock,
  dbRows,
  selectMock,
  limitMock,
} = mocks;

const adminUser = {
  id: "admin_1",
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  emailVerified: true,
  banned: false,
};

const memberUser = {
  id: "user_1",
  email: "user@example.com",
  name: "Member",
  role: "user",
  emailVerified: true,
  banned: false,
};

function makeSession(user: Record<string, unknown> & { id: string }) {
  return {
    session: { id: "sess_1", userId: user.id, expiresAt: new Date() },
    user,
  };
}

function setDbRows(rows: Array<{ role: string | null; banned: boolean }>) {
  dbRows.length = 0;
  dbRows.push(...rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  setDbRows([]);
  forbiddenMock.mockImplementation(() => {
    throw new Error("NEXT_FORBIDDEN");
  });
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  });
});

describe("features/admin/access requireAdminUser", () => {
  it("redirects to /login when there is no active session", async () => {
    getOptionalSessionMock.mockResolvedValue(null);

    await expect(requireAdminUser()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(forbiddenMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when the session has no user", async () => {
    getOptionalSessionMock.mockResolvedValue({ session: {} });

    await expect(requireAdminUser()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("answers a non-admin with 403", async () => {
    getOptionalSessionMock.mockResolvedValue(makeSession(memberUser));

    await expect(requireAdminUser()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(forbiddenMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("answers with 403 when the user role is null and the DB agrees", async () => {
    getOptionalSessionMock.mockResolvedValue(
      makeSession({ ...memberUser, role: null }),
    );
    setDbRows([{ role: "user", banned: false }]);

    await expect(requireAdminUser()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(forbiddenMock).toHaveBeenCalledTimes(1);
  });

  it("returns the session context for an admin user without a DB lookup", async () => {
    const session = makeSession(adminUser);
    getOptionalSessionMock.mockResolvedValue(session);

    const context = await requireAdminUser();

    expect(forbiddenMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
    expect(context).toEqual({
      session,
      user: session.user,
    });
  });

  it("admits a stale session once the database shows role = admin", async () => {
    // Better Auth's session cookieCache keeps serving the pre-promotion
    // role until updateAge elapses; the gate must not bounce these users.
    const session = makeSession({ ...memberUser, role: "user" });
    getOptionalSessionMock.mockResolvedValue(session);
    setDbRows([{ role: "admin", banned: false }]);

    const context = await requireAdminUser();

    expect(forbiddenMock).not.toHaveBeenCalled();
    expect(context).toEqual({
      session,
      user: session.user,
    });
  });

  it("admits an allowlisted email even before the role column is promoted", async () => {
    const session = makeSession({
      ...memberUser,
      email: "allowlisted@example.com",
    });
    getOptionalSessionMock.mockResolvedValue(session);
    setDbRows([{ role: "user", banned: false }]);

    const context = await requireAdminUser();

    expect(forbiddenMock).not.toHaveBeenCalled();
    expect(context.user.email).toBe("allowlisted@example.com");
  });

  it("refuses a banned user even when allowlisted", async () => {
    getOptionalSessionMock.mockResolvedValue(
      makeSession({ ...memberUser, email: "allowlisted@example.com" }),
    );
    setDbRows([{ role: "admin", banned: true }]);

    await expect(requireAdminUser()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(forbiddenMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a banned administrator without a database lookup", async () => {
    // Regression: the role fast path used to return before checking the
    // ban, admitting a banned admin while the session still carried the
    // admin role.
    getOptionalSessionMock.mockResolvedValue(
      makeSession({ ...adminUser, banned: true }),
    );

    await expect(requireAdminUser()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(forbiddenMock).toHaveBeenCalledTimes(1);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("refuses a demoted administrator whose database row agrees", async () => {
    getOptionalSessionMock.mockResolvedValue(
      makeSession({ ...memberUser, role: "user" }),
    );
    setDbRows([{ role: "user", banned: false }]);

    await expect(requireAdminUser()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(forbiddenMock).toHaveBeenCalledTimes(1);
  });

  it("grants nothing when the eligibility lookup itself fails", async () => {
    getOptionalSessionMock.mockResolvedValue(
      makeSession({ ...memberUser, role: null }),
    );
    limitMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    await expect(requireAdminUser()).rejects.toThrow("connect ECONNREFUSED");
    expect(forbiddenMock).not.toHaveBeenCalled();
  });
});

describe("features/admin/access requireAdminConsoleUser", () => {
  it("redirects to /login when there is no active session", async () => {
    getOptionalSessionMock.mockResolvedValue(null);

    await expect(requireAdminConsoleUser()).rejects.toThrow(
      "NEXT_REDIRECT /login",
    );
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(forbiddenMock).not.toHaveBeenCalled();
  });

  it("answers a non-admin with 403", async () => {
    getOptionalSessionMock.mockResolvedValue(makeSession(memberUser));

    await expect(requireAdminConsoleUser()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(forbiddenMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns the session context for an admin user", async () => {
    const session = makeSession(adminUser);
    getOptionalSessionMock.mockResolvedValue(session);

    const context = await requireAdminConsoleUser();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(forbiddenMock).not.toHaveBeenCalled();
    expect(context).toEqual({
      session,
      user: session.user,
    });
  });

  it("admits a stale session once the database shows role = admin", async () => {
    const session = makeSession({ ...memberUser, role: "user" });
    getOptionalSessionMock.mockResolvedValue(session);
    setDbRows([{ role: "admin", banned: false }]);

    const context = await requireAdminConsoleUser();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(forbiddenMock).not.toHaveBeenCalled();
    expect(context).toEqual({
      session,
      user: session.user,
    });
  });

  it("admits an allowlisted email even before the role column is promoted", async () => {
    const session = makeSession({
      ...memberUser,
      email: "allowlisted@example.com",
    });
    getOptionalSessionMock.mockResolvedValue(session);
    setDbRows([{ role: "user", banned: false }]);

    const context = await requireAdminConsoleUser();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(forbiddenMock).not.toHaveBeenCalled();
    expect(context.user.email).toBe("allowlisted@example.com");
  });
});
