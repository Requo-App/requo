import { getOptionalSession } from "@/lib/auth/session";

const allowedAvatarHosts = new Set(["avatars.githubusercontent.com"]);

/** Timeout for upstream avatar fetch (ms). Google CDN is usually <200ms. */
const UPSTREAM_TIMEOUT_MS = 5_000;

function isAllowedOAuthAvatarUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  const host = url.hostname.toLowerCase();

  if (allowedAvatarHosts.has(host)) {
    return true;
  }

  // Google avatar CDN can appear as *.googleusercontent.com
  if (host.endsWith(".googleusercontent.com")) {
    return true;
  }

  return false;
}

async function fetchUpstream(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Some avatar CDNs behave better with an explicit accept.
        accept:
          "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.2",
      },
    });

    if (response.ok) {
      return response;
    }

    return null;
  } catch {
    // Network error, timeout, or abort — treat as transient failure.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const session = await getOptionalSession();

  if (!session?.user?.image) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  const oauthImage = session.user.image;

  if (!isAllowedOAuthAvatarUrl(oauthImage)) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  // Try fetching with one retry on transient failure. Google's avatar CDN
  // occasionally returns 5xx or times out under load.
  let upstream = await fetchUpstream(oauthImage);

  if (!upstream) {
    upstream = await fetchUpstream(oauthImage);
  }

  if (!upstream) {
    // Both attempts failed — return 404 with a short negative-cache so the
    // browser retries on next navigation rather than hammering the proxy.
    return new Response("Not found", {
      status: 404,
      headers: {
        "cache-control": "private, max-age=30",
      },
    });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";

  // Stream the body through without buffering.
  return new Response(upstream.body, {
    headers: {
      "cache-control": "private, max-age=3600, stale-while-revalidate=86400",
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    },
  });
}

