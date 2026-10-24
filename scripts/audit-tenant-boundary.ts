#!/usr/bin/env tsx
/**
 * Audit: tenant boundary
 *
 * The app talks to Postgres with the table-owner role through Drizzle, which
 * means the database's row-level security does not protect application
 * queries. Tenant isolation therefore depends on every query and mutation
 * carrying an explicit `businessId` predicate.
 *
 * This audit protects the outer boundary of that convention:
 *
 * - UI code (components, feature components, app pages/layouts) must not
 *   import the database client, Drizzle operators, or the Supabase admin
 *   client. Reads and writes belong in `features/<domain>/queries.ts` and
 *   `features/<domain>/mutations.ts`, where they can be reviewed and tested
 *   for tenant scoping.
 * - Server actions must not talk to the database directly unless they are
 *   listed in `ACTION_ALLOWLIST`. The allowlist is a ratchet: existing
 *   exceptions are grandfathered, new ones need an explicit, reviewable
 *   entry and a reason.
 *
 * Route handlers under `app/api/` are intentionally outside this audit. They
 * are server endpoints with their own authentication boundary; the follow-up
 * work is to move them onto the same feature query modules.
 *
 * Exits 0 on no violations, 1 on violations.
 *
 * Usage: npx tsx scripts/audit-tenant-boundary.ts
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "features"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

/**
 * Existing server actions that still import database primitives directly.
 * Add a file only with a reason; prefer moving the query into the feature's
 * query/mutation module instead.
 */
const ACTION_ALLOWLIST = new Set([
  "features/admin/confirm-actions.ts",
  "features/agent/actions.ts",
  "features/business-members/actions.ts",
  "features/inquiries/qualification/actions.ts",
  "features/knowledge/actions.ts",
  "features/notifications/actions.ts",
  "features/onboarding/actions.ts",
  "features/onboarding/tour-actions.ts",
  "features/theme/actions.ts",
  "features/theme/ui-scale-actions.ts",
]);

const RESTRICTED_IMPORTS = [
  {
    name: "@/lib/db/client",
    pattern: /from\s+["']@\/lib\/db\/client["']/,
  },
  {
    name: "drizzle-orm",
    pattern: /from\s+["']drizzle-orm(?:\/[^"']*)?["']/,
  },
  {
    name: "@/lib/supabase/admin",
    pattern: /from\s+["']@\/lib\/supabase\/admin["']/,
  },
] as const;

type Offender = {
  file: string;
  line: number;
  reason: string;
};

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
    } else if (entry.isFile() && /\.(tsx?|mts|cts)$/.test(entry.name)) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

function toRepoPath(absolutePath: string): string {
  return path.relative(ROOT, absolutePath).split(path.sep).join("/");
}

function isUiBoundary(relPath: string, source: string): boolean {
  if (relPath.startsWith("components/")) return true;
  if (relPath.startsWith("features/") && relPath.includes("/components/")) {
    return true;
  }

  // Client components are shipped to the browser; schema/client imports
  // there are always a boundary mistake.
  if (/^\s*["']use client["'];?/m.test(source)) return true;

  if (!relPath.startsWith("app/")) return false;
  if (relPath.startsWith("app/api/")) return false;
  if (/(^|\/)route\.tsx?$/.test(relPath)) return false;

  return true;
}

function isActionFile(relPath: string): boolean {
  return /(?:^|\/)(?:[\w-]*-)?actions\.tsx?$/.test(relPath);
}

function findLine(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

function main(): number {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    walk(path.join(ROOT, dir), files);
  }

  const offenders: Offender[] = [];

  for (const file of files) {
    const relPath = toRepoPath(file);
    const source = fs.readFileSync(file, "utf8");
    const uiBoundary = isUiBoundary(relPath, source);
    const actionFile = isActionFile(relPath);
    const allowlistedAction = actionFile && ACTION_ALLOWLIST.has(relPath);

    if (!uiBoundary && (!actionFile || allowlistedAction)) continue;

    for (const restricted of RESTRICTED_IMPORTS) {
      const match = restricted.pattern.exec(source);
      if (!match) continue;

      offenders.push({
        file: relPath,
        line: findLine(source, match.index),
        reason: uiBoundary
          ? `${restricted.name} imported at the UI boundary; call a feature query/mutation instead`
          : `${restricted.name} imported directly from a server action; move the query into features/<domain>`,
      });
    }
  }

  if (offenders.length === 0) {
    console.log("audit-tenant-boundary: OK (no violations)");
    return 0;
  }

  console.error(`audit-tenant-boundary: ${offenders.length} violation(s)`);
  for (const offender of offenders) {
    console.error(`  ${offender.file}:${offender.line}  ${offender.reason}`);
  }
  return 1;
}

process.exit(main());
