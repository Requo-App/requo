/**
 * Scope drift detection for the instant-navigation rollout.
 *
 * `IN_SCOPE_ROUTES` drives every per-route audit, so a page that exports
 * `instant` but is missing from the set would never be audited. This check
 * makes the scope set complete: every page declaring `instant`, enabled or
 * disabled, must also be listed.
 */

import { IN_SCOPE_ROUTES } from "../../lib/instant-navigation/escape-hatches";
import type { InstantExportInspection } from "./instant-export";

export type InstantPageInspection = {
  route: string;
  inspection: InstantExportInspection;
};

/**
 * Returns one message per page that declares `instant` outside the rollout
 * scope. Pages without the export are not part of the rollout and pass.
 */
export function findInstantScopeDrift(
  pages: readonly InstantPageInspection[],
): string[] {
  const errors: string[] = [];

  for (const { route, inspection } of pages) {
    if (inspection.state === "missing") continue;
    if (IN_SCOPE_ROUTES.has(route)) continue;

    errors.push(
      `Page declares \`instant\` (${inspection.state}) but is missing from IN_SCOPE_ROUTES — add it to the rollout scope or remove the export`,
    );
  }

  return errors;
}
