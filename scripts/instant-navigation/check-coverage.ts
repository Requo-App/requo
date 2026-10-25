#!/usr/bin/env tsx
/**
 * Migration-coverage check for the instant-navigation rollout.
 *
 * For every in-scope route, asserts that the page either:
 * 1. Has instant validation enabled (exports supported `instant` WITHOUT
 *    opting out via `instant = false` or an object-form disable flag), OR
 * 2. Has a matching, valid single-route escape-hatch registry entry
 *    (validated via `validateEscapeHatch`).
 *
 * Also fails on legacy `unstable_instant` exports, which the installed
 * Next.js does not read — they must be migrated to `instant`, and on any
 * registry-wide escape-hatch problem (duplicate, invalid, or overdue entry).
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
import { auditEscapeHatchRegistry } from "./escape-hatch-audit";
import {
  findLegacyInstantExport,
  inspectInstantExport,
} from "./instant-export";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteResult = {
  route: string;
  status: "pass-validation-enabled" | "pass-escape-hatch" | "fail";
  reason?: string;
};

// ---------------------------------------------------------------------------
// File analysis helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the file content opts into instant validation via the
 * supported Next.js `instant` export — meaning validation is enabled.
 *
 * Parsed with the TypeScript compiler so comments do not count and the
 * object-form opt-outs (`unstable_disableValidation` and friends) are honored.
 */
function hasValidationEnabled(source: string, route: string): boolean {
  return inspectInstantExport(source, route).state === "enabled";
}

/**
 * Returns true when the file still exports the legacy `unstable_instant`
 * config, which the installed Next.js version does not read.
 */
function hasLegacyInstantExport(source: string, route: string): boolean {
  return findLegacyInstantExport(source, route) !== null;
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

    // Check 0: Legacy exports are never valid — the installed Next.js does
    // not read them.
    if (hasLegacyInstantExport(source, route)) {
      results.push({
        route,
        status: "fail",
        reason:
          "Exports legacy `unstable_instant`, which the installed Next.js does not read. Migrate to `export const instant = true`.",
      });
      continue;
    }

    // Check 1: Is instant validation enabled on this page?
    if (hasValidationEnabled(source, route)) {
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
  const registryErrors = auditEscapeHatchRegistry(
    escapeHatchRegistry,
    new Date(),
  );

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
  }

  if (registryErrors.length > 0) {
    console.error("Escape-hatch registry errors:\n");
    for (const error of registryErrors) {
      console.error(`  ❌ ${error}`);
    }
    console.error("");
  }

  if (failed.length > 0 || registryErrors.length > 0) {
    process.exit(1);
  }

  console.log("All in-scope routes have coverage. ✅\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Unexpected error running coverage check:", err);
  process.exit(2);
});
