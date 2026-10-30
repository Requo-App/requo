#!/usr/bin/env tsx
/**
 * Audit: feature boundaries
 *
 * Requo is one application, not a package-per-layer monorepo. These rules keep
 * the layer boundaries from `docs/architecture/TRD.md` mechanical without
 * splitting the repository:
 *
 * 1. Shared infrastructure (`lib/`) must not import product features at
 *    runtime. `lib/inngest/functions/` is the async composition root and may
 *    call feature jobs; other reviewed exceptions are listed in
 *    `INFRASTRUCTURE_ALLOWLIST`.
 * 2. Generic UI (`components/`, excluding the composition layers) must not
 *    import product features. `components/shell/`, `components/providers/`, and
 *    `components/marketing/` compose product surfaces and may. Existing
 *    exceptions are listed in `UI_ALLOWLIST`.
 * 3. Cross-feature imports must use a public entry point. A feature's public
 *    surface is its root-level modules (`features/<domain>/*.ts[x]`) and its
 *    `components/` tree. Nested implementation folders such as `lib/`, `jobs/`,
 *    `tools/`, `prompts/`, and `qualification/` are private.
 * 4. `app/` is the outer transport layer. `features/`, `lib/`, and
 *    `components/` must not import from `app/`.
 *
 * UI access to the database client, Drizzle, and the Supabase admin client is
 * a separate rule enforced by `audit-tenant-boundary.ts`.
 *
 * Imports are parsed with the TypeScript AST, so static imports, side-effect
 * imports, re-exports, dynamic `import()`, `require()`, and relative paths are
 * all checked. Type-only imports are erased at runtime and are ignored.
 * Computed `import(expression)` and `require(expression)` specifiers cannot be
 * resolved statically, so they fail the audit instead of silently bypassing it.
 *
 * Exits 0 on no violations, 1 on violations.
 *
 * Usage: npx tsx scripts/audit-feature-boundaries.ts
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

import {
  collectRuntimeImportHits,
  collectUnresolvedDynamicImports,
} from "./audit-imports";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "features", "lib"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
]);

/**
 * A reviewed module exception. `imports` lists the feature modules the file may
 * import at runtime (a module path also permits its subtree); any other feature
 * import in that file still fails the audit.
 */
export type FeatureImportException = {
  readonly imports: readonly string[];
  readonly reason: string;
};

/**
 * Existing runtime imports from shared infrastructure into product features.
 * Keys are repo-relative paths; values explain why the exception exists. Prefer
 * moving the shared helper into `lib/` over adding an entry.
 */
export const INFRASTRUCTURE_ALLOWLIST: Readonly<
  Record<string, FeatureImportException>
> = {
  "lib/ai/chat-attachments.ts": {
    imports: ["features/knowledge/extraction"],
    reason:
      "Chat attachments reuse the knowledge feature's text extraction; extraction is not part of the shared lib surface.",
  },
  "lib/app-shell/context.ts": {
    imports: ["features/businesses/routes"],
    reason:
      "The shell redirects to the business hub and needs the canonical feature route helper.",
  },
  "lib/auth/business-bootstrap.ts": {
    imports: ["features/account/name"],
    reason:
      "Profile bootstrap splits the user's full name with the account feature helper.",
  },
  "lib/auth/config.ts": {
    imports: [
      "features/account/name",
      "features/account/queries",
      "features/account/mutations",
      "features/audit/mutations",
    ],
    reason:
      "Better Auth derives the display first name and, on account deletion, runs the account preflight/cleanup and writes account audit logs.",
  },
  "lib/db/business-access.ts": {
    imports: [
      "features/businesses/lifecycle",
      "features/businesses/routes",
      "features/settings/email-templates",
    ],
    reason:
      "Business access resolves lifecycle state, the active-business cookie name, and the email-template normalizers used by messaging settings.",
  },
  "lib/db/schema/business-packs.ts": {
    imports: ["features/businesses/behavior-packs"],
    reason:
      "The schema stores behavior-pack keys whose runtime constants currently live in the business feature.",
  },
};

/**
 * Existing imports from generic UI into product features. Keys are
 * repo-relative paths; values explain why the exception exists. Prefer passing
 * data in as props or moving the shared value into `lib/` over adding an entry.
 */
export const UI_ALLOWLIST: Readonly<
  Record<string, FeatureImportException>
> = {
  "components/shared/country-combobox.tsx": {
    imports: ["features/businesses/locale"],
    reason:
      "The combobox reuses the business feature's country/locale option list.",
  },
};

/** Async orchestration lives with Inngest and intentionally calls features. */
const COMPOSITION_ROOT = "lib/inngest/functions/";

/** Cross-feature UI composition is public; other nested folders are private. */
const PUBLIC_FEATURE_SUBDIRECTORIES = new Set(["components"]);

/** Component folders that compose product surfaces instead of staying generic. */
const FEATURE_COMPOSITION_COMPONENT_DIRS = [
  "components/marketing/",
  "components/providers/",
  "components/shell/",
] as const;

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

/**
 * Resolve `@/` and relative specifiers to a normalized repo-relative path.
 * Package imports return null.
 */
export function resolveRepoSpecifier(
  fromRelPath: string,
  specifier: string,
): string | null {
  if (specifier.startsWith("@/")) {
    return path.posix.normalize(specifier.slice(2));
  }

  if (specifier.startsWith(".")) {
    return path.posix.normalize(
      path.posix.join(path.posix.dirname(fromRelPath), specifier),
    );
  }

  return null;
}

function featureNameOf(relPath: string): string | null {
  const [topLevel, feature] = relPath.split("/");
  return topLevel === "features" && feature ? feature : null;
}

function isFeaturePath(relPath: string): boolean {
  return relPath === "features" || relPath.startsWith("features/");
}

function isAppPath(relPath: string): boolean {
  return relPath === "app" || relPath.startsWith("app/");
}

function isGenericUi(relPath: string): boolean {
  return (
    relPath.startsWith("components/") &&
    !FEATURE_COMPOSITION_COMPONENT_DIRS.some((dir) => relPath.startsWith(dir))
  );
}

function isAllowedFeatureImport(
  relPath: string,
  target: string,
  allowlist: Readonly<Record<string, FeatureImportException>>,
): boolean {
  const exception = allowlist[relPath];
  return (
    exception?.imports.some(
      (allowed) => target === allowed || target.startsWith(`${allowed}/`),
    ) ?? false
  );
}

function isPrivateFeatureModule(
  targetFeature: string,
  targetRelPath: string,
  featureDirectories: ReadonlySet<string>,
): boolean {
  const rest = targetRelPath.split("/").slice(2);
  if (rest.length === 0) return false;
  if (PUBLIC_FEATURE_SUBDIRECTORIES.has(rest[0])) return false;
  if (rest.length > 1) return true;

  // A single segment is either a public root-level module or a directory
  // import. The filesystem check (populated by `main`) closes the directory
  // case; unit tests can supply synthetic directories.
  return featureDirectories.has(`features/${targetFeature}/${rest[0]}`);
}

export function auditSource(
  relPath: string,
  source: string,
  featureDirectories: ReadonlySet<string> = new Set(),
): Offender[] {
  const sourceFile = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(relPath),
  );

  const sourceFeature = featureNameOf(relPath);
  const sourceIsApp = isAppPath(relPath);
  const sourceIsLib = relPath.startsWith("lib/");
  const sourceIsGenericUi = isGenericUi(relPath);
  const offenders: Offender[] = [];

  for (const hit of collectUnresolvedDynamicImports(sourceFile)) {
    offenders.push({
      file: relPath,
      line: hit.line,
      reason: `uses a computed ${hit.kind === "import" ? "import()" : "require()"} specifier; use a string literal so the boundary audit can resolve it`,
    });
  }

  for (const hit of collectRuntimeImportHits(sourceFile)) {
    const target = resolveRepoSpecifier(relPath, hit.specifier);
    if (!target || !isFeaturePath(target)) {
      if (target && isAppPath(target) && !sourceIsApp) {
        offenders.push({
          file: relPath,
          line: hit.line,
          reason: `imports ${target} from app/; the transport layer may depend on features, lib, and components, never the reverse`,
        });
      }
      continue;
    }

    if (
      sourceIsLib &&
      !relPath.startsWith(COMPOSITION_ROOT) &&
      !isAllowedFeatureImport(relPath, target, INFRASTRUCTURE_ALLOWLIST)
    ) {
      offenders.push({
        file: relPath,
        line: hit.line,
        reason: `shared infrastructure imports ${target}; move shared logic into lib/ or list ${target} in the file's reviewed INFRASTRUCTURE_ALLOWLIST exception`,
      });
      continue;
    }

    if (
      sourceIsGenericUi &&
      !isAllowedFeatureImport(relPath, target, UI_ALLOWLIST)
    ) {
      offenders.push({
        file: relPath,
        line: hit.line,
        reason: `generic UI imports ${target}; pass data as props, compose from a composition layer, or list ${target} in the file's reviewed UI_ALLOWLIST exception`,
      });
      continue;
    }

    const targetFeature = featureNameOf(target);
    if (
      sourceFeature &&
      targetFeature &&
      sourceFeature !== targetFeature &&
      isPrivateFeatureModule(targetFeature, target, featureDirectories)
    ) {
      const rest = target.split("/").slice(2);
      offenders.push({
        file: relPath,
        line: hit.line,
        reason: `features/${sourceFeature} imports private module ${target}; cross-feature imports must use features/${targetFeature}/*.ts or features/${targetFeature}/components/** (not ${rest[0]}/)`,
      });
    }
  }

  return offenders;
}

export function collectViolations(
  files: SourceFile[],
  featureDirectories: ReadonlySet<string> = new Set(),
): Offender[] {
  return files.flatMap((file) =>
    auditSource(file.relPath, file.source, featureDirectories),
  );
}

function collectFeatureDirectories(): Set<string> {
  const directories = new Set<string>();
  const featuresRoot = path.join(ROOT, "features");
  if (!fs.existsSync(featuresRoot)) return directories;

  for (const feature of fs.readdirSync(featuresRoot, { withFileTypes: true })) {
    if (!feature.isDirectory()) continue;
    const featureRoot = path.join(featuresRoot, feature.name);
    for (const entry of fs.readdirSync(featureRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        directories.add(toRepoPath(path.join(featureRoot, entry.name)));
      }
    }
  }
  return directories;
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
    collectFeatureDirectories(),
  );

  if (offenders.length === 0) {
    console.log("audit-feature-boundaries: OK (no violations)");
    return 0;
  }

  console.error(`audit-feature-boundaries: ${offenders.length} violation(s)`);
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
