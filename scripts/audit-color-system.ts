#!/usr/bin/env tsx
/**
 * Audit: the colour system stays neutral, legible, and token-backed.
 *
 * Requo deliberately moved off green-tinted "paper" surfaces to a true-neutral
 * Apple-style charcoal family. That decision is easy to undo one token at a
 * time, so this audit protects four invariants:
 *
 * 1. Neutral tokens are actually neutral. Every opaque neutral must satisfy
 *    `R = G` and `B <= R + 6`; a green, teal, olive, slate-blue, or warm cast
 *    fails. Dark large surfaces must sit between #161618 and #2C2C2E and may
 *    never be pure black or white.
 *
 * 2. Text keeps its contrast. `--foreground` is checked at >= 7:1 and
 *    `--muted-foreground` at >= 4.5:1 on every primary surface in both themes.
 *    Semantic inks (`--primary-ink`, `--destructive-ink`, …) are checked at
 *    >= 4.5:1 so a lighter dark-mode link never falls below AA. Solid fills
 *    stay on `--primary` / `--destructive`; the inks are only for text.
 *
 * 3. Theme plumbing is present. Both blocks set `color-scheme`, the ink tokens
 *    are mapped into Tailwind's `@theme inline`, and selected sidebar rows use
 *    their own token rather than a raw black/white wash.
 *
 * 4. Product UI does not bypass the tokens. Raw palette utilities and colour
 *    literals are rejected outside an explicit, documented exemption list
 *    (brand marks, email/PDF surfaces, standalone error pages, and the
 *    decorative plan illustration). Add an exemption only when a colour
 *    genuinely cannot follow the theme, and say why.
 *
 * Usage: npx tsx scripts/audit-color-system.ts
 */

import {
  exitIfOffenders,
  readText,
  relPath,
  walk,
  ROOT,
  type Offender,
} from "./audit-lib";
import path from "node:path";

const GLOBALS = "app/globals.css";

/** Every opaque neutral token. Gradients/alpha values are skipped naturally. */
const NEUTRAL_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent-foreground",
  "border",
  "input",
  "sidebar",
  "sidebar-foreground",
  "sidebar-accent-foreground",
  "sidebar-border",
  "shell-frame",
  "shell-card",
  "theme-preview-light-bg",
  "theme-preview-light-card",
  "theme-preview-light-fg",
  "theme-preview-dark-bg",
  "theme-preview-dark-card",
  "theme-preview-dark-fg",
  "marketing-surface-raised",
  "marketing-surface-muted",
  "marketing-muted",
  "tooltip-surface-bg",
  "tooltip-surface-fg",
  "overlay-surface-bg",
  "inverse-surface",
  "inverse-foreground",
  "inverse-button-bg",
  "inverse-button-fg",
  "switch-thumb",
] as const;

/** Large dark surfaces that must stay inside the charcoal band. */
const DARK_SURFACE_TOKENS = [
  "background",
  "card",
  "popover",
  "secondary",
  "muted",
  "sidebar",
  "shell-frame",
  "shell-card",
  "tooltip-surface-bg",
  "theme-preview-dark-bg",
  "theme-preview-dark-card",
  "inverse-surface",
] as const;

/** Opaque surfaces a text token is measured against. */
const CONTRAST_SURFACES = [
  "background",
  "card",
  "popover",
  "sidebar",
  "muted",
] as const;

const CONTRAST_TEXT = {
  foreground: 7,
  "muted-foreground": 4.5,
  "primary-ink": 4.5,
  "destructive-ink": 4.5,
  "success-ink": 4.5,
  "warning-ink": 4.5,
  "info-ink": 4.5,
} as const;

/** Tokens the rest of the system expects to find in both blocks. */
const REQUIRED_TOKENS = [
  "primary-ink",
  "destructive-ink",
  "success-ink",
  "warning-ink",
  "info-ink",
  "sidebar-selected",
  "switch-thumb",
  "status-progress-bg",
  "status-progress-border",
  "status-progress-fg",
  "status-active-bg",
  "status-active-border",
  "status-active-fg",
  "status-highlight-bg",
  "status-highlight-border",
  "status-highlight-fg",
  "status-attention-bg",
  "status-attention-border",
  "status-attention-fg",
  "theme-preview-light-bg",
  "theme-preview-light-card",
  "theme-preview-light-fg",
  "theme-preview-dark-bg",
  "theme-preview-dark-card",
  "theme-preview-dark-fg",
  "theme-preview-dark-border",
] as const;

const REQUIRED_THEME_MAPPINGS = [
  "--color-primary-ink",
  "--color-destructive-ink",
  "--color-success-ink",
  "--color-warning-ink",
  "--color-info-ink",
  "--color-sidebar-selected",
  "--color-switch-thumb",
] as const;

/**
 * Files whose colours deliberately cannot follow the theme. Keep every entry
 * narrow and explain the constraint; a broad directory exemption hides the
 * next raw `bg-rose-500`.
 */
const EXEMPT_FILES: Readonly<Record<string, string>> = {
  "app/global-error.tsx":
    "standalone error page; renders before the app stylesheet and carries its own inline palette",
  "app/layout.tsx":
    "viewport themeColor is browser chrome, not a CSS token surface",
  "components/seo/social-preview-image.tsx":
    "static Open Graph raster; fixed light palette for social cards",
  "components/shared/plan-art-flame.tsx":
    "decorative plan illustration; brand-blob canvas colours are intentionally fixed",
  "components/shared/settings-tools.tsx":
    "third-party server tiles use the vendor's brand colour",
  "components/shared/switch.tsx":
    "micro inset highlight; a raw inset shadow is not a themeable surface",
  "components/shared/theme-toggle.tsx":
    "glass control over a fixed transparent surface; black/white glass labels are intentional",
  "components/shared/tooltip.tsx":
    "caret drop-shadow; no colour token can express a filter shadow",
  "components/ui/chart.tsx":
    "Recharts internal SVG selector strings, not rendered UI",
  "features/admin/forbidden-page.ts":
    "standalone forbidden page; renders outside the app stylesheet",
  "features/auth/components/social-auth-buttons.tsx":
    "Google brand mark; brand colours must not follow the theme",
  "features/billing/components/payment-method-icon.tsx":
    "Visa/Mastercard/Amex/PayPal marks; brand colours must not follow the theme",
  "features/admin/components/operations/emails/email-html-preview.tsx":
    "preview of the actual email HTML, which is always light",
  "features/follow-ups/jobs/reminders.ts":
    "HTML email body; mail clients do not resolve CSS custom properties",
  "features/marketing/actions/request-demo.ts":
    "HTML email body; mail clients do not resolve CSS custom properties",
  "features/settings/components/email-template-builder/block-content.tsx":
    "email builder defaults; the stored template carries literal hex colours",
  "features/settings/components/email-template-builder/block-controls.tsx":
    "email builder placeholders and defaults; the stored template carries literal hex colours",
  "features/settings/components/services-list.tsx":
    "canvas-drawn service thumbnail; a static light preview, not live UI",
  "features/settings/schemas.ts":
    "hex validation examples in user-facing schema messages",
  "lib/pdf/report.ts":
    "PDF palette; PDFs are print surfaces and do not resolve app tokens",
};

const SCAN_ROOTS = ["app", "components", "features", "lib"];

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const RAW_PALETTE = new RegExp(
  `\\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|decoration|accent|caret)-(?:${PALETTE})-\\d{2,3}(?:/\\d+)?\\b`,
);

/** Pure black/white backgrounds are surfaces; text-white is handled by the palette rule. */
const RAW_BLACK_WHITE_SURFACE = /\bbg-(?:black|white)(?:\/\S+)?\b/;

const COLOR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;

const STRING_LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g;

type Rgb = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
};

function parseHex(raw: string): Rgb | null {
  const match = /^#([0-9a-fA-F]{3,8})$/.exec(raw);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split("")
      .map((character) => character + character)
      .join("");
  }
  if (hex.length !== 6 && hex.length !== 8) return null;
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: hex.length === 8 ? channel(6) / 255 : 1,
  };
}

function parseRgb(raw: string): Rgb | null {
  const match =
    /^rgba?\(\s*([\d.]+)\s*[\s,]\s*([\d.]+)\s*[\s,]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(
      raw,
    );
  if (!match) return null;
  const alpha = match[4];
  let a = 1;
  if (alpha) {
    a = alpha.endsWith("%")
      ? Number(alpha.slice(0, -1)) / 100
      : Number(alpha);
  }
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a,
  };
}

function parseColor(raw: string): Rgb | null {
  const value = raw.trim();
  return parseHex(value) ?? parseRgb(value);
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (
    channel(r) * 0.2126 + channel(g) * 0.7152 + channel(b) * 0.0722
  );
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function formatRgb({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseTokenBlock(source: string, selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped}\\s*\\{([\\s\\S]*?)^\\}`, "m").exec(source);
  const tokens = new Map<string, string>();
  if (!match) return tokens;
  for (const token of match[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(token[1], token[2].replace(/\s+/g, " ").trim());
  }
  return tokens;
}

function normalize(rel: string): string {
  return rel.replace(/\\/g, "/");
}

function isScanned(rel: string): boolean {
  const normalized = normalize(rel);
  if (normalized === GLOBALS) return false;
  return SCAN_ROOTS.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`),
  );
}

function stringLiterals(line: string): string[] {
  const literals: string[] = [];
  for (const match of line.matchAll(STRING_LITERAL)) {
    literals.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return literals;
}

function neutralProblems(name: string, rgb: Rgb): string[] {
  const problems: string[] = [];
  if (rgb.r !== rgb.g) {
    problems.push(
      `R ${rgb.r} must equal G ${rgb.g} (neutral, no green/olive/warm cast)`,
    );
  }
  if (rgb.b > rgb.r + 6) {
    problems.push(
      `B ${rgb.b} exceeds R + 6 (no slate-blue cast; ${rgb.r} + 6 = ${rgb.r + 6})`,
    );
  }
  return problems.map((problem) => `${name}: ${problem}`);
}

function main(): void {
  void run();
}

async function run(): Promise<void> {
  const offenders: Offender[] = [];
  const source = await readText(path.join(ROOT, GLOBALS));
  if (!source) {
    offenders.push({
      file: GLOBALS,
      line: 1,
      message: "could not read the token file",
    });
    exitIfOffenders("audit-color-system", offenders);
    return;
  }

  const light = parseTokenBlock(source, ":root");
  const dark = parseTokenBlock(source, ".dark");
  const themes = [
    { name: "light", tokens: light },
    { name: "dark", tokens: dark },
  ] as const;

  for (const { name, tokens } of themes) {
    if (tokens.size === 0) {
      offenders.push({
        file: GLOBALS,
        line: 1,
        message: `could not parse the ${name} token block`,
      });
      continue;
    }
    if (!new RegExp(`color-scheme:\\s*${name}`).test(source)) {
      offenders.push({
        file: GLOBALS,
        line: 1,
        message: `${name}: missing color-scheme: ${name} for native controls`,
      });
    }
  }

  const mappings = parseMappingBlock(source);
  for (const mapping of REQUIRED_THEME_MAPPINGS) {
    if (!mappings.has(mapping)) {
      offenders.push({
        file: GLOBALS,
        line: 1,
        message: `missing @theme inline mapping for ${mapping}`,
      });
    }
  }

  for (const { name, tokens } of themes) {
    for (const token of REQUIRED_TOKENS) {
      if (!tokens.has(token)) {
        offenders.push({
          file: GLOBALS,
          line: 1,
          message: `${name}: missing required token --${token}`,
        });
      }
    }
  }

  for (const { name, tokens } of themes) {
    for (const token of NEUTRAL_TOKENS) {
      const value = tokens.get(token);
      if (!value) continue;
      const rgb = parseColor(value);
      if (!rgb || rgb.a < 1) continue;
      for (const problem of neutralProblems(`--${token} (${name})`, rgb)) {
        offenders.push({ file: GLOBALS, line: 1, message: problem });
      }
    }
  }

  const darkTokens = dark;
  for (const token of DARK_SURFACE_TOKENS) {
    const value = darkTokens.get(token);
    if (!value) continue;
    const rgb = parseColor(value);
    if (!rgb || rgb.a < 1) continue;
    const inBand = [rgb.r, rgb.g, rgb.b].every(
      (channel) => channel >= 0x16 && channel <= 0x2e,
    );
    if (!inBand) {
      offenders.push({
        file: GLOBALS,
        line: 1,
        message: `--${token} (dark) is ${formatRgb(rgb)}, outside the #161618–#2C2C2E charcoal band`,
      });
    }
  }

  const contrastRows: string[] = [];
  for (const { name, tokens } of themes) {
    const surfaces = CONTRAST_SURFACES.map((surface) => {
      const value = tokens.get(surface);
      const rgb = value ? parseColor(value) : null;
      if (!rgb) {
        offenders.push({
          file: GLOBALS,
          line: 1,
          message: `${name}: could not resolve --${surface} for the contrast table`,
        });
      }
      return { surface, rgb };
    });

    const textTokens = Object.entries(CONTRAST_TEXT);
    contrastRows.push(
      [name.padEnd(6), "surface", ...textTokens.map(([token]) => token)].join(
        "  ",
      ),
    );
    for (const { surface, rgb } of surfaces) {
      if (!rgb) continue;
      const cells = textTokens.map(([token, minimum]) => {
        const value = tokens.get(token);
        const textRgb = value ? parseColor(value) : null;
        if (!textRgb) {
          offenders.push({
            file: GLOBALS,
            line: 1,
            message: `${name}: could not resolve --${token} for the contrast table`,
          });
          return "missing";
        }
        const ratio = contrastRatio(textRgb, rgb);
        if (ratio < minimum) {
          offenders.push({
            file: GLOBALS,
            line: 1,
            message: `${name}: --${token} on --${surface} is ${ratio.toFixed(2)}:1 (needs ${minimum}:1)`,
          });
        }
        return `${ratio.toFixed(2)}:1`;
      });
      contrastRows.push([name.padEnd(6), surface.padEnd(7), ...cells].join("  "));
    }
  }

  console.log("Color-system contrast table");
  console.log(contrastRows.join("\n"));
  console.log("");

  const files = await walk(path.join(ROOT, "."), (abs, rel) => {
    if (!/\.(tsx?|mts|cts|css)$/.test(abs)) return false;
    return isScanned(rel);
  });

  for (const abs of files) {
    const rel = normalize(relPath(abs));
    if (EXEMPT_FILES[rel]) continue;

    const fileSource = await readText(abs);
    if (!fileSource) continue;

    fileSource.split(/\r?\n/).forEach((line, index) => {
      const lineNumber = index + 1;

      const paletteMatch = line.match(RAW_PALETTE);
      if (paletteMatch) {
        offenders.push({
          file: rel,
          line: lineNumber,
          message: `raw palette utility "${paletteMatch[0]}" — use a semantic token or shared tone`,
        });
      }

      const blackWhiteMatch = line.match(RAW_BLACK_WHITE_SURFACE);
      if (blackWhiteMatch) {
        offenders.push({
          file: rel,
          line: lineNumber,
          message: `raw surface "${blackWhiteMatch[0]}" — use bg-background/card/popover/... so dark mode stays token-backed`,
        });
      }

      for (const literal of stringLiterals(line)) {
        const colourMatch = literal.match(COLOR_LITERAL);
        if (!colourMatch) continue;
        offenders.push({
          file: rel,
          line: lineNumber,
          message: `raw colour literal "${colourMatch[0]}" — use a token; exempt genuinely static surfaces explicitly in scripts/audit-color-system.ts`,
        });
        break;
      }
    });
  }

  offenders.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
  exitIfOffenders("audit-color-system", offenders);
}

function parseMappingBlock(source: string): Set<string> {
  const match = /@theme inline\s*\{([\s\S]*?)^\}/m.exec(source);
  const mappings = new Set<string>();
  if (!match) return mappings;
  for (const mapping of match[1].matchAll(/(--color-[a-z0-9-]+)\s*:/g)) {
    mappings.add(mapping[1]);
  }
  return mappings;
}

main();
