import "../../scripts/load-env";

export const demoOwnerEmail =
  process.env.DEMO_OWNER_EMAIL ?? "demo@requo.local";
export const demoOwnerPassword =
  process.env.DEMO_OWNER_PASSWORD ?? "ChangeMe123456!";
export const demoManagerEmail =
  process.env.DEMO_MANAGER_EMAIL ?? "manager@requo.local";
export const demoManagerPassword =
  process.env.DEMO_MANAGER_PASSWORD ?? "ChangeMe123456!";
export const demoStaffEmail =
  process.env.DEMO_STAFF_EMAIL ?? "staff@requo.local";
export const demoStaffPassword =
  process.env.DEMO_STAFF_PASSWORD ?? "ChangeMe123456!";
export const demoPendingInviteEmail =
  process.env.DEMO_PENDING_INVITE_EMAIL ?? "pending-invite@requo.local";
export const demoPendingInvitePassword =
  process.env.DEMO_PENDING_INVITE_PASSWORD ?? "ChangeMe123456!";
export const demoPendingInviteToken =
  process.env.DEMO_PENDING_INVITE_TOKEN ?? "demo-business-invite-token";
export const demoOutsiderEmail =
  process.env.DEMO_OUTSIDER_EMAIL ?? "outsider@requo.local";
export const demoOutsiderPassword =
  process.env.DEMO_OUTSIDER_PASSWORD ?? "ChangeMe123456!";
export const demoBusinessSlug =
  process.env.DEMO_BUSINESS_SLUG ?? "brightside-print-studio";
export const demoQuotePublicToken =
  process.env.DEMO_QUOTE_PUBLIC_TOKEN ?? "demoquote1002senttoken";
export const demoExpiredQuotePublicToken =
  process.env.DEMO_EXPIRED_QUOTE_PUBLIC_TOKEN ?? "demoquote1005expiredtoken";
export const demoVoidedQuotePublicToken =
  process.env.DEMO_VOIDED_QUOTE_PUBLIC_TOKEN ?? "demoquote1006voidedtoken";

/**
 * Admin-console credentials for the `/admin` authorization specs.
 *
 * Hard-coded in `scripts/seed.ts` rather than env-driven: the owner email is a
 * literal (`user@email.com`, seed.ts:62) and the admin role is a literal
 * comparison against `marklouie.dev@gmail.com` (seed.ts:885). Because they
 * cannot be overridden by `DEMO_*` env vars, they are exported separately from
 * the `demo*` constants above — do not assume those cover this account.
 */
export const seededAdminEmail = "marklouie.dev@gmail.com";
export const seededAdminPassword = "12345678";
export const seededNonAdminEmail = "user@email.com";
export const seededNonAdminPassword = "12345678";
