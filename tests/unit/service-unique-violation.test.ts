import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/billing/subscription-service", () => ({}));

import { isUniqueViolation } from "@/features/settings/service-limits";

describe("isUniqueViolation", () => {
  it("recognizes direct and wrapped Postgres unique violations", () => {
    const violation = { code: "23505" };

    expect(isUniqueViolation(violation)).toBe(true);
    expect(isUniqueViolation(new Error("Drizzle query failed", { cause: violation }))).toBe(true);
    expect(isUniqueViolation({ code: "OTHER", cause: { cause: violation } })).toBe(true);
  });

  it("inspects at most five objects in the cause chain", () => {
    let error: unknown = { code: "23505" };
    for (let index = 0; index < 4; index += 1) {
      error = { cause: error };
    }

    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation({ cause: error })).toBe(false);
  });

  it.each([null, undefined, "23505", 23505, false, {}, { code: 23505 }, { code: "23503" }, { cause: "23505" }])(
    "rejects invalid or unrelated errors: %j",
    (error) => {
      expect(isUniqueViolation(error)).toBe(false);
    },
  );

  it("terminates for cyclic causes", () => {
    const error: { cause?: unknown } = {};
    error.cause = error;

    expect(isUniqueViolation(error)).toBe(false);
  });
});
