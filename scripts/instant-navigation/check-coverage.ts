#!/usr/bin/env tsx
/**
 * Migration-coverage check for the instant-navigation rollout.
 *
 * For every in-scope route, asserts that the page either:
 * 1. Has instant validation enabled (exports supported `instant` WITHOUT
 *    opting out via `instant = false`), OR
 * 2. Has a matching, valid single-route escape-hatch registry entry
 *    (validated via `validateEscapeHatch`).
 *
 * Also fails on legacy `unstable_instant` exports, which Next.js 16.3 does
 * not read — they must be migrated to `instant`.
 *
 * Fails (exit code 1) on any page that is exempted from validation without a
 * valid tracked registry entry. Exits 0 when all routes pass.
 *
 * Usage: npx tsx scripts/instant-navigation/check-coverage.ts
 *
 * Requirements: 2.5, 3.1, 3.3, 7.4
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { escapeHatchRegistry } from "../../lib/instant-navigation/escape-hatch-registry";
import {
  IN_SCOPE_ROUTES,
  validateEscapeHatch,
} from "../../lib/instant-navigation/escape-hatches";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteResult = {
  route: string;
  status: "pass-validation-enabled" | "pass-escape-hatch" | "fail";
  reason?: string;
};

// ---------------------------------------------------------------------------
// File analysis helpers (regex-based, no AST parsing)
// ---------------------------------------------------------------------------

/**
 * Returns true if the file content opts into instant validation via the
 * supported Next.js 16.3 `instant` export — meaning validation is enabled.
 *
 * Detection logic:
 * - Looks for an `instant` export (const or variable).
 * - If found, checks whether the export is set to `false` (segment exempted
 *   entirely). `instant = true` or `instant = { level: ... }` enables it.
 * - Returns true only when the export is present and not opted out.
 *
 * Legacy `unstable_instant` exports are ignored (Next.js does not read them)
 * and reported separately by `hasLegacyInstantExport`.
 */
function hasValidationEnabled(source: string): boolean {
  // Check if supported `instant` is exported at all (word-boundary guarded
  // so `unstable_instant` does not match).
  const hasExport =
    /export\s+(const|let|var)\s+instant\b/.test(source);

  if (!hasExport) {
    return false;
  }

  // Check for `instant = false` (segment entirely exempt)
  if (/(?<![A-Za-z0-9_])instant\s*=\s*false\b/.test(source)) {
    return false;
  }

  // Export is present and validation is not disabled
  return true;
}

/**
 * Returns true when the file still exports the legacy `unstable_instant`
 * config, which the installed Next.js version does not read.
 */
function hasLegacyInstantExport(source: string): boolean {
  return /export\s+(const|let|var)\s+unstable_instant\b/.test(source);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const root = process.cwd();
  const results: RouteResult[] = [];

  for (const route of IN_SCOPE_ROUTES) {
    const filePath = path.join(root, route);
    let source: string;

    try {
      source = await readFile(filePath, "utf8");
    } catch {
      // File doesn't exist on disk — still report it
      results.push({
        route,
        status: "fail",
        reason: "Page file not found on disk",
      });
      continue;
    }

    // Check 0: Legacy exports are never valid — Next.js 16.3 does not read them.
    if (hasLegacyInstantExport(source)) {
      results.push({
        route,
        status: "fail",
        reason:
          "Exports legacy `unstable_instant`, which Next.js 16.3 does not read. Migrate to `export const instant = true`.",
      });
      continue;
    }

    // Check 1: Is instant validation enabled on this page?
    if (hasValidationEnabled(source)) {
      results.push({ route, status: "pass-validation-enabled" });
      continue;
    }

    // Check 2: Is there a matching, valid escape-hatch registry entry?
    const registryEntry = escapeHatchRegistry.find(
      (entry) => entry.route === route && entry.active
    );

    if (!registryEntry) {
      results.push({
        route,
        status: "fail",
        reason:
          "Validation is not enabled and no active escape-hatch registry entry exists for this route",
      });
      continue;
    }

    // Validate the registry entry
    const validation = validateEscapeHatch(registryEntry);
    if (!validation.ok) {
      results.push({
        route,
        status: "fail",
        reason: `Escape-hatch entry is invalid: ${validation.errors.join("; ")}`,
      });
      continue;
    }

    // Valid escape hatch exists
    results.push({ route, status: "pass-escape-hatch" });
  }

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  const failed = results.filter((r) => r.status === "fail");

  console.log(
    `\n🔍 Instant Navigation Coverage Check\n${"─".repeat(50)}`
  );
  console.log(`Total in-scope routes: ${results.length}`);
  console.log(
    `  ✅ Validation enabled: ${results.filter((r) => r.status === "pass-validation-enabled").length}`
  );
  console.log(
    `  ✅ Valid escape hatch:  ${results.filter((r) => r.status === "pass-escape-hatch").length}`
  );
  console.log(`  ❌ Failed:             ${failed.length}`);
  console.log("");

  if (failed.length > 0) {
    console.error("Failed routes:\n");
    for (const f of failed) {
      console.error(`  ❌ ${f.route}`);
      console.error(`     ${f.reason}\n`);
    }
    process.exit(1);
  }

  console.log("All in-scope routes have coverage. ✅\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Unexpected error running coverage check:", err);
  process.exit(2);
});
