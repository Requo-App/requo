/**
 * OAuth avatar proxy policy.
 *
 * The session's `user.image` is provider-controlled, but the proxy must still
 * treat it as untrusted: only the provider avatar CDNs are fetchable, redirects
 * are re-validated at every hop, and only raster image responses are returned.
 * This prevents the proxy from becoming an SSRF pivot through an open redirect
 * on an allowed host.
 */

const allowedOAuthAvatarHosts = new Set(["avatars.githubusercontent.com"]);

const allowedOAuthAvatarContentTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const oauthAvatarMaxBytes = 5 * 1024 * 1024;
export const oauthAvatarMaxRedirects = 3;
export const oauthAvatarTimeoutMs = 5_000;

export type OAuthAvatarFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type OAuthAvatarResult = {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
};

/**
 * True only for an HTTPS URL on a provider avatar CDN, on the default port,
 * with no embedded credentials.
 */
export function isAllowedOAuthAvatarUrl(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  if (url.username || url.password) {
    return false;
  }

  if (url.port && url.port !== "443") {
    return false;
  }

  const host = url.hostname.toLowerCase();

  if (allowedOAuthAvatarHosts.has(host)) {
    return true;
  }

  // Google avatar CDN can appear as *.googleusercontent.com.
  return host.endsWith(".googleusercontent.com");
}

/**
 * Resolves a redirect target and rejects it unless it is another allowed
 * avatar URL. Relative locations resolve against the current URL.
 */
export function resolveOAuthAvatarRedirect(
  currentUrl: string,
  location: string | null,
): string | null {
  if (!location) {
    return null;
  }

  let nextUrl: URL;

  try {
    nextUrl = new URL(location, currentUrl);
  } catch {
    return null;
  }

  return isAllowedOAuthAvatarUrl(nextUrl.href) ? nextUrl.href : null;
}

/** Only raster image responses may be returned from the proxy. */
export function isAllowedOAuthAvatarContentType(
  value: string | null,
): boolean {
  if (!value) {
    return false;
  }

  const [mimeType] = value.split(";", 1);

  return allowedOAuthAvatarContentTypes.has(
    mimeType?.trim().toLowerCase() ?? "",
  );
}

function normalizeContentType(value: string): string {
  return (value.split(";", 1)[0] ?? value).trim().toLowerCase();
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The body may already be closed or locked; nothing to release.
  }
}

/**
 * Reads a response body with a hard byte cap.
 *
 * Buffering is deliberate: the proxy must decide whether to return a 404
 * before sending response headers, and an avatar is small enough that a
 * bounded buffer is cheaper than a streaming truncation protocol.
 */
export async function readOAuthAvatarBody(
  response: Response,
  maxBytes = oauthAvatarMaxBytes,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const contentLength = response.headers.get("content-length");

  if (contentLength) {
    const declaredLength = Number(contentLength);

    if (
      !Number.isFinite(declaredLength) ||
      declaredLength <= 0 ||
      declaredLength > maxBytes
    ) {
      await cancelBody(response);
      return null;
    }
  }

  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      total += value.byteLength;

      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The stream may already be closed; the cap still applies.
        }

        return null;
      }

      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  if (total === 0) {
    return null;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

/**
 * Fetches an allowed avatar with manual redirect handling.
 *
 * `fetch(..., { redirect: "follow" })` would let an allowed host redirect the
 * request to any origin, including a private address. Each hop is therefore
 * resolved and re-validated here, and non-image responses are rejected.
 */
export async function fetchOAuthAvatar(
  url: string,
  options: {
    fetchImpl?: OAuthAvatarFetch;
    maxBytes?: number;
    maxRedirects?: number;
    timeoutMs?: number;
  } = {},
): Promise<OAuthAvatarResult | null> {
  if (!isAllowedOAuthAvatarUrl(url)) {
    return null;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? oauthAvatarMaxBytes;
  const maxRedirects = options.maxRedirects ?? oauthAvatarMaxRedirects;
  const timeoutMs = options.timeoutMs ?? oauthAvatarTimeoutMs;
  let currentUrl = url;

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;

    try {
      response = await fetchImpl(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          // Some avatar CDNs behave better with an explicit accept.
          accept:
            "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.2",
        },
      });
    } catch {
      // Network error, timeout, or abort — treat as transient failure.
      return null;
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const nextUrl = resolveOAuthAvatarRedirect(
        currentUrl,
        response.headers.get("location"),
      );

      await cancelBody(response);

      if (!nextUrl || redirectCount === maxRedirects) {
        return null;
      }

      currentUrl = nextUrl;
      continue;
    }

    const contentType = response.headers.get("content-type");

    if (!response.ok || !isAllowedOAuthAvatarContentType(contentType)) {
      await cancelBody(response);
      return null;
    }

    const bytes = await readOAuthAvatarBody(response, maxBytes);

    if (!bytes) {
      return null;
    }

    return {
      bytes,
      contentType: normalizeContentType(contentType ?? "image/jpeg"),
    };
  }

  return null;
}
