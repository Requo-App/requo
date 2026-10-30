import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { hashOpaqueToken } from "@/lib/security/tokens";

export const quoteDiscussionGuestCookieName = "requo-quote-guest";
export const quoteDiscussionGuestSessionMaxAgeSeconds = 60 * 60 * 24 * 90;

/**
 * The cookie is a convenience for grouping messages from one browser, not an
 * access credential. Access is granted solely by the quote's public bearer
 * token, so the cookie can never unlock another quote or business.
 *
 * The stored value is scoped with a hash of the quote token and the session
 * token; only the session token's hash is persisted on messages.
 */
function getQuoteScope(quoteToken: string) {
  return hashOpaqueToken(quoteToken).slice(0, 16);
}

function createGuestSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function getQuoteDiscussionGuestSessionHash({
  quoteToken,
  cookieValue,
}: {
  quoteToken: string;
  cookieValue: string | null | undefined;
}) {
  if (!cookieValue) {
    return null;
  }

  const separatorIndex = cookieValue.indexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const scope = cookieValue.slice(0, separatorIndex);
  const token = cookieValue.slice(separatorIndex + 1);

  if (scope !== getQuoteScope(quoteToken) || token.length < 32) {
    return null;
  }

  return hashOpaqueToken(token);
}

export async function readQuoteDiscussionGuestSessionHash(quoteToken: string) {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(quoteDiscussionGuestCookieName)?.value;

  return getQuoteDiscussionGuestSessionHash({ quoteToken, cookieValue });
}

/**
 * Returns the existing session hash, or creates and sets a new HttpOnly,
 * SameSite=Lax cookie scoped to the public quote routes.
 */
export async function ensureQuoteDiscussionGuestSessionHash(
  quoteToken: string,
) {
  const cookieStore = await cookies();
  const existing = getQuoteDiscussionGuestSessionHash({
    quoteToken,
    cookieValue: cookieStore.get(quoteDiscussionGuestCookieName)?.value,
  });

  if (existing) {
    return existing;
  }

  const token = createGuestSessionToken();

  cookieStore.set(
    quoteDiscussionGuestCookieName,
    `${getQuoteScope(quoteToken)}.${token}`,
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/quote",
      maxAge: quoteDiscussionGuestSessionMaxAgeSeconds,
    },
  );

  return hashOpaqueToken(token);
}
