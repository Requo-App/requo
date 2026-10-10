#!/usr/bin/env tsx
/**
 * Audit: raw `<img>` usage
 *
 * Flags any raw `<img ` tag under `app/**` and `components/**` outside of
 * email templates, opengraph/twitter image modules, and `ImageResponse`
 * content. All public-route images should go through `<Image>` from
 * `next/image`.
 *
 * Exits 0 on no violations, 1 on violations.
 *
 * Usage: npx tsx scripts/audit-image-usage.ts
 */

import fs from "node:fs";
import path from "node:path";

import { isDesignSystemFile } from "./audit-lib";

const ROOT = process.cwd();
const SCAN_DIRS = [path.join(ROOT, "app"), path.join(ROOT, "components")];

const SKIP_FILE_PATTERNS = [
  /[/\\]features[/\\]email[/\\]/,
  /[/\\]templates[/\\]emails[/\\]/,
  /[/\\]opengraph-image\.tsx$/,
  /[/\\]twitter-image\.tsx$/,
  // Shared ImageResponse content used only by opengraph/twitter modules,
  // where plain <img> is required (next/image does not render in
  // ImageResponse).
  /[/\\]seo[/\\]social-preview-image\.tsx$/,
];

/** Design-system-owned files are exempt like the email/og-image modules above. */
function isBoardUiTree(file: string): boolean {
  // Transitional: the legacy trees still exist until the follow-up migration
  // commit removes them; keep their exemptions alongside the shared allowlist.
  return (
    isDesignSystemFile(path.relative(ROOT, file)) ||
    file.includes("components" + path.sep + "base" + path.sep) ||
    file.includes("components" + path.sep + "application" + path.sep)
  );
}

type Offender = {
  file: string;
  line: number;
};

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function shouldSkip(file: string): boolean {
  return SKIP_FILE_PATTERNS.some((re) => re.test(file));
}

function findRawImgTags(file: string): Offender[] {
  const source = fs.readFileSync(file, "utf8");
  const offenders: Offender[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Match `<img` as a JSX tag opener (followed by whitespace, `>`, or `/`).
    if (/<img[\s>/]/.test(line)) {
      offenders.push({
        file: path.relative(ROOT, file),
        line: i + 1,
      });
    }
  }
  return offenders;
}

function main(): number {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(dir, files);

  const offenders: Offender[] = [];
  for (const file of files) {
    if (shouldSkip(file)) continue;
    if (isBoardUiTree(file)) continue;
    offenders.push(...findRawImgTags(file));
  }

  if (offenders.length === 0) {
    console.log("audit-image-usage: OK (no raw <img> tags)");
    return 0;
  }

  console.error(`audit-image-usage: ${offenders.length} raw <img> tag(s)`);
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  use <Image> from next/image`);
  }
  return 1;
}

process.exit(main());
