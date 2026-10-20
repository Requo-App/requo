/**
 * SQL `LIKE` / `ILIKE` pattern helpers.
 *
 * A search term is untrusted text: `%` and `_` are wildcards, so a raw term
 * would turn a literal search into a pattern. The term is escaped and the
 * pattern is matched with an explicit `ESCAPE '\'`.
 */

/** Escapes the wildcards in a user-supplied search term. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Wraps an escaped search term in the surrounding wildcards. */
export function likePattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}
