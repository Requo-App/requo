/**
 * Shared helpers for the SEO/performance audit scripts.
 *
 * All audits share:
 * - async directory walking with a filter predicate,
 * - small text-reading + formatting helpers,
 * - a consistent `path:line — message` offender format,
 * - a single `exitIfOffenders` exit policy.
 *
 * No dependencies beyond Node built-ins. The audit scripts run under `tsx`.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const ROOT = process.cwd();

export type Offender = {
  readonly file: string;
  readonly line: number;
  readonly message: string;
};

export type WalkPredicate = (absPath: string, relPath: string) => boolean;

/**
 * Recursively walk `dir`, returning absolute paths of files that satisfy
 * `predicate`. Skips common build/dev folders for speed.
 */
export async function walk(
  dir: string,
  predicate: WalkPredicate,
): Promise<string[]> {
  const results: string[] = [];
  await walkInto(dir, predicate, results);
  return results;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  ".turbo",
]);

async function walkInto(
  dir: string,
  predicate: WalkPredicate,
  acc: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkInto(abs, predicate, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = path.relative(ROOT, abs);
    if (predicate(abs, rel)) acc.push(abs);
  }
}

/** Read a file as UTF-8 text. Returns `""` on failure. */
export async function readText(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Convert a byte offset into a 1-based line number inside `source`.
 */
export function lineOf(source: string, index: number): number {
  if (index <= 0) return 1;
  const slice = source.slice(0, index);
  let line = 1;
  for (let i = 0; i < slice.length; i += 1) {
    if (slice.charCodeAt(i) === 10 /* \n */) line += 1;
  }
  return line;
}

/** Convert an absolute path to a repo-relative path with forward slashes. */
export function relPath(abs: string): string {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

export function printOffenders(
  auditName: string,
  offenders: readonly Offender[],
): void {
  if (offenders.length === 0) {
    console.log(`${auditName}: OK (0 violations)`);
    return;
  }
  console.error(`${auditName}: ${offenders.length} violation(s)`);
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line} \u2014 ${o.message}`);
  }
}

/**
 * Exit the process: code 0 on no offenders, code 1 on any offender.
 * Call this at the end of each audit's `main()`.
 */
export function exitIfOffenders(
  auditName: string,
  offenders: readonly Offender[],
): void {
  printOffenders(auditName, offenders);
  if (offenders.length > 0) process.exit(1);
}

/**
 * Design-system-owned files exempt from micro-geometry audits: the shadcn
 * primitives plus the 1:1 shadcn recreations of the former BoardUI system
 * (same geometry, now under components/shared/).
 */
const DESIGN_SYSTEM_SHARED_FILES = new Set([
  "agent-thinking.tsx",
  "avatar.tsx",
  "badge.tsx",
  "breadcrumb.tsx",
  "button.tsx",
  "checkbox-glyph.tsx",
  "checkbox.tsx",
  "chevrons.tsx",
  "chip.tsx",
  "close-button.tsx",
  "dashboard-sidebar.tsx",
  "dashboard-team-menu.tsx",
  "dashboard-user-menu.tsx",
  "date-picker-shared.tsx",
  "date-picker.tsx",
  "dropdown-menu-styles.ts",
  "dropdown.tsx",
  "file-upload.tsx",
  "hint-text.tsx",
  "icon-button.tsx",
  "input.tsx",
  "label.tsx",
  "notification-toaster.tsx",
  "notification.tsx",
  "notify.ts",
  "pagination.tsx",
  "pill-tab.tsx",
  "plan-art-flame.tsx",
  "select.tsx",
  "settings-general.tsx",
  "settings-modal.tsx",
  "settings-profile.tsx",
  "settings-rows.tsx",
  "settings-storage.tsx",
  "settings-tools.tsx",
  "stat-cards.tsx",
  "switch.tsx",
  "tabs.tsx",
  "tooltip.tsx",
]);

export function isDesignSystemFile(rel: string): boolean {
  const normalized = rel.replace(/\\/g, "/");
  if (normalized.startsWith("components/ui/")) return true;
  if (!normalized.startsWith("components/shared/")) return false;
  const base = normalized.slice("components/shared/".length);
  return !base.includes("/") && DESIGN_SYSTEM_SHARED_FILES.has(base);
}
