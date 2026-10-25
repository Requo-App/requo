/**
 * Registry-wide escape-hatch audit.
 *
 * Per-route checks only look at the first active entry selected for a page
 * that lacks `instant`. This audit validates every entry, so dormant entries
 * cannot rot and an active exemption cannot outlive its review date.
 */

import {
  isEscapeHatchOverdue,
  validateEscapeHatch,
  type EscapeHatchEntry,
} from "../../lib/instant-navigation/escape-hatches";

/**
 * Returns one message per registry problem:
 * - duplicate route keys (including one active and one dormant entry),
 * - entries failing `validateEscapeHatch` (route/reason/date),
 * - active entries whose `targetReviewDate` has passed.
 */
export function auditEscapeHatchRegistry(
  entries: readonly EscapeHatchEntry[],
  now: Date,
): string[] {
  const errors: string[] = [];
  const seenRoutes = new Set<string>();

  for (const entry of entries) {
    if (seenRoutes.has(entry.route)) {
      errors.push(
        `Duplicate escape-hatch entry for ${entry.route || "(missing route)"}`,
      );
    }
    seenRoutes.add(entry.route);

    const validation = validateEscapeHatch(entry);
    if (!validation.ok) {
      errors.push(
        `Invalid escape-hatch entry for ${entry.route || "(missing route)"}: ${validation.errors.join("; ")}`,
      );
    }

    if (entry.active && isEscapeHatchOverdue(entry, now)) {
      errors.push(
        `Active escape hatch for ${entry.route} passed its review date ${entry.targetReviewDate}`,
      );
    }
  }

  return errors;
}
