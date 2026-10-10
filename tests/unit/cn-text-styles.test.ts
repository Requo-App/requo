import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn() custom typography merging", () => {
  it("keeps a custom typography class alongside a text-color utility", () => {
    expect(cn("text-body-medium", "text-red-500")).toBe(
      "text-body-medium text-red-500",
    );
  });

  it("keeps typography and color regardless of input order", () => {
    expect(cn("text-red-500", "text-body-medium")).toBe(
      "text-red-500 text-body-medium",
    );
    expect(cn("text-body-medium", "text-foreground")).toBe(
      "text-body-medium text-foreground",
    );
  });

  it("applies last-class-wins between conflicting custom typography sizes", () => {
    expect(cn("text-body-medium", "text-body-regular")).toBe(
      "text-body-regular",
    );
    expect(cn("text-caption-1-medium", "text-body-medium")).toBe(
      "text-body-medium",
    );
  });

  it("retains last-class-wins for standard font-size utilities", () => {
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
    expect(cn("text-body-medium", "text-sm")).toBe("text-sm");
  });

  it("merges unrelated conflicting utilities normally", () => {
    expect(cn("px-4", "px-2")).toBe("px-2");
    expect(cn("flex", "grid")).toBe("grid");
  });

  it("keeps unrelated classes, modifiers, and conditional inputs intact", () => {
    expect(
      cn("text-body-medium", "hover:text-red-500", false && "hidden", "mt-1"),
    ).toBe("text-body-medium hover:text-red-500 mt-1");
  });
});
