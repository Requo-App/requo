import { describe, expect, it } from "vitest";

import { parseBusinessServiceNames } from "@/features/businesses/schemas";

describe("business service names", () => {
  it("keeps valid names beyond the first ten entries", () => {
    const names = Array.from({ length: 12 }, (_, index) => ({
      name: ` Service ${index + 1} `,
    }));
    const input = [null, { name: "" }, ...names];

    expect(parseBusinessServiceNames(JSON.stringify(input))).toEqual(
      names.map(({ name }) => ({ name: name.trim() })),
    );
  });

  it("uses the fallback when no valid service was supplied", () => {
    expect(parseBusinessServiceNames(JSON.stringify([null, { name: "" }]))).toEqual([
      { name: "" },
    ]);
  });
});
