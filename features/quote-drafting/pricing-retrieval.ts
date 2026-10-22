import "server-only";

import { eq } from "drizzle-orm";

import { significantTerms } from "@/lib/ai/text-terms";
import { db } from "@/lib/db/client";
import { quoteLibraryEntries, quoteLibraryEntryItems } from "@/lib/db/schema";

/**
 * Deterministic pricing candidate retrieval for grounded quote generation.
 *
 * The full pricing library is never string-formatted into a prompt. Instead a
 * small candidate set is selected with normalized lexical matching and sent to
 * the model WITH identifiers and descriptions — but never with authority to
 * author prices. Stage D hydration loads the real price from the database and
 * only ever applies that price.
 *
 * `exact` candidates may be automatically verified. `suggested` candidates
 * require owner confirmation before the quote can be sent.
 */

export type PricingCandidateItem = {
  itemId: string;
  description: string;
  quantity: number;
  unitPriceInCents: number;
};

export type PricingCandidate = {
  entryId: string;
  kind: "block" | "package" | "template";
  name: string;
  description: string | null;
  currency: string;
  matchType: "exact" | "suggested";
  score: number;
  matchedTerms: string[];
  items: PricingCandidateItem[];
  totalInCents: number;
};

export type PricingRetrievalResult = {
  candidates: PricingCandidate[];
  usedPricingLibrary: boolean;
};

export const PRICING_CANDIDATE_MAX = 12;

/**
 * Pricing's own stopword set, passed to the shared extractor as a
 * *replacement* rather than an extension.
 *
 * It adds domain words that are noise on this path (`quote`, `price`,
 * `service`, …) on top of the function words. Because it replaces the shared
 * default instead of extending it, pricing's term selection is byte-identical
 * to what it was before the extractor was shared — which matters, because this
 * path decides whether a price may be auto-verified.
 */
const PRICING_STOPWORDS = new Set([
  "please",
  "need",
  "want",
  "would",
  "could",
  "quote",
  "quotes",
  "price",
  "pricing",
  "cost",
  "estimate",
  "service",
  "services",
  "help",
  "with",
  "for",
  "and",
  "the",
  "our",
  "your",
  "this",
  "that",
  "from",
  "about",
]);

/**
 * Builds the candidate set for a business's inquiry text.
 * Returns empty candidates when the query has no significant terms.
 */
export async function retrievePricingCandidates(input: {
  businessId: string;
  queryText: string;
  currency: string;
  maxEntries?: number;
}): Promise<PricingRetrievalResult> {
  const query = input.queryText.trim();

  if (!query) {
    return { candidates: [], usedPricingLibrary: false };
  }

  const terms = significantTerms(query, PRICING_STOPWORDS);

  if (terms.length === 0) {
    return { candidates: [], usedPricingLibrary: false };
  }

  const maxEntries = Math.min(input.maxEntries ?? PRICING_CANDIDATE_MAX, 25);

  const entries = await db
    .select()
    .from(quoteLibraryEntries)
    .where(eq(quoteLibraryEntries.businessId, input.businessId))
    .orderBy(quoteLibraryEntries.createdAt);

  const entryItems = await db
    .select({
      id: quoteLibraryEntryItems.id,
      entryId: quoteLibraryEntryItems.entryId,
      description: quoteLibraryEntryItems.description,
      quantity: quoteLibraryEntryItems.quantity,
      unitPriceInCents: quoteLibraryEntryItems.unitPriceInCents,
      position: quoteLibraryEntryItems.position,
    })
    .from(quoteLibraryEntryItems)
    .where(
      eq(quoteLibraryEntryItems.businessId, input.businessId),
    );

  const itemsByEntry = new Map<string, typeof entryItems>();
  for (const item of entryItems) {
    const list = itemsByEntry.get(item.entryId) ?? [];
    list.push(item);
    itemsByEntry.set(item.entryId, list);
  }

  const scored: Array<{
    candidate: Omit<PricingCandidate, "matchType">;
    matchType: "exact" | "suggested";
  }> = [];

  for (const entry of entries) {
    // Candidate currency must match the business currency exactly. No
    // automatic conversion, ever.
    if (entry.currency !== input.currency) {
      continue;
    }

    const items = (itemsByEntry.get(entry.id) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);

    const nameText = entry.name.toLowerCase();
    const descriptionText = (entry.description ?? "").toLowerCase();
    const itemsText = items
      .map((item) => item.description.toLowerCase())
      .join(" ");
    const searchableText = `${nameText} ${descriptionText} ${itemsText}`;

    const matchedTerms = terms.filter((term) =>
      searchableText.includes(term),
    );
    const nameMatchedTerms = terms.filter((term) =>
      nameText.includes(term),
    );

    if (matchedTerms.length === 0) {
      continue;
    }

    const score = matchedTerms.length / terms.length;
    const nameCoverage = nameMatchedTerms.length / terms.length;

    const singleTermExact =
      terms.length === 1 && nameMatchedTerms.length === 1;
    const fullCoverageExact =
      score === 1 && (nameMatchedTerms.length >= 1 || terms.length >= 2);
    const partialNameExact =
      nameCoverage >= 0.5 && matchedTerms.length >= 2;

    let matchType: "exact" | "suggested" | null = null;

    if (singleTermExact || fullCoverageExact || partialNameExact) {
      matchType = "exact";
    } else if (
      score >= 0.2 ||
      (matchedTerms.length === 1 && nameMatchedTerms.length === 1)
    ) {
      matchType = "suggested";
    }

    if (!matchType) {
      continue;
    }

    scored.push({
      candidate: {
        entryId: entry.id,
        kind: entry.kind,
        name: entry.name,
        description: entry.description,
        currency: entry.currency,
        score,
        matchedTerms,
        items: items.map((item) => ({
          itemId: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPriceInCents: item.unitPriceInCents,
        })),
        totalInCents: items.reduce(
          (sum, item) =>
            sum + item.unitPriceInCents * Math.max(1, item.quantity),
          0,
        ),
      },
      matchType,
    });
  }

  if (scored.length === 0) {
    return { candidates: [], usedPricingLibrary: false };
  }

  scored.sort((a, b) => {
    // Exact matches first, then by score descending.
    if (a.matchType !== b.matchType) {
      return a.matchType === "exact" ? -1 : 1;
    }

    return b.candidate.score - a.candidate.score || a.candidate.name.localeCompare(b.candidate.name);
  });

  const candidates: PricingCandidate[] = scored
    .slice(0, maxEntries)
    .map(({ candidate, matchType }) => ({ ...candidate, matchType }));

  return {
    candidates,
    usedPricingLibrary: candidates.length > 0,
  };
}

/**
 * Formats pricing candidates for the prompt with identifiers attached.
 * Prices ARE included here — the model is allowed to see them — but the
 * model is never trusted to author prices: Stage D hydration reapplies the
 * saved price from the database.
 */
export function formatPricingCandidates(
  candidates: PricingCandidate[],
): string {
  if (candidates.length === 0) {
    return "- No pricing candidates match this inquiry.";
  }

  return candidates
    .map((candidate) => {
      const itemLines = candidate.items.length
        ? candidate.items
            .map(
              (item) =>
                `  [${candidate.entryId}:${item.itemId}] ${item.description} x${item.quantity} @ ${item.unitPriceInCents}c`,
            )
            .join("\n")
        : "  (no line items)";

      return `- [${candidate.matchType.toUpperCase()}] [${candidate.entryId}] "${candidate.name}" (${candidate.kind}, ${candidate.currency}, total ${candidate.totalInCents}c)${
        candidate.description ? ` — ${candidate.description}` : ""
      }\n${itemLines}`;
    })
    .join("\n");
}

/**
 * Resolves a model-selected candidate to its canonical entry + item, applying
 * the DB price. Returns null when the ids are unknown or the match type is
 * weaker than the candidate's verified eligibility.
 */
export function resolvePricingCandidate(input: {
  candidates: PricingCandidate[];
  entryId: string | null;
  itemId: string | null;
  claimedMatchType: "exact" | "suggested" | "none" | null;
  currency: string;
}): {
  entry: PricingCandidate;
  item: PricingCandidateItem | null;
  verified: boolean;
  reason: string;
} | null {
  const { candidates, entryId, itemId, claimedMatchType, currency } = input;

  if (!entryId) {
    return null;
  }

  const entry = candidates.find(
    (candidate) =>
      candidate.entryId === entryId && candidate.currency === currency,
  );

  if (!entry) {
    return null;
  }

  // A model may only claim "exact" when the candidate retrieval classified
  // the entry as exact. Anything else is at best suggested.
  const candidateExact = entry.matchType === "exact";

  if (claimedMatchType === "exact" && !candidateExact) {
    return {
      entry,
      item: null,
      verified: false,
      reason: "Exact match claimed but the candidate was only a suggestion.",
    };
  }

  if (claimedMatchType === "none" || claimedMatchType === null) {
    return {
      entry,
      item: null,
      verified: false,
      reason: "No pricing candidate selected for this line item.",
    };
  }

  const item = itemId
    ? entry.items.find((candidateItem) => candidateItem.itemId === itemId)
    : null;

  // Single-item blocks are implicitly resolved to their one item.
  const resolvedItem =
    item ?? (entry.items.length === 1 ? entry.items[0] : null);

  const verified = candidateExact && claimedMatchType === "exact" && Boolean(resolvedItem);

  return {
    entry,
    item: resolvedItem,
    verified,
    reason: verified
      ? `Verified from "${entry.name}" (${entry.kind}).`
      : `Suggested from "${entry.name}" (${entry.kind}); owner confirmation required.`,
  };
}