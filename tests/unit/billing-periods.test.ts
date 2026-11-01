import { describe, expect, it } from "vitest";

import { addBillingInterval, getPrepaidTermStart } from "@/lib/billing/periods";

describe("addBillingInterval", () => {
  it("advances a monthly term by one calendar month", () => {
    expect(
      addBillingInterval(new Date("2026-11-01T09:30:00.000Z"), "monthly"),
    ).toEqual(new Date("2026-12-01T09:30:00.000Z"));
  });

  it("clamps the day to the end of a shorter month", () => {
    expect(
      addBillingInterval(new Date("2026-01-31T09:30:00.000Z"), "monthly"),
    ).toEqual(new Date("2026-02-28T09:30:00.000Z"));

    expect(
      addBillingInterval(new Date("2028-01-31T09:30:00.000Z"), "monthly"),
    ).toEqual(new Date("2028-02-29T09:30:00.000Z"));
  });

  it("clamps a leap-day yearly term to the next February 28", () => {
    expect(
      addBillingInterval(new Date("2028-02-29T09:30:00.000Z"), "yearly"),
    ).toEqual(new Date("2029-02-28T09:30:00.000Z"));
  });

  it("preserves the time of day across a yearly term", () => {
    expect(
      addBillingInterval(new Date("2026-11-01T23:45:12.345Z"), "yearly"),
    ).toEqual(new Date("2027-11-01T23:45:12.345Z"));
  });
});

describe("getPrepaidTermStart", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");

  it("extends an active term from its current end", () => {
    expect(
      getPrepaidTermStart(new Date("2026-12-01T00:00:00.000Z"), now),
    ).toEqual(new Date("2026-12-01T00:00:00.000Z"));
  });

  it("starts now when the previous term already ended or is missing", () => {
    expect(
      getPrepaidTermStart(new Date("2026-10-01T00:00:00.000Z"), now),
    ).toEqual(now);
    expect(getPrepaidTermStart(null, now)).toEqual(now);
  });
});
