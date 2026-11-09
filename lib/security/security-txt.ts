/**
 * RFC 9116 security.txt body.
 *
 * Both `/.well-known/security.txt` (the canonical location) and the legacy
 * `/.well-known/security-txt` route read this helper so the contact and policy
 * cannot drift apart.
 */
export function getSecurityTxtBody(now = new Date()): string {
  const expires = new Date(now);
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);

  return [
    "Contact: mailto:security@requo.app",
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    "Policy: https://requo.app/security#vulnerability-disclosure",
  ].join("\n");
}
