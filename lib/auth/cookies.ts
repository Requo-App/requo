import "server-only";

import { createCookieGetter, getCookies } from "better-auth/cookies";
import { cookies } from "next/headers";

import { auth } from "@/lib/auth/server";

type AuthCookie = ReturnType<typeof getCookies>["sessionToken"];
type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Expire one Better Auth cookie, including any chunked variants already in the
 * current response. Session data (and account data) is split into `<name>.0`,
 * `<name>.1`, ... when it exceeds the browser's per-cookie limit.
 */
function expireCookie(cookieStore: CookieStore, cookie: AuthCookie) {
  const options = {
    domain: cookie.attributes.domain,
    expires: cookie.attributes.expires,
    httpOnly: cookie.attributes.httpOnly,
    partitioned: cookie.attributes.partitioned,
    path: cookie.attributes.path,
    sameSite: cookie.attributes.sameSite.toLowerCase() as
      | "lax"
      | "strict"
      | "none",
    secure: cookie.attributes.secure,
    maxAge: 0,
  };

  cookieStore.set(cookie.name, "", options);

  const chunkPrefix = `${cookie.name}.`;
  for (const existing of cookieStore.getAll()) {
    if (existing.name.startsWith(chunkPrefix)) {
      cookieStore.set(existing.name, "", options);
    }
  }
}

/**
 * Expire Better Auth's session cookies and the admin plugin's `admin_session`
 * cookie in the current response.
 *
 * Deleting a session row is not enough when Better Auth has already written
 * cookies for this request: its signed `session_data` cookie cache keeps
 * resolving the deleted session until the payload expires. Impersonation
 * revocation paths must call this before returning so the browser cannot keep
 * acting as the target.
 */
export async function clearAuthSessionCookies() {
  const cookieStore = await cookies();
  const authCookies = getCookies(auth.options);
  const createCookie = createCookieGetter(auth.options);

  const cookiesToExpire = [
    authCookies.sessionToken,
    authCookies.sessionData,
    authCookies.dontRememberToken,
    authCookies.accountData,
    createCookie("admin_session"),
  ];

  for (const cookie of cookiesToExpire) {
    expireCookie(cookieStore, cookie);
  }
}
