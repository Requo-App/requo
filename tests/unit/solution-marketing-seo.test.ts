import { describe, expect, it } from "vitest";

import {
  solutionDetails,
  solutionLinks,
} from "@/components/marketing/solutions-data";

const titleSuffix = " | Requo";

function parseUsd(value: string) {
  return Number(value.replace(/[^\d.]/g, ""));
}

describe("solution marketing SEO", () => {
  it("keeps every solution title and description unique and snippet-sized", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();

    for (const link of solutionLinks) {
      const detail = solutionDetails[link.slug];
      if (!detail) {
        throw new Error(`Missing solution detail for ${link.slug}`);
      }

      expect(detail.seoTitle.length + titleSuffix.length).toBeLessThanOrEqual(60);
      expect(detail.seoTitle).not.toContain(titleSuffix);
      expect(detail.seoDescription.length).toBeGreaterThanOrEqual(120);
      expect(detail.seoDescription.length).toBeLessThanOrEqual(160);
      expect(titles.has(detail.seoTitle)).toBe(false);
      expect(descriptions.has(detail.seoDescription)).toBe(false);
      titles.add(detail.seoTitle);
      descriptions.add(detail.seoDescription);
    }
  });

  it("keeps every landing page on the full workflow and FAQ structure", () => {
    for (const link of solutionLinks) {
      const detail = solutionDetails[link.slug];
      if (!detail) {
        throw new Error(`Missing solution detail for ${link.slug}`);
      }
      const landing = detail.landing;
      if (!landing) {
        throw new Error(`Missing landing content for ${link.slug}`);
      }

      expect(landing.linkCards).toHaveLength(3);
      expect(landing.workflowSteps).toHaveLength(5);
      expect(detail.faqs.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps every sample quote total equal to its line items", () => {
    for (const link of solutionLinks) {
      const landing = solutionDetails[link.slug]?.landing;
      if (!landing) {
        throw new Error(`Missing landing content for ${link.slug}`);
      }

      const lineItemTotal = landing.sample.lineItems.reduce(
        (total, item) => total + parseUsd(item.value),
        0,
      );
      expect(lineItemTotal).toBe(parseUsd(landing.sample.total));
    }
  });
});
