/**
 * Whether a heading is a numbered top-level section. Letter-suffixed headings
 * such as `5A. Billing` are excluded from the table of contents.
 */
export function isNumberedLegalHeading(text: string): boolean {
  return /^\d+\.\s/.test(text);
}

/**
 * Build a stable kebab-case anchor from legal-section heading text.
 *
 * The leading section number is metadata, not part of the anchor, so
 * `4. Data Retention` becomes `data-retention`. Punctuation is dropped and
 * repeated separators collapse into one hyphen.
 */
export function toLegalHeadingId(text: string): string {
  return text
    .replace(/^\s*\d+[a-z]?\s*[.)]\s*/i, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Turn the page's section titles into unique heading ids. Duplicate titles
 * receive `-2`, `-3`, … suffixes without changing the first occurrence.
 */
export function toLegalHeadingIds(titles: readonly string[]): string[] {
  const seen = new Map<string, number>();

  return titles.map((title, index) => {
    const base = toLegalHeadingId(title) || `section-${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);

    return count === 0 ? base : `${base}-${count + 1}`;
  });
}
