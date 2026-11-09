import { describe, expect, it, vi } from "vitest";

import {
  fetchOAuthAvatar,
  isAllowedOAuthAvatarContentType,
  isAllowedOAuthAvatarUrl,
  readOAuthAvatarBody,
  resolveOAuthAvatarRedirect,
} from "@/features/account/oauth-avatar";

const githubAvatar = "https://avatars.githubusercontent.com/u/1?v=4";
const googleAvatar = "https://lh3.googleusercontent.com/a/avatar";

function imageResponse(
  body: BodyInit,
  contentType = "image/png",
  init: ResponseInit = {},
) {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": contentType,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function redirectResponse(location: string) {
  return new Response(null, {
    status: 302,
    headers: { location },
  });
}

describe("OAuth avatar URL policy", () => {
  it("accepts the provider avatar CDNs over HTTPS", () => {
    expect(isAllowedOAuthAvatarUrl(githubAvatar)).toBe(true);
    expect(isAllowedOAuthAvatarUrl(googleAvatar)).toBe(true);
  });

  it("rejects non-HTTPS, non-provider, credentialed, and non-default-port URLs", () => {
    expect(
      isAllowedOAuthAvatarUrl("http://avatars.githubusercontent.com/u/1"),
    ).toBe(false);
    expect(isAllowedOAuthAvatarUrl("https://evil.example/avatar.png")).toBe(
      false,
    );
    expect(
      isAllowedOAuthAvatarUrl(
        "https://avatars.githubusercontent.com@evil.example/avatar.png",
      ),
    ).toBe(false);
    expect(
      isAllowedOAuthAvatarUrl(
        "https://user:pass@avatars.githubusercontent.com/u/1",
      ),
    ).toBe(false);
    expect(
      isAllowedOAuthAvatarUrl("https://avatars.githubusercontent.com:8443/u/1"),
    ).toBe(false);
    expect(isAllowedOAuthAvatarUrl("not a url")).toBe(false);
  });

  it("rejects lookalike and bare googleusercontent hosts", () => {
    expect(
      isAllowedOAuthAvatarUrl(
        "https://avatars.githubusercontent.com.evil.example/avatar.png",
      ),
    ).toBe(false);
    expect(
      isAllowedOAuthAvatarUrl("https://googleusercontent.com/avatar.png"),
    ).toBe(false);
  });
});

describe("OAuth avatar redirects", () => {
  it("resolves a relative redirect against the current allowed URL", () => {
    expect(resolveOAuthAvatarRedirect(githubAvatar, "/u/2?v=4")).toBe(
      "https://avatars.githubusercontent.com/u/2?v=4",
    );
  });

  it("accepts an absolute redirect to another allowed host", () => {
    expect(resolveOAuthAvatarRedirect(githubAvatar, googleAvatar)).toBe(
      googleAvatar,
    );
  });

  it("rejects missing, malformed, downgraded, and external redirects", () => {
    expect(resolveOAuthAvatarRedirect(githubAvatar, null)).toBeNull();
    expect(resolveOAuthAvatarRedirect(githubAvatar, "http://[")).toBeNull();
    expect(
      resolveOAuthAvatarRedirect(
        githubAvatar,
        "http://avatars.githubusercontent.com/u/2",
      ),
    ).toBeNull();
    expect(
      resolveOAuthAvatarRedirect(
        githubAvatar,
        "https://169.254.169.254/latest/meta-data",
      ),
    ).toBeNull();
    expect(
      resolveOAuthAvatarRedirect(
        githubAvatar,
        "https://avatars.githubusercontent.com.evil.example/u/2",
      ),
    ).toBeNull();
  });
});

describe("OAuth avatar response policy", () => {
  it("accepts only raster image content types", () => {
    expect(isAllowedOAuthAvatarContentType("image/png")).toBe(true);
    expect(isAllowedOAuthAvatarContentType("image/jpeg; charset=binary")).toBe(
      true,
    );
    expect(isAllowedOAuthAvatarContentType("image/svg+xml")).toBe(false);
    expect(isAllowedOAuthAvatarContentType("text/html")).toBe(false);
    expect(isAllowedOAuthAvatarContentType("application/octet-stream")).toBe(
      false,
    );
    expect(isAllowedOAuthAvatarContentType(null)).toBe(false);
  });

  it("reads a body inside the byte cap", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await expect(readOAuthAvatarBody(imageResponse(bytes))).resolves.toEqual(
      bytes,
    );
  });

  it("rejects a declared body above the cap without reading it", async () => {
    const response = imageResponse(new Uint8Array([1, 2, 3]), "image/png", {
      headers: { "content-length": "999" },
    });

    await expect(readOAuthAvatarBody(response, 10)).resolves.toBeNull();
  });

  it("rejects a chunked body that grows past the cap", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });

    await expect(
      readOAuthAvatarBody(imageResponse(body), 10),
    ).resolves.toBeNull();
  });

  it("rejects an empty body", async () => {
    await expect(
      readOAuthAvatarBody(imageResponse(new Uint8Array())),
    ).resolves.toBeNull();
  });
});

describe("fetchOAuthAvatar", () => {
  it("fetches an allowed avatar with manual redirect handling", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const fetchImpl = vi.fn(async () => imageResponse(bytes));

    const result = await fetchOAuthAvatar(githubAvatar, { fetchImpl });

    expect(result).toEqual({ bytes, contentType: "image/png" });
    expect(fetchImpl).toHaveBeenCalledWith(
      githubAvatar,
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("follows a redirect only when the next hop is also allowed", async () => {
    const bytes = new Uint8Array([1]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse(googleAvatar))
      .mockResolvedValueOnce(imageResponse(bytes));

    const result = await fetchOAuthAvatar(githubAvatar, { fetchImpl });

    expect(result).toEqual({ bytes, contentType: "image/png" });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      googleAvatar,
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("refuses a redirect to a private address without following it", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectResponse("https://169.254.169.254/latest/meta-data"),
    );

    await expect(fetchOAuthAvatar(githubAvatar, { fetchImpl })).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses an overlong redirect chain", async () => {
    const fetchImpl = vi.fn(async () => redirectResponse(githubAvatar));

    await expect(
      fetchOAuthAvatar(githubAvatar, { fetchImpl, maxRedirects: 1 }),
    ).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses non-image and failed responses", async () => {
    const html = vi.fn(async () =>
      imageResponse(new Uint8Array([1]), "text/html"),
    );
    const failed = vi.fn(async () => new Response("nope", { status: 500 }));

    await expect(fetchOAuthAvatar(githubAvatar, { fetchImpl: html })).resolves.toBeNull();
    await expect(fetchOAuthAvatar(githubAvatar, { fetchImpl: failed })).resolves.toBeNull();
  });

  it("refuses an initial URL outside the allowlist before fetching", async () => {
    const fetchImpl = vi.fn();

    await expect(
      fetchOAuthAvatar("https://evil.example/avatar.png", { fetchImpl }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null when the response body stalls past the timeout", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
            // Model fetch rejecting a pending body read when its signal aborts.
            init?.signal?.addEventListener(
              "abort",
              () => controller.error(init.signal?.reason),
              { once: true },
            );
          },
        });

        return imageResponse(body);
      },
    );

    await expect(
      fetchOAuthAvatar(githubAvatar, { fetchImpl, timeoutMs: 10 }),
    ).resolves.toBeNull();
  });

  it("treats a network failure as a transient miss", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(fetchOAuthAvatar(githubAvatar, { fetchImpl })).resolves.toBeNull();
  });
});
