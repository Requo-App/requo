import { describe, expect, it } from "vitest";

import { normalizeServiceSlug } from "@/features/inquiries/service-presets";
import { servicePageSettingsSchema } from "@/features/settings/schemas";
import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";
import {
  appendRandomSlugSuffix,
  publicSlugMaxLength,
  publicSlugRegex,
  slugifyPublicName,
} from "@/lib/slugs";

describe("service slug generation", () => {
  it("produces slugs that satisfy the public slug pattern", () => {
    const names = [
      "Project request",
      "  Deck resurfacing  ",
      "Café renovation",
      "UPPER CASE Service",
      "Multiple   spaces",
      "Trailing hyphen-",
      "-Leading hyphen",
      "123 numeric",
    ];

    for (const name of names) {
      const slug = normalizeServiceSlug(name);

      expect(slug).toMatch(publicSlugRegex);
      expect(slug.length).toBeLessThanOrEqual(publicSlugMaxLength);
    }
  });

  it("never starts or ends with a hyphen", () => {
    for (const name of ["-Leading hyphen", "Trailing hyphen-", "---"]) {
      const slug = normalizeServiceSlug(name);

      expect(slug.startsWith("-")).toBe(false);
      expect(slug.endsWith("-")).toBe(false);
    }
  });

  it("falls back to a usable slug when the name slugifies to nothing", () => {
    const slug = normalizeServiceSlug("!!!");

    expect(slug.length).toBeGreaterThan(0);
    expect(slug).toMatch(publicSlugRegex);
  });

  it("truncates long names without leaving a trailing hyphen", () => {
    const slug = normalizeServiceSlug("a".repeat(200));

    expect(slug.length).toBeLessThanOrEqual(publicSlugMaxLength);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("appends a random suffix that still satisfies the slug pattern", () => {
    const suffixed = appendRandomSlugSuffix("deck-resurfacing");

    expect(suffixed).toMatch(publicSlugRegex);
    expect(suffixed.startsWith("deck-resurfacing")).toBe(true);
    expect(suffixed).not.toBe("deck-resurfacing");
  });

  it("slugifies the same way through the shared helper", () => {
    expect(normalizeServiceSlug("Deck resurfacing")).toBe(
      slugifyPublicName("Deck resurfacing"),
    );
  });
});

describe("service page slug validation", () => {
  const basePayload = {
    name: "Deck resurfacing",
    slug: "deck-resurfacing",
    businessType: "general_project_services" as const,
    publicInquiryEnabled: "true",
    template: "no_supporting_cards",
    mobileLayout: "full",
    showSupportingCards: "false",
    showShowcaseImage: "false",
    showBusinessContact: "true",
    eyebrow: "",
    headline: "Tell us about your deck",
    description: "",
    brandTagline: "",
    formTitle: "Request",
    formDescription: "",
    thankYouMessage: "",
    businessContactPhone: "",
    businessContactEmail: "",
    businessFacebookUrl: "",
    businessInstagramUrl: "",
    businessTwitterXUrl: "",
    businessLinkedinUrl: "",
    showcaseImageUrl: "",
    showcaseImageFrame: "landscape",
    showcaseImageSize: "standard",
    showcaseImageCropX: "0",
    showcaseImageCropY: "0",
    showcaseImageCropZoom: "1",
    cards: "[]",
  };

  it("accepts a normal service slug", () => {
    const result = servicePageSettingsSchema.safeParse(basePayload);

    expect(result.success).toBe(true);
  });

  it("rejects slugs that are only hyphens", () => {
    const result = servicePageSettingsSchema.safeParse({
      ...basePayload,
      slug: "--",
    });

    expect(result.success).toBe(false);
  });

  it("rejects slugs that start or end with a hyphen", () => {
    for (const slug of ["-deck", "deck-"]) {
      const result = servicePageSettingsSchema.safeParse({
        ...basePayload,
        slug,
      });

      expect(result.success).toBe(false);
    }
  });

  it("rejects slugs with characters outside the allowed set", () => {
    const result = servicePageSettingsSchema.safeParse({
      ...basePayload,
      slug: "deck resurfacing!",
    });

    expect(result.success).toBe(false);
  });
});

describe("service public url", () => {
  it("uses the canonical business url for the default service", () => {
    expect(getBusinessPublicInquiryUrl("acme")).toBe("/inquire/acme");
  });

  it("uses the per-service url for a non-default service", () => {
    expect(getBusinessPublicInquiryUrl("acme", "deck")).toBe(
      "/inquire/acme/deck",
    );
  });
});
