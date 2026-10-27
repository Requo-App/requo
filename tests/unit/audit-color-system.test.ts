import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  auditSource,
  contrastRatio,
  mixColor,
  neutralProblems,
  parseColor,
  parseTokenBlock,
} from "../../scripts/audit-color-system";

const globals = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("colour-system audit", () => {
  it("rejects both warm and blue casts in neutral tokens", () => {
    const warm = parseColor("#fffff0");
    const blue = parseColor("#f5f5ff");
    const neutral = parseColor("#f5f5f7");

    expect(warm).not.toBeNull();
    expect(blue).not.toBeNull();
    expect(neutral).not.toBeNull();
    expect(neutralProblems("warm", warm!).join(" ")).toContain("warm cast");
    expect(neutralProblems("blue", blue!).join(" ")).toContain("slate-blue cast");
    expect(neutralProblems("neutral", neutral!)).toEqual([]);
  });

  it("rejects raw black/white utilities beyond backgrounds", () => {
    for (const utility of [
      "text-white",
      "border-white/20",
      "border-t-black",
      "ring-black",
      "fill-white",
      "placeholder-black/40",
    ]) {
      expect(
        auditSource("components/example.tsx", `<div className="${utility}" />`),
        utility,
      ).toEqual([
        expect.objectContaining({
          line: 1,
          message: expect.stringContaining(utility),
        }),
      ]);
    }
  });

  it("rejects ink tokens used as fills", () => {
    expect(
      auditSource("components/example.tsx", '<div className="bg-primary-ink" />'),
    ).toEqual([
      expect.objectContaining({
        line: 1,
        message: expect.stringContaining("bg-primary-ink"),
      }),
    ]);
    expect(
      auditSource("components/example.tsx", '<div className="from-warning-ink/20" />'),
    ).toHaveLength(1);
  });

  it("allows only the exact static literals in mixed files", () => {
    expect(
      auditSource(
        "features/auth/components/social-auth-buttons.tsx",
        '<path fill="#4285F4" />',
      ),
    ).toEqual([]);
    expect(
      auditSource(
        "features/auth/components/social-auth-buttons.tsx",
        '<path fill="#00ff00" />',
      ),
    ).toHaveLength(1);

    expect(
      auditSource(
        "features/settings/components/services-list.tsx",
        'ctx.fillStyle = "#ffffff";',
      ),
    ).toEqual([]);
    expect(
      auditSource(
        "features/settings/components/services-list.tsx",
        'ctx.fillStyle = "#000000";',
      ),
    ).toHaveLength(1);
  });

  it("keeps warning text above AA on its tinted surfaces", () => {
    for (const selector of [":root", ".dark"]) {
      const tokens = parseTokenBlock(globals, selector);
      const card = parseColor(tokens.get("card") ?? "");
      const warning = parseColor(tokens.get("warning") ?? "");
      const warningInk = parseColor(tokens.get("warning-ink") ?? "");

      expect(card, `${selector} card`).not.toBeNull();
      expect(warning, `${selector} warning`).not.toBeNull();
      expect(warningInk, `${selector} warning-ink`).not.toBeNull();

      for (const tint of [0.1, 0.15]) {
        const background = mixColor(warning!, card!, tint);
        expect(
          contrastRatio(warningInk!, background),
          `${selector} warning-ink on warning/${tint * 100}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
