import { describe, expect, it } from "vitest";

import { averageWonInCents } from "@/features/analytics/lib/kpi";

describe("averageWonInCents", () => {
  it("divides the won value by the quotes won", () => {
    expect(averageWonInCents(300_000, 3)).toBe(100_000);
  });

  it("rounds to whole cents", () => {
    expect(averageWonInCents(100_000, 3)).toBe(33_333);
  });

  it("reads as zero when nothing was won", () => {
    expect(averageWonInCents(0, 0)).toBe(0);
    expect(averageWonInCents(500_000, 0)).toBe(0);
  });

  it("does not divide by a negative count", () => {
    expect(averageWonInCents(500_000, -1)).toBe(0);
  });
});
