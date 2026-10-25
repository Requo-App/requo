#!/usr/bin/env tsx
/**
 * Audit: instant-navigation progressive data loading.
 *
 * For every in-scope dashboard route (see `IN_SCOPE_ROUTES` in
 * `lib/instant-navigation/escape-hatches.ts`) plus every page under `app/`:
 *
 * 1. No legacy `unstable_instant` exports — the installed Next.js 16.4
 *    does not read them. They must be migrated to the supported `instant`
 *    export.
 * 2. Every in-scope route exports the supported `instant` config, unless it
 *    carries a valid tracked escape-hatch registry entry.
 * 3. No blocking page-level awaits — the default export of an in-scope
 *    `page.tsx` must be synchronous. Dynamic reads (`params`,
 *    `searchParams`, session, business context, queries) belong in
 *    `<Suspense>`-wrapped async child server components.
 * 4. Loading coverage — an in-scope dynamic route must have either a sibling
 *    `loading.tsx` (initial page load) or an in-file `<Suspense>` fallback
 *    (client navigation).
 *
 * Governance checks:
 * - Every page that declares `instant` must be listed in `IN_SCOPE_ROUTES`,
 *   so the per-route rules cannot silently skip a route.
 * - Every escape-hatch entry is validated (not only the entry selected for a
 *   route), duplicates are rejected, and overdue active entries fail.
 *
 * Redirect-only legacy routes, print routes, and public preview document
 * routes are intentionally out of scope and are not scanned by rules 2–4.
 *
 * Exits 0 on no violations, 1 on violations.
 *
 * Usage: npx tsx scripts/audit-instant-navigation.ts
 */

import { access } from "node:fs/promises";
import path from "node:path";

import { escapeHatchRegistry } from "../lib/instant-navigation/escape-hatch-registry";
import {
  IN_SCOPE_ROUTES,
  validateEscapeHatch,
} from "../lib/instant-navigation/escape-hatches";
import {
  exitIfOffenders,
  lineOf,
  readText,
  relPath,
  ROOT,
  walk,
  type Offender,
} from "./audit-lib";
import { auditEscapeHatchRegistry } from "./instant-navigation/escape-hatch-audit";
import {
  findLegacyInstantExport,
  inspectInstantExport,
} from "./instant-navigation/instant-export";
import {
  findInstantScopeDrift,
} from "./instant-navigation/instant-scope";

const APP_DIR = path.join(ROOT, "app");
const REGISTRY_FILE = "lib/instant-navigation/escape-hatch-registry.ts";

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function hasBlockingPageExport(source: string): number {
  const idx = source.search(/export\s+default\s+async\s+(function|const|class)/);
  return idx;
}

function hasSuspenseFallback(source: string): boolean {
  return /<Suspense\b[^>]*fallback=/.test(source);
}

function hasValidEscapeHatch(route: string): boolean {
  const entry = escapeHatchRegistry.find(
    (candidate) => candidate.route === route && candidate.active,
  );
  if (!entry) return false;
  return validateEscapeHatch(entry).ok;
}

async function main(): Promise<void> {
  const offenders: Offender[] = [];

  // Rule 1: no legacy exports anywhere under app/.
  const appFiles = await walk(
    APP_DIR,
    (_abs, rel) => rel.endsWith(".tsx") || rel.endsWith(".ts"),
  );
  for (const file of appFiles) {
    const source = await readText(file);
    const legacy = findLegacyInstantExport(source, relPath(file));
    if (legacy) {
      offenders.push({
        file: relPath(file),
        line: legacy.line,
        message:
          "legacy `unstable_instant` export is not read by Next.js 16.4 — migrate to `export const instant = true`",
      });
    }
  }

  // Rule 2 (scope completeness): every page that declares `instant` must be
  // in the rollout scope, or the per-route rules below never see it.
  const pageFiles = await walk(APP_DIR, (_abs, rel) =>
    rel.endsWith("page.tsx"),
  );
  for (const file of pageFiles) {
    const source = await readText(file);
    const inspection = inspectInstantExport(source, relPath(file));

    if (inspection.state === "missing") continue;

    const drift = findInstantScopeDrift([
      { route: relPath(file), inspection },
    ]);
    for (const message of drift) {
      offenders.push({
        file: relPath(file),
        line: inspection.line,
        message,
      });
    }
  }

  // Rules 3–4: per in-scope route.
  for (const route of IN_SCOPE_ROUTES) {
    const abs = path.join(ROOT, route);
    const source = await readText(abs);
    if (!source) {
      offenders.push({
        file: route,
        line: 1,
        message: "in-scope page file not found on disk",
      });
      continue;
    }

    if (hasValidEscapeHatch(route)) {
      continue;
    }

    const inspection = inspectInstantExport(source, route);
    if (inspection.state !== "enabled") {
      const idx = source.search(/export\s+default\b/);
      const line =
        inspection.state === "disabled"
          ? inspection.line
          : idx === -1
            ? 1
            : lineOf(source, idx);
      offenders.push({
        file: route,
        line,
        message:
          inspection.state === "disabled"
            ? `in-scope route disables instant validation via \`${inspection.disabledBy}\` and has no valid escape-hatch entry`
            : "in-scope route is missing the supported `instant` export and has no valid escape-hatch entry",
      });
    }

    const blockingIdx = hasBlockingPageExport(source);
    if (blockingIdx !== -1) {
      offenders.push({
        file: route,
        line: lineOf(source, blockingIdx),
        message:
          "blocking page-level async default export — return the shell synchronously and move dynamic reads into <Suspense>-wrapped children",
      });
    }

    const siblingLoading = path.join(path.dirname(abs), "loading.tsx");
    const hasLoadingFile = await fileExists(siblingLoading);
    if (!hasLoadingFile && !hasSuspenseFallback(source)) {
      offenders.push({
        file: route,
        line: 1,
        message:
          "dynamic route has neither a sibling loading.tsx nor an in-file <Suspense> fallback",
      });
    }
  }

  // Governance: validate the whole escape-hatch registry, not just the first
  // active entry selected for a route.
  for (const message of auditEscapeHatchRegistry(
    escapeHatchRegistry,
    new Date(),
  )) {
    offenders.push({ file: REGISTRY_FILE, line: 1, message });
  }

  exitIfOffenders("audit-instant-navigation", offenders);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
