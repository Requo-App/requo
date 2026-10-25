/**
 * Escape-hatch tracked registry for the instant-navigation rollout.
 *
 * Each entry records a single in-scope route that is temporarily exempt from
 * instant validation, along with the justification and a review date.
 *
 * This array is the source of truth consumed by the migration-coverage check
 * script (`scripts/instant-navigation/check-coverage.ts`).
 *
 * Requirements: 3.1, 3.2
 */

import type { EscapeHatchEntry } from "./escape-hatches";

/**
 * The tracked registry of active escape-hatch entries.
 *
 * To add an exemption:
 * 1. Append an entry below with a specific `route`, a non-empty `reason`,
 *    and a `targetReviewDate` (YYYY-MM-DD).
 * 2. Run `npm run audit:instant-navigation` — it validates every registry
 *    entry, rejects duplicates, and fails once an active entry is overdue.
 * 3. Keep the route's rationale visible in `docs/architecture/instant-navigation.md`.
 *
 * Admin console pages previously required an escape hatch because their auth
 * used a custom JWT cookie (`verifyAdminSession` via `cookies()`) that always
 * redirected during instant validation. That auth was replaced with
 * database-backed Better Auth role authorization, which resolves the session
 * via `headers()` like every other authenticated dashboard route. All 20 admin
 * console pages now ship `instant` config blocks; no route requires an
 * exemption. The admin layout sets `instant = false` because its session read
 * blocks the layout entry point, but navigations between console pages are
 * still validated by each page's export.
 */
export const escapeHatchRegistry: EscapeHatchEntry[] = [];
