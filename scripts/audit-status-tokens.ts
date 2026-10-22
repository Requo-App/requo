#!/usr/bin/env tsx
/**
 * Audit: status colour comes from the shared tone vocabulary.
 *
 * `components/shared/status-badge.tsx` owns the one tone -> class map for the
 * product. Feature code picks a `StatusTone`; it never writes colour itself.
 * This audit protects that boundary, which had eroded into eight per-domain
 * class maps and 222 `!important` tokens before the migration.
 *
 * Rules
 *
 * 1. No `!important`-flagged utility under `app/` or `features/`.
 *    Custom surface classes (`control-surface-secondary`, `meta-label`) and
 *    Tailwind utilities both land in `@layer utilities`, so source order — not
 *    class order — decides the winner, and `tailwind-merge` cannot arbitrate a
 *    class it does not know. `!` papers over that; the fix is a variant or tone
 *    that carries no conflicting colour.
 *
 * 2. No `*StatusClassNames` / `*StateClassNames` identifier under `app/` or
 *    `features/`. A status map must be `Record<Enum, StatusTone>` — exhaustive,
 *    so a new enum member fails the typecheck — rather than a map of class
 *    strings.
 *
 * 3. A status-badge module must not hand-roll a palette pill. Any file whose
 *    basename ends in `status-badge.tsx` / `status-badges.tsx` must compose
 *    `StatusBadge`; a literal carrying `border-<palette>-<n>` +
 *    `bg-<palette>-<n>` + `text-<palette>-<n>` is the signature of a
 *    re-implemented pill.
 *
 * Scope notes
 *
 * - Rule 3 is deliberately limited to status-badge modules. Raw palette colours
 *   also appear in marketing chrome (`components/marketing/*`), the archived
 *   record banner, and the upgrade accent; those are surfaces and brand
 *   accents, not status pills, and are tracked in `docs/technical-debt.md`.
 * - `components/` is out of scope for rules 1 and 2: it is design-system and
 *   marketing territory, where the canonical classes are defined in the first
 *   place.
 *
 * Usage: npx tsx scripts/audit-status-tokens.ts
 */

import path from "node:path";

import {
  exitIfOffenders,
  readText,
  relPath,
  walk,
  ROOT,
  type Offender,
} from "./audit-lib";

const SCAN_ROOTS = ["app", "features"];

/** The one file allowed to name colours for a status. */
const CANONICAL_MODULE = "components/shared/status-badge.tsx";

function normalize(rel: string): string {
  return rel.replace(/\\/g, "/");
}

function isScanned(rel: string): boolean {
  const normalized = normalize(rel);
  if (normalized.startsWith("tests/") || normalized.startsWith("scripts/")) {
    return false;
  }
  return SCAN_ROOTS.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`),
  );
}

function isStatusBadgeModule(rel: string): boolean {
  return /status-badges?\.tsx$/.test(normalize(rel));
}

/** Quoted string literals on a line — class strings live in these. */
const STRING_LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g;

function stringLiterals(line: string): string[] {
  const literals: string[] = [];
  for (const match of line.matchAll(STRING_LITERAL)) {
    literals.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return literals;
}

/** Utility-shaped characters only: excludes prose that merely ends in `!`. */
const UTILITY_CHARSET = /^[a-z0-9:[\]&>+*._%/-]+$/;

/**
 * Find an important-flagged class token inside a literal.
 *
 * The `!` must lead or trail the token, the token must be hyphenated, and the
 * rest must be utility-shaped — so `"Auto-fill!"` in copy is not mistaken for
 * `"!bg-emerald-500/15"`.
 */
function findImportantUtility(literal: string): string | null {
  for (const token of literal.split(/\s+/)) {
    if (!token.includes("!")) continue;
    if (!token.startsWith("!") && !token.endsWith("!")) continue;
    const stripped = token.replace(/^!/, "").replace(/!$/, "");
    if (!stripped.includes("-")) continue;
    if (!UTILITY_CHARSET.test(stripped)) continue;
    return token;
  }
  return null;
}

const STATUS_CLASS_MAP = /\b\w*(?:Status|State)ClassNames?\b/;

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const RAW_BORDER = new RegExp(`\\bborder-(?:${PALETTE})-\\d{2,3}\\b`);
const RAW_BG = new RegExp(`\\bbg-(?:${PALETTE})-\\d{2,3}\\b`);
const RAW_TEXT = new RegExp(`\\btext-(?:${PALETTE})-\\d{2,3}\\b`);

/** A pill that sets border, background, and text from the raw palette. */
function isRawPalettePill(literal: string): boolean {
  return (
    RAW_BORDER.test(literal) && RAW_BG.test(literal) && RAW_TEXT.test(literal)
  );
}

async function main(): Promise<void> {
  const files = await walk(path.join(ROOT, "."), (abs, rel) => {
    if (!/\.(tsx?|mts|cts)$/.test(abs)) return false;
    return isScanned(rel);
  });

  const offenders: Offender[] = [];

  for (const abs of files) {
    const rel = normalize(relPath(abs));
    if (rel === CANONICAL_MODULE) continue;

    const source = await readText(abs);
    if (!source) continue;

    const statusBadgeModule = isStatusBadgeModule(rel);

    source.split(/\r?\n/).forEach((line, index) => {
      const lineNumber = index + 1;
      const literals = stringLiterals(line);

      // Rule 1 — no `!important` overrides.
      for (const literal of literals) {
        const token = findImportantUtility(literal);
        if (!token) continue;
        offenders.push({
          file: rel,
          line: lineNumber,
          message: `important-flagged utility "${token}" — custom classes and utilities share @layer utilities, so source order wins and tailwind-merge cannot arbitrate; use a variant or tone that carries no conflicting colour`,
        });
        break;
      }

      // Rule 2 — status maps are tone maps, not class maps.
      const mapMatch = line.match(STATUS_CLASS_MAP);
      if (mapMatch) {
        offenders.push({
          file: rel,
          line: lineNumber,
          message: `"${mapMatch[0]}" — status colour belongs in a Record<Enum, StatusTone> consumed by StatusBadge, not in a class-name map`,
        });
      }

      // Rule 3 — a status-badge module composes StatusBadge.
      if (statusBadgeModule) {
        for (const literal of literals) {
          if (!isRawPalettePill(literal)) continue;
          offenders.push({
            file: rel,
            line: lineNumber,
            message:
              "hand-rolled palette status pill — use a StatusTone from components/shared/status-badge",
          });
          break;
        }
      }
    });
  }

  offenders.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
  exitIfOffenders("audit-status-tokens", offenders);
}

void main();
