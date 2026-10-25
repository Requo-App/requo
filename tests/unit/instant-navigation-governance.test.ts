import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  IN_SCOPE_ROUTES,
  type EscapeHatchEntry,
} from "../../lib/instant-navigation/escape-hatches";
import { auditEscapeHatchRegistry } from "../../scripts/instant-navigation/escape-hatch-audit";
import {
  findLegacyInstantExport,
  inspectInstantExport,
} from "../../scripts/instant-navigation/instant-export";
import { findInstantScopeDrift } from "../../scripts/instant-navigation/instant-scope";

const ROUTE = [...IN_SCOPE_ROUTES][0];

function hatch(
  overrides: Partial<EscapeHatchEntry> = {},
): EscapeHatchEntry {
  return {
    route: ROUTE,
    reason: "Tracked reason",
    targetReviewDate: "2999-01-01",
    active: true,
    ...overrides,
  };
}

describe("instant route export inspection", () => {
  it("reads a real export and ignores commented or non-exported config", () => {
    expect(inspectInstantExport("export const metadata = {};").state).toBe(
      "missing",
    );
    expect(
      inspectInstantExport("// export const instant = true;\n").state,
    ).toBe("missing");
    expect(inspectInstantExport("const instant = true;\n").state).toBe(
      "missing",
    );
    expect(inspectInstantExport("export const instant = true;")).toMatchObject({
      state: "enabled",
      line: 1,
    });
  });

  it("treats false and object-form disable flags as opt-outs", () => {
    expect(inspectInstantExport("export const instant = false;")).toMatchObject({
      state: "disabled",
      disabledBy: "instant = false",
    });

    for (const flag of [
      "unstable_disableValidation",
      "unstable_disableDevValidation",
      "unstable_disableBuildValidation",
    ]) {
      const source = `export const instant = { ${flag}: true } satisfies Instant;`;
      expect(inspectInstantExport(source)).toMatchObject({
        state: "disabled",
        disabledBy: flag,
      });
    }

    expect(
      inspectInstantExport(
        "export const instant = { level: 'warning' } as const;",
      ).state,
    ).toBe("enabled");
  });

  it("finds legacy exports only when they are real exports", () => {
    expect(findLegacyInstantExport("// export const unstable_instant = true;"))
      .toBeNull();
    expect(
      findLegacyInstantExport("export const unstable_instant = true;"),
    ).toMatchObject({ name: "unstable_instant", line: 1 });
  });

  it.each([
    "const unstable_instant = true;\nexport { unstable_instant };",
    "const config = true;\nexport { config as unstable_instant };",
    "\nexport { unstable_instant } from './config';",
    "\nexport { config as unstable_instant } from './config';",
    "\nexport { unstable_instant as config } from './config';",
  ])("finds named legacy exports and aliases: %s", (source) => {
    expect(findLegacyInstantExport(source)).toEqual({
      name: "unstable_instant",
      line: 2,
    });
  });

  it.each([
    "const unstable_instant = true;",
    "export { instant } from './config';",
    "export type { unstable_instant } from './config';",
    "export { type unstable_instant } from './config';",
  ])("ignores declarations without a legacy value export: %s", (source) => {
    expect(findLegacyInstantExport(source)).toBeNull();
  });

  it.each([
    "{ ...{ unstable_disableValidation: true } }",
    "{ ...({ ...{ unstable_disableValidation: true } } as const) }",
    "{ unstable_disableValidation: false, ...{ unstable_disableValidation: true } }",
    "{ ...unknown, unstable_disableValidation: true }",
  ])("detects effective disable flags through spreads: %s", (config) => {
    expect(inspectInstantExport(`export const instant = ${config};`))
      .toMatchObject({ state: "disabled", disabledBy: "unstable_disableValidation" });
  });

  it("resolves local constant spreads without evaluating code", () => {
    expect(inspectInstantExport(`
      const base = { unstable_disableValidation: true } as const;
      const config = { ...base };
      export const instant = { ...config };
    `)).toMatchObject({ state: "disabled", disabledBy: "unstable_disableValidation" });
  });

  it.each([
    "{ ...{ level: 'warning' } }",
    "{ ...{ unstable_disableValidation: true }, unstable_disableValidation: false }",
    "{ unstable_disableValidation: true, ...{ unstable_disableValidation: false } }",
  ])("accepts spreads whose effective config enables validation: %s", (config) => {
    expect(inspectInstantExport(`export const instant = ${config};`).state)
      .toBe("enabled");
  });

  it.each([
    "{ ...unknown }",
    "{ ...getConfig() }",
    "{ unstable_disableValidation: true, ...unknown }",
    "{ ...unknown, unstable_disableValidation: false }",
  ])("does not assume unresolved spreads enable validation: %s", (config) => {
    expect(inspectInstantExport(`export const instant = ${config};`).state)
      .toBe("unknown");
  });

  it("terminates when a local spread references itself", () => {
    expect(inspectInstantExport(`
      const config = { ...config };
      export const instant = { ...config };
    `).state).toBe("unknown");
  });
});

describe("instant navigation scope drift", () => {
  it("flags a page that declares instant outside the rollout scope", () => {
    const pages = [
      {
        route: "app/example/page.tsx",
        inspection: { state: "enabled" as const, line: 1 },
      },
    ];

    expect(findInstantScopeDrift(pages)).toEqual([
      expect.stringContaining("missing from IN_SCOPE_ROUTES"),
    ]);
  });

  it("accepts in-scope pages and pages without the export", () => {
    expect(
      findInstantScopeDrift([
        { route: ROUTE, inspection: { state: "enabled", line: 1 } },
        {
          route: "app/example/page.tsx",
          inspection: { state: "missing" },
        },
      ]),
    ).toEqual([]);
  });
});

describe("escape-hatch registry audit", () => {
  it("accepts an empty or valid registry", () => {
    expect(auditEscapeHatchRegistry([], new Date("2026-10-25"))).toEqual([]);
    expect(
      auditEscapeHatchRegistry([hatch()], new Date("2026-10-25")),
    ).toEqual([]);
  });

  it("rejects duplicate route keys", () => {
    const errors = auditEscapeHatchRegistry(
      [hatch(), hatch({ active: false })],
      new Date("2026-10-25"),
    );

    expect(errors).toEqual([
      expect.stringContaining(`Duplicate escape-hatch entry for ${ROUTE}`),
    ]);
  });

  it("validates dormant entries instead of only the selected entry", () => {
    const errors = auditEscapeHatchRegistry(
      [hatch({ active: false, reason: "   " })],
      new Date("2026-10-25"),
    );

    expect(errors).toEqual([
      expect.stringContaining("Invalid escape-hatch entry"),
    ]);
  });

  it("fails an active entry whose review date has passed", () => {
    const errors = auditEscapeHatchRegistry(
      [hatch({ targetReviewDate: "2020-01-01" })],
      new Date("2026-10-25"),
    );

    expect(errors).toEqual([
      expect.stringContaining("passed its review date 2020-01-01"),
    ]);
  });
});

describe("instant navigation check wiring", () => {
  it("runs both instant-navigation checks from check:seo", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["audit:instant-navigation"]).toBeDefined();
    expect(
      packageJson.scripts["audit:instant-navigation-coverage"],
    ).toBeDefined();

    const seoChecks = packageJson.scripts["check:seo"].split(/\s+/);
    expect(seoChecks).toContain("audit:instant-navigation");
    expect(seoChecks).toContain("audit:instant-navigation-coverage");
  });
});
