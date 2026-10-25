import { describe, expect, it } from "vitest";

import {
  formatDays,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPercentValue,
  formatPoints,
  formatRangeLabel,
  formatRelativeDelta,
  formatSpeedDelta,
  getDeltaSentiment,
} from "@/features/analytics/format";

/** `formatMoney` groups with a non-breaking space in some ICU versions. */
const nbspSafe = (value: string) => value.replace(/\u00a0/g, " ");

describe("features/analytics/format", () => {
  describe("money", () => {
    it("formats whole currency units from cents", () => {
      expect(nbspSafe(formatMoney(123456, "USD"))).toBe("$1,235");
      expect(nbspSafe(formatMoney(0, "USD"))).toBe("$0");
    });

    it("formats compact values for chart axes", () => {
      expect(nbspSafe(formatMoney(1234567, "USD", { compact: true }))).toBe("$12.3K");
    });

    it("reads a missing amount as an em dash", () => {
      expect(formatMoney(null, "USD")).toBe("—");
      expect(formatMoney(undefined, "USD")).toBe("—");
      expect(formatMoney(Number.NaN, "USD")).toBe("—");
    });
  });

  describe("numbers and rates", () => {
    it("formats counts with grouping", () => {
      expect(formatNumber(12345)).toBe("12,345");
      expect(formatNumber(0)).toBe("0");
    });

    it("reads a missing count as an em dash", () => {
      expect(formatNumber(null)).toBe("—");
      expect(formatNumber(Number.NaN)).toBe("—");
    });

    it("formats 0–1 rates as percents", () => {
      expect(formatPercent(0.424)).toBe("42.4%");
      expect(formatPercent(0.5)).toBe("50%");
      expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("—");
    });

    it("formats already-scaled percents", () => {
      expect(formatPercentValue(4.15)).toBe("4.2%");
    });
  });

  describe("durations", () => {
    it("renders sub-hour, hour, and day scales", () => {
      expect(formatDuration(0.5)).toBe("30 min");
      expect(formatDuration(3.2)).toBe("3.2h");
      expect(formatDuration(58)).toBe("2.4d");
      expect(formatDuration(null)).toBe("—");
    });

    it("formats days with one decimal", () => {
      expect(formatDays(3.14)).toBe("3.1d");
      expect(formatDays(null)).toBe("—");
    });
  });

  describe("range labels", () => {
    it("collapses same-year ranges", () => {
      expect(
        formatRangeLabel(
          new Date("2026-05-01T00:00:00Z"),
          new Date("2026-06-01T00:00:00Z"),
        ),
      ).toBe("May 1 – May 31, 2026");
    });

    it("keeps both years when the range crosses one", () => {
      expect(
        formatRangeLabel(
          new Date("2025-12-20T00:00:00Z"),
          new Date("2026-01-05T00:00:00Z"),
        ),
      ).toBe("Dec 20, 2025 – Jan 4, 2026");
    });
  });

  describe("deltas", () => {
    it("labels relative changes and their direction", () => {
      expect(formatRelativeDelta(120, 100)).toEqual({ label: "+20%", direction: "up" });
      expect(formatRelativeDelta(80, 100)).toEqual({ label: "−20%", direction: "down" });
      expect(formatRelativeDelta(100, 100)).toEqual({ label: "No change", direction: "flat" });
    });

    it("falls back to an absolute value when the prior period is zero", () => {
      expect(formatRelativeDelta(6_163, 0, (value) => `$${value.toLocaleString()}`)).toEqual({
        label: "+$6,163",
        direction: "up",
      });
      expect(formatRelativeDelta(6_163, 0)).toEqual({ label: "New", direction: "up" });
    });

    it("rounds sub-1% moves to no change", () => {
      expect(formatRelativeDelta(1000, 1004)).toEqual({ label: "No change", direction: "flat" });
    });

    it("uses percentage points for rate moves", () => {
      expect(formatPoints(0.6, 0.5)).toEqual({ label: "+10 pts", direction: "up" });
      expect(formatPoints(0.5, 0.6)).toEqual({ label: "−10 pts", direction: "down" });
      expect(formatPoints(0.5, 0.5)).toEqual({ label: "No change", direction: "flat" });
    });

    it("phrases speed moves for lower-is-better metrics", () => {
      expect(formatSpeedDelta(2, 3)).toEqual({ label: "33% faster", direction: "down" });
      expect(formatSpeedDelta(4, 3)).toEqual({ label: "33% slower", direction: "up" });
      expect(formatSpeedDelta(null, 3)).toEqual({ label: "No data yet", direction: "flat" });
      expect(formatSpeedDelta(2, null)).toEqual({ label: "No prior data", direction: "flat" });
    });

    it("never divides by a zero baseline", () => {
      expect(formatSpeedDelta(2, 0)).toEqual({
        label: "No prior baseline",
        direction: "flat",
      });
      expect(formatSpeedDelta(0, 0)).toEqual({ label: "No change", direction: "flat" });
    });

    it("maps direction to sentiment, with inversion for lower-is-better", () => {
      expect(getDeltaSentiment("up")).toBe("positive");
      expect(getDeltaSentiment("down")).toBe("negative");
      expect(getDeltaSentiment("flat")).toBe("neutral");
      expect(getDeltaSentiment("down", true)).toBe("positive");
      expect(getDeltaSentiment("up", true)).toBe("negative");
    });
  });
});
