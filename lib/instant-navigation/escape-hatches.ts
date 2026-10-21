/**
 * Escape-hatch governance for the instant-navigation rollout.
 *
 * An escape hatch is a controlled, per-route, tracked exemption from instant
 * validation. It is never applied silently — every exemption requires a
 * documented reason and a target review date.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscapeHatchEntry = {
  /** Exactly one in-scope route path, e.g. "app/(business)/[businessSlug]/settings/billing/page.tsx". */
  route: string;
  /** Non-empty human justification for why the route cannot be instant this phase. */
  reason: string;
  /** ISO date by which the exemption must be removed. */
  targetReviewDate: string; // YYYY-MM-DD
  /** Whether the exemption is still applied. */
  active: boolean;
};

export type EscapeHatchValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// In-scope route set
// ---------------------------------------------------------------------------

/**
 * The complete set of in-scope authenticated dashboard page files for the
 * instant-navigation rollout. Each entry is a relative path from the project
 * root to a `page.tsx` file.
 *
 * Includes all authenticated dashboard pages under:
 * - app/(business)/[businessSlug]/(main)/ (home, inquiries, quotes, follow-ups,
 *   services, invoices, payments, products, notifications, analytics, assistant)
 * - app/(business)/[businessSlug]/settings/ (including members)
 * - app/admin/
 * - app/onboarding/
 * - app/(business)/new/
 * - app/(auth)/ (login, signup, forgot-password, reset-password, check-email)
 * - The businesses hub (app/(business)/[businessSlug]/page.tsx)
 *
 * Redirect-only legacy routes, print routes, and public preview document
 * routes are intentionally out of scope (see the progressive-data-loading
 * spec): they redirect or render specialized views and are not part of the
 * persistent dashboard shell navigation.
 */
export const IN_SCOPE_ROUTES: ReadonlySet<string> = new Set([
  // (main) dashboard routes
  "app/(business)/[businessSlug]/(main)/home/page.tsx",
  "app/(business)/[businessSlug]/(main)/inquiries/page.tsx",
  "app/(business)/[businessSlug]/(main)/inquiries/[id]/page.tsx",
  "app/(business)/[businessSlug]/(main)/inquiries/new/page.tsx",
  "app/(business)/[businessSlug]/(main)/quotes/page.tsx",
  "app/(business)/[businessSlug]/(main)/quotes/[id]/page.tsx",
  "app/(business)/[businessSlug]/(main)/quotes/new/page.tsx",
  "app/(business)/[businessSlug]/(main)/follow-ups/page.tsx",
  "app/(business)/[businessSlug]/(main)/services/page.tsx",
  "app/(business)/[businessSlug]/(main)/services/[serviceSlug]/page.tsx",
  "app/(business)/[businessSlug]/(main)/invoices/page.tsx",
  "app/(business)/[businessSlug]/(main)/invoices/new/page.tsx",
  "app/(business)/[businessSlug]/(main)/invoices/[invoiceId]/page.tsx",
  "app/(business)/[businessSlug]/(main)/invoices/[invoiceId]/edit/page.tsx",
  "app/(business)/[businessSlug]/(main)/payments/page.tsx",
  "app/(business)/[businessSlug]/(main)/payments/[paymentId]/page.tsx",
  "app/(business)/[businessSlug]/(main)/payments/[paymentId]/receipt/page.tsx",
  "app/(business)/[businessSlug]/(main)/notifications/page.tsx",
  "app/(business)/[businessSlug]/(main)/products/page.tsx",
  "app/(business)/[businessSlug]/(main)/analytics/page.tsx",
  "app/(business)/[businessSlug]/(main)/assistant/page.tsx",
  // assistant/chat/[sessionId] is a redirect to `assistant?session=…`, so it is
  // out of scope like the other legacy redirect routes.

  // Settings routes
  "app/(business)/[businessSlug]/settings/page.tsx",
  "app/(business)/[businessSlug]/settings/general/page.tsx",
  "app/(business)/[businessSlug]/settings/profile/page.tsx",
  "app/(business)/[businessSlug]/settings/appearance/page.tsx",
  "app/(business)/[businessSlug]/settings/notifications/page.tsx",
  "app/(business)/[businessSlug]/settings/quote/page.tsx",
  "app/(business)/[businessSlug]/settings/email/page.tsx",
  "app/(business)/[businessSlug]/settings/support/page.tsx",
  "app/(business)/[businessSlug]/settings/billing/page.tsx",
  "app/(business)/[businessSlug]/settings/audit-log/page.tsx",
  "app/(business)/[businessSlug]/settings/ai/page.tsx",
  "app/(business)/[businessSlug]/settings/members/page.tsx",
  // settings/forms was folded into the (main)/services surface — no
  // settings-level forms pages remain.

  // Admin console routes
  "app/admin/page.tsx",
  "app/admin/users/page.tsx",
  "app/admin/users/[userId]/page.tsx",
  "app/admin/businesses/page.tsx",
  "app/admin/businesses/[businessId]/page.tsx",
  "app/admin/inquiries/page.tsx",
  "app/admin/inquiries/[inquiryId]/page.tsx",
  "app/admin/quotes/page.tsx",
  "app/admin/quotes/[quoteId]/page.tsx",
  "app/admin/invoices/page.tsx",
  "app/admin/invoices/[invoiceId]/page.tsx",
  "app/admin/ai/page.tsx",
  "app/admin/ai/requests/page.tsx",
  "app/admin/ai/providers/page.tsx",
  "app/admin/ai/errors/page.tsx",
  "app/admin/emails/page.tsx",
  "app/admin/emails/[emailId]/page.tsx",
  "app/admin/usage/page.tsx",
  "app/admin/audit-logs/page.tsx",
  "app/admin/system/page.tsx",

  // Onboarding
  "app/onboarding/page.tsx",

  // New business
  "app/(business)/new/page.tsx",

  // Auth pages
  "app/(auth)/login/page.tsx",
  "app/(auth)/signup/page.tsx",
  "app/(auth)/forgot-password/page.tsx",
  "app/(auth)/reset-password/page.tsx",
  "app/(auth)/check-email/page.tsx",

  // Businesses hub
  "app/(business)/[businessSlug]/page.tsx",
]);

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/** ISO date pattern: YYYY-MM-DD where values are numerically valid. */
const YYYY_MM_DD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns true if `dateStr` is a valid YYYY-MM-DD date string that represents
 * a real calendar date (e.g. rejects 2024-02-30).
 */
function isValidDate(dateStr: string): boolean {
  if (!YYYY_MM_DD_PATTERN.test(dateStr)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  // Month must be 1–12, day must be 1–31 (rough pre-check)
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  // Construct a Date and verify it round-trips to the same values.
  // Date constructor month is 0-indexed.
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Validates an escape-hatch entry.
 *
 * Returns `{ ok: true }` only when ALL conditions hold:
 * 1. `entry.route` resolves to exactly one in-scope route
 * 2. `entry.reason` is non-empty (not blank/whitespace)
 * 3. `entry.targetReviewDate` is a valid YYYY-MM-DD date
 *
 * Returns `{ ok: false, errors: [...] }` naming each violated condition otherwise.
 */
export function validateEscapeHatch(
  entry: EscapeHatchEntry,
): EscapeHatchValidationResult {
  const errors: string[] = [];

  // Condition 1: route must resolve to exactly one in-scope route
  if (!IN_SCOPE_ROUTES.has(entry.route)) {
    errors.push(
      "Route does not resolve to exactly one in-scope route",
    );
  }

  // Condition 2: reason must be non-empty (not blank/whitespace)
  if (!entry.reason || entry.reason.trim().length === 0) {
    errors.push("Reason must not be empty or whitespace-only");
  }

  // Condition 3: targetReviewDate must be a valid YYYY-MM-DD date
  if (!isValidDate(entry.targetReviewDate)) {
    errors.push("Target review date must be a valid YYYY-MM-DD date");
  }

  if (errors.length === 0) {
    return { ok: true };
  }

  return { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Overdue detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the escape-hatch entry is overdue.
 *
 * An entry is overdue when it is still active AND the current time `now`
 * is strictly after the entry's `targetReviewDate`. An inactive entry is
 * never overdue, and `now` equal to `targetReviewDate` is not overdue.
 *
 * Requirements: 3.6
 */
export function isEscapeHatchOverdue(entry: EscapeHatchEntry, now: Date): boolean {
  if (!entry.active) {
    return false;
  }

  // Parse targetReviewDate (YYYY-MM-DD) as a UTC date to avoid timezone shifts.
  const [yearStr, monthStr, dayStr] = entry.targetReviewDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  // Target review date at start of that day (UTC).
  const targetDate = new Date(Date.UTC(year, month - 1, day));

  // Overdue when `now` is strictly after the target date (i.e. now > targetDate).
  return now.getTime() > targetDate.getTime();
}
