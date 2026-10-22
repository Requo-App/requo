import { beforeEach, describe, expect, it } from "vitest";

import {
  getRecentSearchRecords,
  recordRecentSearchRecord,
} from "@/components/shell/search-recents";

const businessSlug = "acme";
const storageKey = `requo:recent-records:${businessSlug}`;

function seedRecents(records: unknown[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(records));
}

describe("search recents compatibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("maps a legacy product recent onto quote-library", () => {
    seedRecents([
      {
        id: "entry-1",
        type: "product",
        title: "Deck repair",
        subtitle: null,
        href: "/acme/products",
      },
    ]);

    expect(getRecentSearchRecords(businessSlug)).toEqual([
      {
        id: "entry-1",
        type: "quote-library",
        title: "Deck repair",
        subtitle: null,
        href: "/acme/products",
      },
    ]);
  });

  it("drops records with an unknown type instead of rendering no label", () => {
    seedRecents([
      {
        id: "entry-1",
        type: "mystery",
        title: "Unknown",
        subtitle: null,
        href: "/acme/mystery",
      },
    ]);

    expect(getRecentSearchRecords(businessSlug)).toEqual([]);
  });

  it("deduplicates a legacy record when the same entry is recorded again", () => {
    seedRecents([
      {
        id: "entry-1",
        type: "product",
        title: "Deck repair",
        subtitle: null,
        href: "/acme/products",
      },
    ]);

    recordRecentSearchRecord(businessSlug, {
      id: "entry-1",
      type: "quote-library",
      title: "Deck repair",
      subtitle: null,
      href: "/acme/quote-library",
    });

    expect(getRecentSearchRecords(businessSlug)).toEqual([
      {
        id: "entry-1",
        type: "quote-library",
        title: "Deck repair",
        subtitle: null,
        href: "/acme/quote-library",
      },
    ]);
  });
});
