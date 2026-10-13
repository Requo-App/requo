#!/usr/bin/env tsx
/**
 * Audit: single shared border radius.
 *
 * Protects the invariant that every rectangular surface renders the same
 * corner radius: `--radius` (0.5rem / 8px). The `sm/md/lg/xl/2xl/3xl/4xl`
 * tokens all resolve to that one value in `app/globals.css`; `rounded-full`
 * stays round for pills, badges, and avatars, and `rounded-sm` stays
 * smaller for micro-internals (checkbox, tooltip arrow).
 *
 * Fails on:
 * - `rounded-3xl` / `rounded-4xl` anywhere (no surface is larger than the
 *   shared radius; use `rounded-lg` / `rounded-xl`, which render the same
 *   value);
 * - an arbitrary `rounded-[...]` outside design-system-owned code
 *   (`components/ui/` + the 1:1 shadcn recreations in `components/shared/`
 *   own their micro-geometry: switch thumbs, calendar cells, tooltip arrows).
 *
 * `rounded-2xl` is grandfathered: it renders the shared 8px via the
 * collapsed token, so existing call sites are visually consistent. New code
 * should still prefer `rounded-lg` / `rounded-xl`; rename on touch.
 *
 * Usage: npx tsx scripts/audit-radius.ts
 */

import {
  exitIfOffenders,
  isDesignSystemFile,
  readText,
  relPath,
  walk,
  ROOT,
  type Offender,
} from "./audit-lib";
import path from "node:path";

const SCAN_ROOTS = ["app", "components", "features"];

/** Design-system-owned micro-geometry; exempt from the arbitrary check. */
function isDesignSystem(rel: string): boolean {
  return isDesignSystemFile(rel);
}

function isTsxFile(absPath: string, rel: string): boolean {
  if (!/\.(tsx?|mts|cts)$/.test(absPath)) return false;
  const normalized = rel.replace(/\\/g, "/");
  return SCAN_ROOTS.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`),
  );
}

const LARGE_RADIUS = /(?:[a-z0-9-[\]]+:)?rounded-(3xl|4xl)\b/;
const ARBITRARY_RADIUS = /\brounded-\[[^\]]+\]/;

async function main(): Promise<void> {
  const files = await walk(path.join(ROOT, "."), (abs, rel) => {
    if (!isTsxFile(abs, rel)) return false;
    if (rel.replace(/\\/g, "/").startsWith("scripts/")) return false;
    if (rel.replace(/\\/g, "/").startsWith("tests/")) return false;
    return true;
  });

  const offenders: Offender[] = [];

  for (const abs of files) {
    const rel = relPath(abs);
    const source = await readText(abs);
    if (!source) continue;
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      const largeMatch = line.match(LARGE_RADIUS);
      if (largeMatch) {
        offenders.push({
          file: rel,
          line: lineNumber,
          message: `"${largeMatch[0]}" is larger than the single shared radius — use rounded-lg / rounded-xl (all render var(--radius)) instead`,
        });
      }

      if (!isDesignSystem(rel)) {
        const arbitraryMatch = line.match(ARBITRARY_RADIUS);
        if (arbitraryMatch) {
          offenders.push({
            file: rel,
            line: lineNumber,
            message: `arbitrary radius "${arbitraryMatch[0]}" — use the single shared radius (rounded-lg / rounded-xl) instead`,
          });
        }
      }
    });
  }

  offenders.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
  exitIfOffenders("audit-radius", offenders);
}

void main();
