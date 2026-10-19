import { describe, expect, it } from "vitest";

import {
  isAnalyticsTab,
  resolveAnalyticsWindow,
  type AnalyticsWindow,
} from "@/features/analytics/lib/window";

const NOW = new Date("2026-06-15T12:00:00Z");

const iso = (date: Date) => date.toISOString().slice(0, 10);

function days(window: AnalyticsWindow) {
  return (window.until.getTime() - window.since.getTime()) / 86_400_000;
}

describe("features/analytics/lib/window", () => {
  describe("isAnalyticsTab", () => {
    it("accepts known tabs and rejects anything else", () => {
      expect(isAnalyticsTab("overview")).toBe(true);
      expect(isAnalyticsTab("team")).toBe(true);
      expect(isAnalyticsTab("advanced")).toBe(false);
      expect(isAnalyticsTab(null)).toBe(false);
    });
  });

  describe("free plan", () => {
    it("always resolves the fixed last-30-days window", () => {
      const window = resolveAnalyticsWindow({
        plan: "free",
        range: "12m",
        from: "2020-01-01",
        to: "2020-02-01",
        now: NOW,
      });

      expect(window.preset).toBe("30d");
      expect(iso(window.since)).toBe("2026-05-17");
      expect(iso(window.until)).toBe("2026-06-16");
      expect(window.label).toBe("Last 30 days");
      expect(window.comparison).toBeNull();
    });
  });

  describe("preset ranges", () => {
    it("resolves 7/30/90-day windows with daily vs weekly buckets", () => {
      const week = resolveAnalyticsWindow({ plan: "pro", range: "7d", now: NOW });
      expect(iso(week.since)).toBe("2026-06-09");
      expect(days(week)).toBe(7);
      expect(week.bucket).toBe("day");

      const quarter = resolveAnalyticsWindow({ plan: "pro", range: "90d", now: NOW });
      expect(iso(quarter.since)).toBe("2026-03-18");
      expect(quarter.bucket).toBe("week");
    });

    it("resolves 12 months from the first of the month", () => {
      const window = resolveAnalyticsWindow({ plan: "pro", range: "12m", now: NOW });
      expect(iso(window.since)).toBe("2025-07-01");
      expect(window.bucket).toBe("month");
      expect(window.label).toBe("Last 12 months");
    });

    it("enables a prior equal-length window by default", () => {
      const window = resolveAnalyticsWindow({ plan: "pro", range: "30d", now: NOW });
      expect(window.comparison).not.toBeNull();
      expect(iso(window.comparison!.since)).toBe("2026-04-17");
      expect(iso(window.comparison!.until)).toBe("2026-05-17");
    });

    it("drops the comparison when compare=0 or the range is all-time", () => {
      expect(
        resolveAnalyticsWindow({ plan: "pro", range: "30d", compare: "0", now: NOW })
          .comparison,
      ).toBeNull();
      expect(
        resolveAnalyticsWindow({ plan: "business", range: "all", now: NOW }).comparison,
      ).toBeNull();
    });

    it("defaults to 30 days for unknown ranges", () => {
      const window = resolveAnalyticsWindow({ plan: "pro", range: "bogus", now: NOW });
      expect(window.preset).toBe("30d");
      expect(iso(window.since)).toBe("2026-05-17");
    });
  });

  describe("all time", () => {
    it("caps Pro at 24 months and says so", () => {
      const window = resolveAnalyticsWindow({
        plan: "pro",
        range: "all",
        now: NOW,
        earliest: new Date("2020-02-03T00:00:00Z"),
      });

      expect(iso(window.since)).toBe("2024-06-01");
      expect(window.clamped).toBe(true);
      expect(window.cappedAllTime).toBe(true);
      expect(window.label).toBe("Last 24 months");
    });

    it("lets Business reach the earliest record", () => {
      const window = resolveAnalyticsWindow({
        plan: "business",
        range: "all",
        now: NOW,
        earliest: new Date("2019-03-05T00:00:00Z"),
      });

      expect(iso(window.since)).toBe("2019-03-05");
      expect(window.clamped).toBe(false);
      expect(window.label).toBe("All time");
    });
  });

  describe("custom ranges", () => {
    it("uses the requested dates and labels them", () => {
      const window = resolveAnalyticsWindow({
        plan: "pro",
        range: "custom",
        from: "2026-05-01",
        to: "2026-05-31",
        now: NOW,
      });

      expect(window.preset).toBe("custom");
      expect(iso(window.since)).toBe("2026-05-01");
      expect(iso(window.until)).toBe("2026-06-01");
      expect(window.label).toBe("May 1 – May 31, 2026");
      expect(window.bucket).toBe("day");
    });

    it("falls back to 30 days when the dates are missing or reversed", () => {
      for (const input of [
        { from: null, to: null },
        { from: "2026-06-10", to: "2026-06-01" },
      ]) {
        const window = resolveAnalyticsWindow({
          plan: "pro",
          range: "custom",
          ...input,
          now: NOW,
        });
        expect(window.preset).toBe("30d");
        expect(iso(window.since)).toBe("2026-05-17");
      }
    });

    it("clamps Pro custom starts to the 24-month floor", () => {
      const window = resolveAnalyticsWindow({
        plan: "pro",
        range: "custom",
        from: "2024-01-01",
        to: "2024-07-01",
        now: NOW,
      });

      expect(iso(window.since)).toBe("2024-06-01");
      expect(window.clamped).toBe(true);
    });

    it("never includes days after today", () => {
      const window = resolveAnalyticsWindow({
        plan: "pro",
        range: "custom",
        from: "2026-06-01",
        to: "2026-07-15",
        now: NOW,
      });

      expect(iso(window.until)).toBe("2026-06-16");
      expect(window.label).toBe("Jun 1 – Jun 15, 2026");
    });
  });
});
