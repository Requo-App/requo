/**
 * Shared lexical term extraction and matching for retrieval.
 *
 * Two callers with different precision needs share this:
 *
 * - Knowledge retrieval (`features/knowledge/retrieval.ts`) uses
 *   `COMMON_STOPWORDS` and `matchedTerms`, which matches on token boundaries.
 * - Pricing retrieval (`features/quote-drafting/pricing-retrieval.ts`) passes its own
 *   stopword set and keeps its substring matching, because that path decides
 *   whether a price may be auto-verified — a behaviour change there is a
 *   liability question, not a retrieval-quality one.
 *
 * The stopword parameter therefore *replaces* the default rather than adding
 * to it, so each caller's effective set is exactly what it declares.
 */

/**
 * Function words only — articles, pronouns, prepositions, auxiliaries and
 * bare adverbs.
 *
 * Deliberately excludes domain vocabulary (`service`, `quote`, `price`,
 * `offer`, `estimate`). Those are common in inquiry text but genuinely
 * meaningful here, so filtering them would trade precision for recall.
 */
export const COMMON_STOPWORDS: ReadonlySet<string> = new Set([
  // Articles, determiners, conjunctions
  "the",
  "and",
  "but",
  "nor",
  "yet",
  "for",
  "this",
  "that",
  "these",
  "those",
  "some",
  "any",
  "all",
  "both",
  "each",
  "every",
  "only",
  "same",
  "such",
  "than",
  "then",
  "very",
  "also",
  "just",
  "even",
  "still",
  "more",
  "most",
  "much",
  "many",
  "other",
  "another",
  // Pronouns
  "you",
  "your",
  "yours",
  "our",
  "ours",
  "they",
  "them",
  "their",
  "theirs",
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "itself",
  "himself",
  "herself",
  "themselves",
  "ourselves",
  "yourself",
  // Prepositions
  "with",
  "without",
  "within",
  "from",
  "into",
  "onto",
  "upon",
  "over",
  "under",
  "about",
  "above",
  "below",
  "between",
  "through",
  "during",
  "before",
  "after",
  "against",
  "toward",
  "towards",
  // Auxiliaries and modals
  "does",
  "have",
  "has",
  "had",
  "been",
  "being",
  "were",
  "will",
  "would",
  "shall",
  "should",
  "could",
  "might",
  "must",
  // Interrogatives and connectives
  "when",
  "where",
  "why",
  "how",
  "here",
  "there",
  "while",
  "because",
  "unless",
  "until",
  "since",
  "though",
  "although",
  "however",
  "therefore",
  "thus",
  "whether",
]);

/** Splits content into lowercase alphanumeric tokens. */
export function tokenize(content: string): Set<string> {
  return new Set(
    content
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/**
 * Extracts the distinctive terms of a query: lowercased, split on
 * non-alphanumerics, at least four characters, stopwords removed, deduped.
 *
 * `stopwords` replaces the default set rather than extending it.
 */
export function significantTerms(
  query: string,
  stopwords: ReadonlySet<string> = COMMON_STOPWORDS,
): string[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 4 && !stopwords.has(term));

  return Array.from(new Set(terms));
}

/**
 * Which of `terms` appear in `content` as whole tokens.
 *
 * Whole-token matching rather than `String.includes`, so "cat" no longer
 * matches "category" or "concatenate" — substring matching produced
 * confident-looking false positives that the score thresholds could not
 * filter out.
 */
export function matchedTerms(content: string, terms: string[]): string[] {
  if (terms.length === 0) {
    return [];
  }

  const tokens = tokenize(content);

  return terms.filter((term) => tokens.has(term));
}

/**
 * Fraction of `terms` present in `content`, in `[0, 1]`. Returns 0 for an
 * empty term list so callers can treat it as "no signal".
 */
export function lexicalMatchScore(content: string, terms: string[]): number {
  if (terms.length === 0) {
    return 0;
  }

  return matchedTerms(content, terms).length / terms.length;
}
