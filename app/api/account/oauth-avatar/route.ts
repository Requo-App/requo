import { getOptionalSession } from "@/lib/auth/session";
import {
  fetchOAuthAvatar,
  isAllowedOAuthAvatarUrl,
} from "@/features/account/oauth-avatar";

function notFound(headers: Record<string, string> = {}) {
  return new Response("Not found", {
    status: 404,
    headers: {
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export async function GET() {
  const session = await getOptionalSession();

  if (!session?.user?.image) {
    return notFound();
  }

  const oauthImage = session.user.image;

  if (!isAllowedOAuthAvatarUrl(oauthImage)) {
    return notFound();
  }

  // Try fetching with one retry on transient failure. Google's avatar CDN
  // occasionally returns 5xx or times out under load.
  let avatar = await fetchOAuthAvatar(oauthImage);

  if (!avatar) {
    avatar = await fetchOAuthAvatar(oauthImage);
  }

  if (!avatar) {
    // Both attempts failed — return 404 with a short negative-cache so the
    // browser retries on next navigation rather than hammering the proxy.
    return notFound({ "cache-control": "private, max-age=30" });
  }

  return new Response(avatar.bytes, {
    headers: {
      "cache-control": "private, max-age=3600, stale-while-revalidate=86400",
      "content-type": avatar.contentType,
      "x-content-type-options": "nosniff",
    },
  });
}
