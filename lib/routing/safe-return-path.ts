const MAX_RETURN_PATH_LENGTH = 512;
const PLACEHOLDER_ORIGIN = "https://requo.invalid";

/**
 * Normalizes a same-origin relative path for redirects.
 *
 * `URL` treats backslashes as slashes, so `"/\\evil.example"` would resolve
 * off-origin. Reject backslashes and control characters explicitly, then
 * verify the parsed URL stayed on the placeholder origin before returning
 * only the pathname, search, and hash.
 */
export function sanitizeSameOriginPath(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_RETURN_PATH_LENGTH) {
    return null;
  }

  if (trimmed.includes("\\") || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }

  if (url.origin !== PLACEHOLDER_ORIGIN) return null;
  // A same-origin URL can still normalize to a protocol-relative path such
  // as `/..//evil.example` -> `//evil.example`. Reject that shape too.
  if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) {
    return null;
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
