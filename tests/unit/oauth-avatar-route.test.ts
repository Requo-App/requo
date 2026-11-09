import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAvatar: vi.fn(),
  session: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: mocks.session,
}));

vi.mock("@/features/account/oauth-avatar", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/account/oauth-avatar")>();

  return { ...actual, fetchOAuthAvatar: mocks.fetchAvatar };
});

import { GET } from "@/app/api/account/oauth-avatar/route";

const allowedImage = "https://avatars.githubusercontent.com/u/1?v=4";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/account/oauth-avatar", () => {
  it("returns 404 without a session", async () => {
    mocks.session.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.fetchAvatar).not.toHaveBeenCalled();
  });

  it("refuses a session avatar outside the allowlist before fetching", async () => {
    mocks.session.mockResolvedValue({
      user: { image: "https://evil.example/avatar.png" },
    });

    const response = await GET();

    expect(response.status).toBe(404);
    expect(mocks.fetchAvatar).not.toHaveBeenCalled();
  });

  it("returns an allowed avatar with private caching and nosniff", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    mocks.session.mockResolvedValue({ user: { image: allowedImage } });
    mocks.fetchAvatar.mockResolvedValue({
      bytes,
      contentType: "image/png",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.arrayBuffer()).resolves.toEqual(bytes.buffer);
  });

  it("returns a short negative cache after both upstream attempts fail", async () => {
    mocks.session.mockResolvedValue({ user: { image: allowedImage } });
    mocks.fetchAvatar.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, max-age=30");
    expect(mocks.fetchAvatar).toHaveBeenCalledTimes(2);
  });
});
