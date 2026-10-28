import { describe, expect, it } from "vitest";

import {
  isNumberedLegalHeading,
  toLegalHeadingId,
  toLegalHeadingIds,
} from "@/features/legal/heading-id";

describe("legal heading ids", () => {
  it("includes only numbered top-level sections in the table of contents", () => {
    expect(isNumberedLegalHeading("1. Overview")).toBe(true);
    expect(isNumberedLegalHeading("12. Children, Changes, And Contact")).toBe(
      true,
    );
    expect(isNumberedLegalHeading("5A. Billing And Payment Information")).toBe(
      false,
    );
    expect(isNumberedLegalHeading("Overview")).toBe(false);
  });

  it("strips the leading number and punctuation from a heading", () => {
    expect(toLegalHeadingId("4. Data Retention")).toBe("data-retention");
    expect(toLegalHeadingId("5A. Billing And Payment Information")).toBe(
      "billing-and-payment-information",
    );
    expect(
      toLegalHeadingId(
        "4. Standard Contractual Clauses (Module 2: Controller-to-Processor)",
      ),
    ).toBe("standard-contractual-clauses-module-2-controller-to-processor");
  });

  it("removes apostrophes and collapses punctuation into single hyphens", () => {
    expect(
      toLegalHeadingId("22. Children’s Privacy And Policy Changes"),
    ).toBe("childrens-privacy-and-policy-changes");
    expect(toLegalHeadingId("Accounts, Authentication, And Security")).toBe(
      "accounts-authentication-and-security",
    );
  });

  it("keeps the first slug and suffixes later duplicates", () => {
    expect(
      toLegalHeadingIds([
        "1. Overview",
        "2. Overview",
        "3. Overview",
        "4. Contact",
      ]),
    ).toEqual(["overview", "overview-2", "overview-3", "contact"]);
  });
});
