import { afterEach, describe, expect, it, vi } from "vitest";

import {
  pingRedisRest,
  pingRedisRestWithRetry,
} from "@/lib/admin/redis-health";

function okResponse() {
  return {
    ok: true,
    json: async () => ({ result: "PONG" }),
  } as Response;
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as Response;
}

describe("Redis REST health probe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts the ping command in the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await pingRedisRest("http://127.0.0.1:8079", "local-dev-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8079");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer local-dev-token",
        "Content-Type": "application/json",
      },
      body: '["ping"]',
    });
  });

  it("retries a transient connection failure and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await pingRedisRestWithRetry("http://127.0.0.1:8079", "token", {
      attempts: 2,
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a proxy-still-starting response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await pingRedisRestWithRetry("http://127.0.0.1:8079", "token", {
      attempts: 2,
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an authentication failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      pingRedisRestWithRetry("http://127.0.0.1:8079", "bad-token", {
        attempts: 3,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("HTTP 401");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
