import { describe, expect, it } from "vitest";

import { filterAiOutput } from "@/lib/ai/output-filter";

/**
 * The output filter redacts the *system prompt text* it is given. It must
 * never be handed schema field names: the grounded quote draft asks the
 * model for `matchType` and `unitPriceInCents`, and redacting those keys
 * silently strips the price from every drafted line item.
 */
describe("filterAiOutput", () => {
  const instructionFragments = [
    "MONETARY RULES (CRITICAL",
    "You NEVER set prices",
    "PACKAGE RULES:",
  ];

  it("leaves structured JSON field names intact", () => {
    const payload = JSON.stringify({
      items: [
        {
          description: "Storefront sign",
          quantity: 1,
          unitPriceInCents: 0,
          pricingCandidateId: "entry-1",
          matchType: "exact",
        },
      ],
    });

    const result = filterAiOutput(payload, instructionFragments, {});

    expect(result.status).toBe("clean");
    expect(result.output).toContain('"matchType":"exact"');
    expect(result.output).toContain('"unitPriceInCents":0');
    expect(result.output).toContain('"pricingCandidateId":"entry-1"');
  });

  it("still redacts leaked instruction text", () => {
    const result = filterAiOutput(
      "MONETARY RULES (CRITICAL - READ CAREFULLY): you never set prices.",
      instructionFragments,
      {},
    );

    expect(result.status).toBe("redacted");
    expect(result.output).not.toContain("MONETARY RULES");
  });

  it("does not redact a field name that merely appears in the payload", () => {
    const result = filterAiOutput(
      JSON.stringify({ note: "matchType is not a price" }),
      instructionFragments,
      {},
    );

    expect(result.status).toBe("clean");
    expect(result.output).toContain("matchType is not a price");
  });
});
