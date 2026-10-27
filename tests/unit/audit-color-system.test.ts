import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  auditSource,
  contrastRatio,
  extractThemeBlock,
  mixColor,
  neutralProblems,
  parseColor,
  parseTokenBlock,
} from "../../scripts/audit-color-system";

const globals = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("colour-system audit", () => {
  it.each([
    [":root", "light", ".dark"],
    [".dark", "dark", ":root"],
  ])("scopes %s color-scheme checks to its own block", (selector, scheme, other) => {
    const source = `${selector} {
  --background: #ffffff;
}
${other} {
  color-scheme: ${scheme};
}
.dark .checkout-light-force {
  color-scheme: light;
}
`;
    const declaration = new RegExp(`color-scheme:\\s*${scheme}`);
    expect(declaration.test(extractThemeBlock(source, selector))).toBe(false);
    expect(declaration.test(extractThemeBlock(
      source.replace("--background:", `color-scheme: ${scheme}; --background:`),
      selector,
    ))).toBe(true);
  });

  it("keeps destructive ink above AA on the alert surface over page gradients", () => {
    for (const [selector, stops] of [
      [":root", ["#ffffff", "#fafafa", "#f5f5f7"]],
      [".dark", ["#1c1c1e", "#1a1a1c", "#18181a"]],
    ] as const) {
      const tokens = parseTokenBlock(globals, selector);
      const ink = parseColor(tokens.get("destructive-ink")!)!;
      const surface = parseColor(tokens.get("alert-destructive-surface-bg")!)!;
      // Derive the stops from CSS so gradient changes cannot leave stale fixtures.
      expect(tokens.get("page-gradient")?.match(/#[0-9a-f]{6}/g)).toEqual(stops);
      for (const stop of stops) {
        expect(
          contrastRatio(ink, mixColor(surface, parseColor(stop)!, surface.a)),
          `${selector} destructive alert over ${stop}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

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
