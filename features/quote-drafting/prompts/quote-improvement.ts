/**
 * Prompt template for the quote_improvement task — grounded pipeline.
 *
 * Complex task — structured output, system prompt ≤1600 tokens.
 * Context is a pre-assembled text block (inquiry, knowledge evidence,
 * pricing candidates, existing quote draft).
 *
 * The model NEVER authors prices. It returns candidate IDs and match types;
 * the server hydrates actual prices from the pricing library deterministically.
 */
export function buildQuoteImprovementPrompt(contextText: string): string {
  const lines = [
    "Improve the existing quote draft below based on the inquiry context, knowledge evidence, and pricing candidates.",
    "Use a professional tone.",
    "",
    "IMPROVEMENT GOALS:",
    "- Match line items to pricing candidates where the saved draft missed an obvious candidate.",
    "- Improve descriptions: make them clearer and more customer-friendly.",
    "- Add missing items that the inquiry implies but the draft omits.",
    "- Remove irrelevant items not supported by the inquiry.",
    "- Improve structure and ordering for clarity.",
    "",
    "MONETARY RULES (CRITICAL):",
    "- You NEVER set prices. All unitPriceInCents MUST be 0; the server applies prices from the candidates you select.",
    "- For each item, select a pricing candidate id from the \"PRICING CANDIDATES\" section or set pricingCandidateId to null.",
    "- Use matchType \"exact\" only for certain, full coverage. Use \"suggested\" for related-but-uncertain. Use \"none\" when nothing fits.",
    "- Business knowledge and past quotes are context only — never price sources.",
    "- For package candidates, list EACH package line item separately with the same candidate id.",
    "",
    "Output JSON matching this shape:",
    `{`,
    `  "title": "string (2-160 chars)",`,
    `  "notes": "string or null (customer-facing notes)",`,
    `  "rationale": "string or null (what was improved and why, ≤240 chars)",`,
    `  "items": [`,
    `    {`,
    `      "name": "string (≤120 chars)",`,
    `      "description": "string (≤400 chars)",`,
    `      "quantity": "integer ≥ 1",`,
    `      "unitPriceInCents": 0 (ALWAYS 0 — the server prices the item)`,
    `      "pricingCandidateId": "string or null",`,
    `      "pricingItemId": "string or null",`,
    `      "matchType": "exact" | "suggested" | "none",`,
    `      "knowledgeCitationIds": ["chunkId or sourceId strings"],`,
    `      "reason": "string"`,
    `    }`,
    `  ],`,
    `  "missingInfo": [{ "label": "string", "question": "string", "critical": true }],`,
    `  "clarificationMessage": "string or null"`,
    `}`,
    "",
    "Do not wrap in markdown. Return JSON only.",
    "",
    contextText.trim(),
  ];

  return lines.filter(Boolean).join("\n");
}