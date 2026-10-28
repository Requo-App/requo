#!/usr/bin/env tsx
/**
 * Audit: the colour system stays neutral, legible, and token-backed.
 *
 * Requo deliberately moved off green-tinted "paper" surfaces to a true-neutral
 * Apple-style charcoal family. That decision is easy to undo one token at a
 * time, so this audit protects four invariants:
 *
 * 1. Neutral tokens are actually neutral. Every opaque neutral must satisfy
 *    `R = G` and `|B - R| <= 6`; a green, teal, olive, slate-blue, or warm cast
 *    fails. Dark large surfaces must sit between #161618 and #343436 and may
 *    never be pure black or white.
 *
 * 2. Text keeps its contrast. `--foreground` is checked at >= 7:1 and
 *    `--muted-foreground` at >= 4.5:1 on every primary surface in both themes.
 *    Semantic inks (`--primary-ink`, `--destructive-ink`, …) are checked at
 *    >= 4.5:1 so a lighter dark-mode link never falls below AA. Warning copy
 *    is also checked on its own 10% and 15% tints, because sentence-length
 *    warning text sits on those tinted banners. Solid fills stay on
 *    `--primary` / `--destructive`; the inks are only for text.
 *
 * 3. Theme plumbing is present. Both blocks set `color-scheme`, the ink tokens
 *    are mapped into Tailwind's `@theme inline`, and selected sidebar rows use
 *    their own token rather than a raw black/white wash.
 *
 * 4. Product UI does not bypass the tokens. Raw palette utilities, raw
 *    black/white utilities, ink tokens used as fills, and colour literals are
 *    rejected outside an explicit, documented exemption list (brand marks,
 *    email/PDF surfaces, standalone error pages, and the decorative plan
 *    illustration). Files that mix static artwork with live UI allow only the
 *    exact static literals listed below; add an exemption only when a colour
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
import { pathToFileURL } from "node:url";

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
  "surface-inset-bg",
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
  "surface-inset-bg",
  "tooltip-surface-bg",
  "overlay-surface-bg",
  "theme-preview-dark-bg",
  "theme-preview-dark-card",
  "inverse-surface",
] as const;

/** Opaque surfaces a text token is measured against. */
const CONTRAST_SURFACES = [
  "background",
  "card",
  "surface-inset-bg",
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

/**
 * Sentence-length status text rendered on its own low-alpha tint. Warning is
 * the only tone used for that treatment (archived/locked banners, the billing
 * cancel alert, and the in-app-browser notice); the paired ink must clear AA
 * on both the 10% and 15% tint over the card surface.
 */
const TINTED_TEXT_CONTRAST = [
  { tone: "warning", tint: 10, minimum: 4.5 },
  { tone: "warning", tint: 15, minimum: 4.5 },
] as const;

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
  "surface-inset-bg",
  "control-bg-hover",
  "control-border-hover",
  "control-disabled-fg",
  "control-disabled-border",
  "overlay-divider",
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
 * next raw `bg-rose-500`. Files that mix static artwork with live UI must use
 * `EXEMPT_LITERALS` instead, so the live remainder is still scanned.
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
  "components/shared/switch.tsx":
    "micro inset highlight; a raw inset shadow is not a themeable surface",
  "components/shared/tooltip.tsx":
    "caret drop-shadow; no colour token can express a filter shadow",
  "components/ui/chart.tsx":
    "Recharts internal SVG selector strings, not rendered UI",
  "features/admin/forbidden-page.ts":
    "standalone forbidden page; renders outside the app stylesheet",
  "features/billing/components/payment-method-icon.tsx":
    "Visa/Mastercard/Amex/PayPal marks; brand colours must not follow the theme",
  "features/admin/components/operations/emails/email-html-preview.tsx":
    "preview of the actual email HTML, which is always light",
  "features/settings/schemas.ts":
    "hex validation examples in user-facing schema messages",
  "lib/pdf/report.ts":
    "PDF palette; PDFs are print surfaces and do not resolve app tokens",
};

/**
 * Exact raw colours allowed inside an otherwise-scanned file. These are static
 * brand, canvas, or email literals embedded next to live UI; every other raw
 * colour in the same file still fails. Matched case-insensitively.
 */
const EXEMPT_LITERALS: Readonly<Record<string, readonly string[]>> = {
  "components/shared/settings-tools.tsx": [
    // Third-party server tiles use each vendor's brand colour.
    "bg-pink-200",
    "text-pink-700",
    "bg-blue-200",
    "text-blue-700",
    "bg-amber-200",
    "text-amber-700",
    "bg-neutral-950",
    "text-white",
  ],
  "components/shared/theme-toggle.tsx": [
    // Glass control over a fixed transparent surface; these labels stay black
    // or white rather than following the theme.
    "text-black",
    "text-black/45",
    "text-black/70",
    "text-white",
    "text-white/45",
    "text-white/70",
  ],
  "features/follow-ups/jobs/reminders.ts": [
    // HTML email body; mail clients do not resolve CSS custom properties.
    "#374151",
    "#6b7280",
    "#111827",
    "#fff",
    "#9ca3af",
  ],
  "features/marketing/actions/request-demo.ts": [
    // HTML email body; mail clients do not resolve CSS custom properties.
    "#6b7280",
    "#2563eb",
    "#e5e7eb",
    "#9ca3af",
  ],
  "features/settings/components/email-template-builder/block-content.tsx": [
    // Email builder defaults; the stored template carries literal hex colours.
    "#008060",
    "#f4fffb",
  ],
  "features/settings/components/email-template-builder/block-controls.tsx": [
    // Email builder placeholders and defaults; the stored template carries
    // literal hex colours.
    "#008060",
    "#f4fffb",
  ],
  "features/auth/components/social-auth-buttons.tsx": [
    // Google brand mark; brand colours must not follow the theme.
    "#4285f4",
    "#34a853",
    "#fbbc04",
    "#ea4335",
  ],
  "features/settings/components/services-list.tsx": [
    // Canvas-drawn service thumbnail; a static light preview, not live UI.
    "rgba(0, 0, 0, 0.08)",
    "#ffffff",
    "#f3f4f6",
    "#111827",
    "#6b7280",
    "rgba(0, 0, 0, 0.06)",
  ],
};

const SCAN_ROOTS = ["app", "components", "features", "lib"];

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const UTILITY_PREFIXES =
  "bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|from|to|via|fill|stroke|divide(?:-[xy])?|outline|shadow|decoration|accent|caret|placeholder";

const RAW_PALETTE = new RegExp(
  `\\b(?:${UTILITY_PREFIXES})-(?:${PALETTE})-\\d{2,3}(?:/\\d+)?\\b`,
  "g",
);

/** Raw black/white text, borders, rings, fills, and surfaces all bypass dark mode. */
const RAW_BLACK_WHITE = new RegExp(
  `\\b(?:${UTILITY_PREFIXES})-(?:black|white)(?:/(?:\\d+|\\[[^\\]]+\\]))?\\b`,
  "g",
);

/** Ink tokens are text/icon tones; using one as a fill flips the contrast contract. */
const RAW_INK_FILL = new RegExp(
  `\\b(?:bg|from|via|to)-(?:primary|destructive|success|warning|info)-ink(?:/(?:\\d+|\\[[^\\]]+\\]))?\\b`,
  "g",
);

const COLOR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;

const STRING_LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g;

export type Rgb = {
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

export function parseColor(raw: string): Rgb | null {
  const value = raw.trim();
  return parseHex(value) ?? parseRgb(value);
}

/** Alpha-composite `foreground` over an opaque `background`. */
export function mixColor(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  const channel = (front: number, back: number) =>
    Math.round(front * alpha + back * (1 - alpha));
  return {
    r: channel(foreground.r, background.r),
    g: channel(foreground.g, background.g),
    b: channel(foreground.b, background.b),
    a: 1,
  };
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

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function formatRgb({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function extractThemeBlock(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `^${escaped}[\\t\\n\\f\\r ]*\\{([\\s\\S]*?)^\\}`,
    "m",
  ).exec(source);
  return match?.[1] ?? "";
}

export function hasColorScheme(block: string, scheme: "light" | "dark"): boolean {
  const declarations = block.replace(/\/\*[\s\S]*?\*\//g, "");
  const whitespace = "[\\t\\n\\f\\r ]*";
  return new RegExp(
    `(?:^|;)${whitespace}color-scheme${whitespace}:${whitespace}${scheme}` +
      `${whitespace}(?:!${whitespace}important${whitespace})?(?:;|$)`,
    "i",
  ).test(declarations);
}

export function parseTokenBlock(
  source: string,
  selector: string,
): Map<string, string> {
  const tokens = new Map<string, string>();
  const block = extractThemeBlock(source, selector);
  for (const token of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(token[1], token[2].replace(/\s+/g, " ").trim());
  }
  return tokens;
}

/** Resolve a token whose whole value is a `var(--token)` reference. */
function resolveToken(
  tokens: Map<string, string>,
  name: string,
  seen = new Set<string>(),
): string | null {
  const value = tokens.get(name);
  if (!value) return null;
  const match = /^var\(\s*--([a-z0-9-]+)\s*\)$/.exec(value);
  if (!match) return value;
  if (seen.has(name)) return null;
  const nextSeen = new Set(seen);
  nextSeen.add(name);
  return resolveToken(tokens, match[1], nextSeen);
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

function firstDisallowed(
  value: string,
  pattern: RegExp,
  allowed: ReadonlySet<string>,
): string | null {
  for (const match of value.matchAll(pattern)) {
    if (!allowed.has(match[0].toLowerCase())) return match[0];
  }
  return null;
}

/** Scan one source file against the raw-colour boundary. */
export function auditSource(rel: string, source: string): Offender[] {
  if (EXEMPT_FILES[rel]) return [];
  const allowed = new Set(
    (EXEMPT_LITERALS[rel] ?? []).map((literal) => literal.toLowerCase()),
  );
  const offenders: Offender[] = [];

  source.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;

    const paletteMatch = firstDisallowed(line, RAW_PALETTE, allowed);
    if (paletteMatch) {
      offenders.push({
        file: rel,
        line: lineNumber,
        message: `raw palette utility "${paletteMatch}" — use a semantic token or shared tone`,
      });
    }

    const blackWhiteMatch = firstDisallowed(line, RAW_BLACK_WHITE, allowed);
    if (blackWhiteMatch) {
      offenders.push({
        file: rel,
        line: lineNumber,
        message: `raw black/white utility "${blackWhiteMatch}" — use a semantic surface or text token so dark mode stays token-backed`,
      });
    }

    const inkFillMatch = firstDisallowed(line, RAW_INK_FILL, allowed);
    if (inkFillMatch) {
      offenders.push({
        file: rel,
        line: lineNumber,
        message: `ink token used as a fill "${inkFillMatch}" — inks are text/icon-only; use a solid semantic or status tone`,
      });
    }

    for (const literal of stringLiterals(line)) {
      const colourMatch = firstDisallowed(literal, COLOR_LITERAL, allowed);
      if (!colourMatch) continue;
      offenders.push({
        file: rel,
        line: lineNumber,
        message: `raw colour literal "${colourMatch}" — use a token; exempt genuinely static surfaces explicitly in scripts/audit-color-system.ts`,
      });
      break;
    }
  });

  return offenders;
}

export function neutralProblems(name: string, rgb: Rgb): string[] {
  const problems: string[] = [];
  if (rgb.r !== rgb.g) {
    problems.push(
      `R ${rgb.r} must equal G ${rgb.g} (neutral, no green/olive cast)`,
    );
  }
  if (rgb.b > rgb.r + 6) {
    problems.push(
      `B ${rgb.b} exceeds R + 6 (no slate-blue cast; ${rgb.r} + 6 = ${rgb.r + 6})`,
    );
  }
  if (rgb.b < rgb.r - 6) {
    problems.push(
      `B ${rgb.b} is below R - 6 (no warm cast; ${rgb.r} - 6 = ${rgb.r - 6})`,
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
    { name: "light", selector: ":root", tokens: light },
    { name: "dark", selector: ".dark", tokens: dark },
  ] as const;

  for (const { name, selector, tokens } of themes) {
    if (tokens.size === 0) {
      offenders.push({
        file: GLOBALS,
        line: 1,
        message: `could not parse the ${name} token block`,
      });
      continue;
    }
    const block = extractThemeBlock(source, selector);
    if (!hasColorScheme(block, name)) {
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
    const value = resolveToken(darkTokens, token);
    if (!value) continue;
    const rgb = parseColor(value);
    if (!rgb || rgb.a < 1) continue;
    // The top of the band (#343436) carries the allowed neutral blue
    // tolerance, so blue may sit two steps above red/green.
    const inBand =
      rgb.r >= 0x16 &&
      rgb.r <= 0x34 &&
      rgb.g >= 0x16 &&
      rgb.g <= 0x34 &&
      rgb.b >= 0x16 &&
      rgb.b <= 0x36;
    if (!inBand) {
      offenders.push({
        file: GLOBALS,
        line: 1,
        message: `--${token} (dark) is ${formatRgb(rgb)}, outside the #161618–#343436 charcoal band`,
      });
    }
  }

  const darkOverlaySurfaceTokens = [
    "popover",
    "overlay-surface-bg",
    "tooltip-surface-bg",
  ] as const;
  const darkOverlaySurfaces = darkOverlaySurfaceTokens.map((token) => {
    const value = resolveToken(darkTokens, token);
    return { token, rgb: value ? parseColor(value) : null };
  });
  const firstOverlaySurface = darkOverlaySurfaces[0]?.rgb;
  if (!firstOverlaySurface) {
    offenders.push({
      file: GLOBALS,
      line: 1,
      message: "dark: could not resolve --popover for the overlay surface check",
    });
  } else {
    const sameColor = (rgb: typeof firstOverlaySurface) =>
      rgb.r === firstOverlaySurface.r &&
      rgb.g === firstOverlaySurface.g &&
      rgb.b === firstOverlaySurface.b &&
      rgb.a === firstOverlaySurface.a;
    for (const { token, rgb } of darkOverlaySurfaces) {
      if (!rgb || !sameColor(rgb)) {
        offenders.push({
          file: GLOBALS,
          line: 1,
          message: `dark: --${token} must equal --popover (${formatRgb(firstOverlaySurface)}) so every overlay shares one surface`,
        });
      }
    }
  }

  const OVERLAY_EDGE_MAX = 1.22;
  const OVERLAY_DIVIDER_MAX = 1.2;
  const overlayRows: string[] = [];
  for (const { name, tokens } of themes) {
    const surfaceValue = resolveToken(tokens, "overlay-surface-bg");
    const edgeValue = resolveToken(tokens, "overlay-surface-border");
    const dividerValue = resolveToken(tokens, "overlay-divider");
    const surfaceRgb = surfaceValue ? parseColor(surfaceValue) : null;
    const edgeRgb = edgeValue ? parseColor(edgeValue) : null;
    const dividerRgb = dividerValue ? parseColor(dividerValue) : null;

    if (!surfaceRgb || !edgeRgb || !dividerRgb) {
      offenders.push({
        file: GLOBALS,
        line: 1,
        message: `${name}: could not resolve the overlay surface, edge, or divider`,
      });
      continue;
    }

    const edge = contrastRatio(
      mixColor(edgeRgb, surfaceRgb, edgeRgb.a),
      surfaceRgb,
    );
    const divider = contrastRatio(
      mixColor(dividerRgb, surfaceRgb, dividerRgb.a),
      surfaceRgb,
    );

    if (edge > OVERLAY_EDGE_MAX) {
      offenders.push({
        file: GLOBALS,
        line: 1,
        message: `${name}: overlay edge on the overlay surface is ${edge.toFixed(2)}:1 (max ${OVERLAY_EDGE_MAX}:1)`,
      });
    }
    if (divider > OVERLAY_DIVIDER_MAX) {
      offenders.push({
        file: GLOBALS,
        line: 1,
        message: `${name}: overlay divider on the overlay surface is ${divider.toFixed(2)}:1 (max ${OVERLAY_DIVIDER_MAX}:1)`,
      });
    }

    overlayRows.push(
      `${name.padEnd(6)} ${formatRgb(surfaceRgb).padEnd(8)} ${`${edge.toFixed(2)}:1`.padEnd(8)} ${divider.toFixed(2)}:1`,
    );
  }

  console.log("Color-system overlay table");
  console.log("theme  surface  edge    divider");
  console.log(overlayRows.join("\n"));
  console.log("");

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

  const tintedRows: string[] = [];
  for (const { name, tokens } of themes) {
    const cardValue = tokens.get("card");
    const cardRgb = cardValue ? parseColor(cardValue) : null;
    if (!cardRgb) continue;

    for (const { tone, tint, minimum } of TINTED_TEXT_CONTRAST) {
      const inkToken = `${tone}-ink`;
      const fillRgb = parseColor(tokens.get(tone) ?? "");
      const inkRgb = parseColor(tokens.get(inkToken) ?? "");
      if (!fillRgb || !inkRgb) {
        offenders.push({
          file: GLOBALS,
          line: 1,
          message: `${name}: could not resolve --${tone} / --${inkToken} for the tinted-text table`,
        });
        continue;
      }

      const background = mixColor(fillRgb, cardRgb, tint / 100);
      const ratio = contrastRatio(inkRgb, background);
      if (ratio < minimum) {
        offenders.push({
          file: GLOBALS,
          line: 1,
          message: `${name}: --${inkToken} on ${tone}/${tint} over --card is ${ratio.toFixed(2)}:1 (needs ${minimum}:1)`,
        });
      }
      const label = `${name.padEnd(6)} ${`${tone}/${tint}`.padEnd(12)}`;
      tintedRows.push(
        `${label} ${ratio.toFixed(2)}:1 (needs ${minimum}:1)`,
      );
    }
  }

  console.log("Color-system tinted text");
  console.log(tintedRows.join("\n"));
  console.log("");

  const files = await walk(path.join(ROOT, "."), (abs, rel) => {
    if (!/\.(tsx?|mts|cts|css)$/.test(abs)) return false;
    return isScanned(rel);
  });

  for (const abs of files) {
    const rel = normalize(relPath(abs));
    const fileSource = await readText(abs);
    if (!fileSource) continue;
    offenders.push(...auditSource(rel, fileSource));
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

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
