#!/usr/bin/env tsx
/**
 * Audit: dashboard density and scale
 *
 * Protects the invariant that produced the density bug: size leaked out of
 * shared primitives into individual surfaces. Primitives own control heights,
 * radii, and text sizes; the shared panel utilities own their padding; the
 * sidebar primitive owns the rail width. Authenticated surfaces inherit these
 * and must not re-declare them.
 *
 * Scope is authenticated product surfaces only: the business dashboard,
 * business settings, and the admin console. Marketing, authentication,
 * public inquiry pages, the public Agent chat, and print/PDF rendering keep
 * their generous scale and are excluded.
 *
 * Fails on:
 * - an off-scale control height declared in authenticated feature or
 *   placeholder code, rather than inherited from a primitive;
 * - a padding utility on the same class attribute as a padded panel utility,
 *   where the cascade silently ignores it (custom padding must use the
 *   documented `data-padding="none"` opt-out);
 * - a second declaration of the sidebar width variables outside the sidebar
 *   primitive;
 * - an arbitrary font-size value in authenticated feature code where a
 *   typography role already exists;
 * - an arbitrary container radius in authenticated feature code (radii come
 *   from the shared scale, not per-surface values).
 *
 * Line-based heuristic: a `className` spanning multiple lines with the panel
 * class on one line and `data-padding` on another is rare in this repo; keep
 * the opt-out attribute on the same line as the class list.
 *
 * Usage: npx tsx scripts/audit-density.ts
 */

import {
  exitIfOffenders,
  isDesignSystemFile,
  lineOf,
  readText,
  relPath,
  walk,
  ROOT,
  type Offender,
} from "./audit-lib";
import path from "node:path";

const SCAN_ROOTS = ["app", "components", "features"];

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, "/");
}

function isTsxFile(absPath: string, rel: string): boolean {
  if (!/\.(tsx?|mts|cts)$/.test(absPath)) return false;
  const normalized = normalizeRel(rel);
  return SCAN_ROOTS.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`),
  );
}

/** Out-of-scope surfaces keep their generous scale. */
function isOutOfScope(rel: string): boolean {
  const normalized = rel.replace(/\\/g, "/");
  if (normalized.startsWith("app/(marketing)/")) return true;
  if (normalized.startsWith("app/(auth)/")) return true;
  if (normalized.startsWith("app/(public)/")) return true;
  if (normalized.startsWith("app/admin/(auth)/")) return true;
  if (normalized.startsWith("app/invite/")) return true;
  if (normalized.startsWith("app/verify-email/")) return true;
  if (normalized.startsWith("app/not-found")) return true;
  if (normalized === "app/not-found.tsx") return true;
  if (normalized.startsWith("app/(checkout)/")) return true;
  if (normalized.startsWith("app/api/")) return true;
  if (normalized.startsWith("app/.well-known/")) return true;
  if (normalized.startsWith("app/llms.txt/")) return true;
  if (normalized.startsWith("components/marketing/")) return true;
  if (normalized.startsWith("components/seo/")) return true;
  if (normalized.endsWith("components/shell/auth-shell.tsx")) return true;
  if (normalized.startsWith("components/ui/")) return true;
  if (normalized.startsWith("features/ai-agent/")) return true;
  if (normalized.startsWith("features/legal/")) return true;
  if (normalized.startsWith("features/auth/")) return true;
  if (normalized.startsWith("features/dev-tools/")) return true;
  if (normalized.startsWith("features/onboarding/")) return true;
  if (/annotation-marker|basic-trend-chart/i.test(normalized)) return true;
  if (/(^|\/)(print|pdf|preview)[-_/]/i.test(normalized)) return true;
  const basename = normalized.split("/").pop() ?? "";
  if (/print/i.test(basename)) return true;
  if (/quote-preview/i.test(basename)) return true;
  if (/showcase-image-surface/i.test(basename)) return true;
  // Miniature public-page preview canvas, not dashboard controls.
  if (/layout-section/i.test(basename)) return true;
  if (
    /public-inquiry|public-quote|public-page|print-page|public-route-skeleton/i.test(
      normalized,
    )
  )
    return true;
  return false;
}

/** Brand, avatar, auth-chrome, and state-page display type live outside roles. */
function isTypographyExempt(normalizedRel: string): boolean {
  return (
    normalizedRel.endsWith("components/shared/brand-mark.tsx") ||
    normalizedRel.endsWith("components/shared/brand-wordmark.tsx") ||
    normalizedRel.endsWith("components/shared/business-avatar.tsx") ||
    normalizedRel.endsWith("components/shared/state-page-card.tsx") ||
    normalizedRel.endsWith("components/shell/auth-shell.tsx")
  );
}

/**
 * Primitives own sizes; everything else inherits.
 *
 * Both design-system trees are exempt: the shadcn primitives under
 * `components/ui/` and the 1:1 shadcn recreations under `components/shared/`
 * (see `isDesignSystemFile`). These are source-owned design-system files;
 * requo-owned surfaces inherit from them.
 */
function isPrimitive(rel: string): boolean {
  const normalized = rel.replace(/\\/g, "/");
  if (isDesignSystemFile(normalized)) return true;
  // Transitional: the legacy trees still exist until the follow-up migration
  // commit removes them; keep their exemptions alongside the shared allowlist.
  if (
    normalized.startsWith("components/base/") ||
    normalized.startsWith("components/application/")
  )
    return true;
  if (normalized === "components/select.tsx") return true;
  if (normalized === "app/globals.css") return true;
  return false;
}

/**
 * Off-scale control heights: the 40px control (h-10), the 38px nav item
 * (h-9.5), the 18px nav icon (size-4.5), and the old 56px chrome (h-14).
 * Larger decorative sizes (h-11 tap targets, h-12 banners, size-12 icons)
 * are legitimate and not flagged. Mobile bottom navigation keeps its own
 * chrome scale.
 */
const OFF_SCALE_HEIGHT =
  /\b(?:sm:|md:|lg:|xl:)?(?:h|min-h)-10\b|\bh-9\.5\b|\bmin-h-9\.5\b|\bsize-4\.5\b|\bsize-10\b|\bh-14\b/;

function isMobileChromeFile(normalizedRel: string): boolean {
  return /mobile-/.test(normalizedRel);
}

/**
 * JSX opening tags often span lines (`<div` … `className="…"` …
 * `data-padding="none"` … `>`). A line-based check would miss an opt-out
 * sitting on an adjacent line of the same element, so look a few lines
 * around the hit. Opt-outs always sit adjacent to their element.
 */
function hasNearbyOptOut(lines: string[], index: number): boolean {
  const from = Math.max(0, index - 8);
  const to = Math.min(lines.length - 1, index + 2);
  for (let i = from; i <= to; i += 1) {
    if (/data-padding\s*=\s*["']none["']/.test(lines[i])) return true;
  }
  return false;
}

const PADDING_UTILITY =
  /\b(?:sm:|md:|lg:|xl:)?(?:p|px|py|pt|pb|pl|pr)-(?:px|\d+(?:\.\d+)?)\b/;
const PANEL_UTILITY = /(?<!bg-)\b(?:section-panel|soft-panel)\b/;
/** Colors (text-[#…]) are not font sizes. */
const ARBITRARY_FONT_SIZE = /\btext-\[\d[^\]]*\]/;
const ARBITRARY_RADIUS = /\brounded-\[[^\]]+\]/;
const SIDEBAR_WIDTH_DECLARATION = /--sidebar-width(?:"\s*:|\s*:)/;

async function main(): Promise<void> {
  const files = await walk(path.join(ROOT, "."), (abs, rel) => {
    const normalized = normalizeRel(rel);
    if (!isTsxFile(abs, rel)) return false;
    if (normalized.startsWith("scripts/")) return false;
    if (normalized.startsWith("tests/")) return false;
    if (isOutOfScope(rel)) return false;
    return true;
  });

  const offenders: Offender[] = [];

  for (const abs of files) {
    const rel = relPath(abs);
    const normalizedRel = normalizeRel(rel);
    const source = await readText(abs);
    if (!source) continue;
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      if (!isPrimitive(normalizedRel)) {
        const heightMatch = line.match(OFF_SCALE_HEIGHT);
        if (heightMatch) {
          const matched = heightMatch[0];
          const isH14 = matched === "h-14" || matched.endsWith(":h-14");
          if (isH14 && isMobileChromeFile(normalizedRel)) {
            // Mobile bottom navigation keeps its own chrome scale.
          } else {
            offenders.push({
              file: rel,
              line: lineNumber,
              message: `off-scale control height "${matched}" — inherit the 32px desktop / 36px mobile control scale from the primitive instead`,
            });
          }
        }

        if (
          PANEL_UTILITY.test(line) &&
          PADDING_UTILITY.test(line) &&
          !/data-padding\s*=\s*["']none["']/.test(line) &&
          !hasNearbyOptOut(lines, index)
        ) {
          offenders.push({
            file: rel,
            line: lineNumber,
            message:
              "padding utility on the same class attribute as a padded panel utility is silently ignored — remove the padding or opt out with data-padding=\"none\"",
          });
        }

        if (SIDEBAR_WIDTH_DECLARATION.test(line)) {
          offenders.push({
            file: rel,
            line: lineNumber,
            message:
              "second declaration of the sidebar width variable — the sidebar primitive owns the 240px rail; remove the duplicate",
          });
        }

        const fontMatch = line.match(ARBITRARY_FONT_SIZE);
        if (fontMatch && !isTypographyExempt(normalizedRel)) {
          // Display numerals (stat values, empty-state figures) live outside
          // the text roles by design.
          const sizeValue = fontMatch[0].slice(6, -1);
          const displaySize =
            /^\d+(\.\d+)?rem$/.test(sizeValue) &&
            Number.parseFloat(sizeValue) >= 1.5;
          if (!displaySize) {
            offenders.push({
              file: rel,
              line: lineNumber,
              message: `arbitrary font size "${fontMatch[0]}" — use a typography role (PageHeader, CardTitle, meta-label) instead`,
            });
          }
        }

        const radiusMatch = line.match(ARBITRARY_RADIUS);
        // No product exceptions: every surface uses the single shared
        // radius (var(--radius)); micro-internals live in primitives.
        if (radiusMatch) {
          offenders.push({
            file: rel,
            line: lineNumber,
            message: `arbitrary radius "${radiusMatch[0]}" — use the shared radius scale instead`,
          });
        }
      } else if (normalizedRel !== "components/ui/sidebar.tsx") {
        // Primitives other than the sidebar must not re-declare the rail width.
        if (SIDEBAR_WIDTH_DECLARATION.test(line)) {
          offenders.push({
            file: rel,
            line: lineNumber,
            message:
              "second declaration of the sidebar width variable — the sidebar primitive owns the 240px rail; remove the duplicate",
          });
        }
      }
    });

    // File-level: sidebar width declared outside the primitive.
    if (!isPrimitive(normalizedRel)) {
      const declIndex = source.search(SIDEBAR_WIDTH_DECLARATION);
      if (declIndex >= 0 && !offenders.some((o) => o.file === rel && o.message.startsWith("second declaration"))) {
        offenders.push({
          file: rel,
          line: lineOf(source, declIndex),
          message:
            "second declaration of the sidebar width variable — the sidebar primitive owns the 240px rail; remove the duplicate",
        });
      }
    }
  }

  offenders.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
  exitIfOffenders("audit-density", offenders);
}

void main();
