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
 * - Server action modules (`"use server"` at the top of the file, or the
 *   `actions.ts` naming convention) must not talk to the database directly
 *   unless they are listed in `ACTION_ALLOWLIST`. The allowlist is a ratchet:
 *   existing exceptions are grandfathered, new ones need an explicit,
 *   reviewable entry and a reason.
 *
 * Imports are parsed with the TypeScript AST so static imports, side-effect
 * imports, re-exports, dynamic `import()`, and `require()` are all checked.
 * Relative specifiers are resolved against the importing file, so a relative
 * path to the DB client cannot bypass the alias check. Type-only imports are
 * ignored because they are erased at runtime.
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
import { pathToFileURL } from "node:url";

import ts from "typescript";

import { collectRuntimeImportHits } from "./audit-imports";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "features"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

/**
 * Existing server action modules that still import database primitives
 * directly. Keys are repo-relative paths; values are the reason the exception
 * exists. Prefer moving the query into the feature's query/mutation module
 * instead of adding an entry.
 */
export const ACTION_ALLOWLIST: Readonly<Record<string, string>> = {
  "features/admin/confirm-actions.ts":
    "Password re-confirmation actions consume confirm tokens directly; split into a server-only module when the action is refactored.",
  "features/admin/mutations.ts":
    "Single entry point for admin mutations, which run audit-log transactions across users and businesses.",
  "features/agent/actions.ts":
    "Public Agent session bootstrap reads agent sessions before a business context exists.",
  "features/business-members/actions.ts":
    "Membership and invite actions combine auth, cache invalidation, and DB work; move writes to mutations.ts when touched.",
  "features/inquiries/qualification/actions.ts":
    "Inquiry qualification toggles read and write duplicate state directly; move to inquiries/mutations.ts when touched.",
  "features/knowledge/actions.ts":
    "Knowledge upload and entry actions own presigned storage plus DB setup; move writes to knowledge/mutations.ts when touched.",
  "features/notifications/actions.ts":
    "Notification read-state actions filter by the current user and business before marking rows read.",
  "features/onboarding/actions.ts":
    "Onboarding completes business and profile setup in one action; move writes to onboarding/mutations.ts when touched.",
  "features/onboarding/tour-actions.ts":
    "Tour completion writes the user's checklist state from the onboarding action.",
  "features/theme/actions.ts":
    "Theme preference actions write a single profile field after auth; move to mutations.ts when touched.",
  "features/theme/ui-scale-actions.ts":
    "UI-scale preference actions write a single profile field after auth; move to mutations.ts when touched.",
};

const RESTRICTED_MODULES = [
  { name: "@/lib/db/client", target: path.join(ROOT, "lib/db/client") },
  { name: "@/lib/supabase/admin", target: path.join(ROOT, "lib/supabase/admin") },
] as const;

const DRIZZLE_MODULE = "drizzle-orm";

export type Offender = {
  file: string;
  line: number;
  reason: string;
};

export type SourceFile = {
  relPath: string;
  source: string;
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

function scriptKindFor(relPath: string): ts.ScriptKind {
  return /\.tsx$/.test(relPath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function hasDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  const [first] = sourceFile.statements;
  return Boolean(
    first &&
      ts.isExpressionStatement(first) &&
      ts.isStringLiteral(first.expression) &&
      first.expression.text === directive,
  );
}

function resolveLocalSpecifier(
  fromRelPath: string,
  specifier: string,
): string | null {
  if (specifier.startsWith("@/")) {
    return path.normalize(path.join(ROOT, specifier.slice(2)));
  }

  if (specifier.startsWith(".")) {
    return path.normalize(
      path.resolve(ROOT, path.dirname(fromRelPath), specifier),
    );
  }

  return null;
}

function restrictedImportName(
  fromRelPath: string,
  specifier: string,
): string | null {
  if (specifier === DRIZZLE_MODULE || specifier.startsWith(`${DRIZZLE_MODULE}/`)) {
    return DRIZZLE_MODULE;
  }

  const resolved = resolveLocalSpecifier(fromRelPath, specifier);
  if (!resolved) return null;

  for (const restricted of RESTRICTED_MODULES) {
    const candidates = new Set([
      restricted.target,
      `${restricted.target}.ts`,
      `${restricted.target}.tsx`,
      path.join(restricted.target, "index.ts"),
      path.join(restricted.target, "index.tsx"),
    ]);

    if (candidates.has(resolved)) {
      return restricted.name;
    }
  }

  return null;
}

export function isUiBoundary(
  relPath: string,
  sourceFile: ts.SourceFile,
): boolean {
  if (relPath.startsWith("components/")) return true;
  if (relPath.startsWith("features/") && relPath.includes("/components/")) {
    return true;
  }

  // Client components are shipped to the browser; schema/client imports
  // there are always a boundary mistake.
  if (hasDirective(sourceFile, "use client")) return true;

  if (!relPath.startsWith("app/")) return false;
  if (relPath.startsWith("app/api/")) return false;
  if (/(^|\/)route\.tsx?$/.test(relPath)) return false;

  return true;
}

export function isActionModule(
  relPath: string,
  sourceFile: ts.SourceFile,
): boolean {
  return (
    /(?:^|\/)(?:[\w-]*-)?actions\.tsx?$/.test(relPath) ||
    hasDirective(sourceFile, "use server")
  );
}

export function auditSource(relPath: string, source: string): Offender[] {
  const sourceFile = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(relPath),
  );
  const uiBoundary = isUiBoundary(relPath, sourceFile);
  const actionModule = isActionModule(relPath, sourceFile);
  const allowlistedAction = actionModule && relPath in ACTION_ALLOWLIST;

  if (!uiBoundary && (!actionModule || allowlistedAction)) {
    return [];
  }

  const offenders: Offender[] = [];

  for (const hit of collectRuntimeImportHits(sourceFile)) {
    const restrictedName = restrictedImportName(relPath, hit.specifier);
    if (!restrictedName) continue;

    offenders.push({
      file: relPath,
      line: hit.line,
      reason: uiBoundary
        ? `${restrictedName} imported at the UI boundary; call a feature query/mutation instead`
        : `${restrictedName} imported directly from a server action; move the query into features/<domain>`,
    });
  }

  return offenders;
}

export function collectViolations(files: SourceFile[]): Offender[] {
  return files.flatMap((file) => auditSource(file.relPath, file.source));
}

function main(): number {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    walk(path.join(ROOT, dir), files);
  }

  const offenders = collectViolations(
    files.map((file) => ({
      relPath: toRepoPath(file),
      source: fs.readFileSync(file, "utf8"),
    })),
  );

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

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exit(main());
}
