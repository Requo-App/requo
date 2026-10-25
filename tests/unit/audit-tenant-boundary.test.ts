import { describe, expect, it } from "vitest";

import {
  ACTION_ALLOWLIST,
  auditSource,
} from "../../scripts/audit-tenant-boundary";

function violations(relPath: string, source: string) {
  return auditSource(relPath, source);
}

describe("tenant boundary audit", () => {
  it("blocks the DB client at the component boundary", () => {
    const found = violations(
      "components/example.tsx",
      'import { db } from "@/lib/db/client";\n',
    );

    expect(found).toEqual([
      expect.objectContaining({
        file: "components/example.tsx",
        line: 1,
        reason: expect.stringContaining("@/lib/db/client"),
      }),
    ]);
  });

  it("blocks side-effect, relative, dynamic, and require imports", () => {
    const found = violations(
      "components/example.tsx",
      [
        'import "@/lib/db/client";',
        'const relative = require("../lib/db/client");',
        'const dynamic = import("@/lib/db/client");',
        'export { db } from "@/lib/db/client";',
      ].join("\n"),
    );

    expect(found).toHaveLength(4);
    expect(found.map((offender) => offender.line)).toEqual([1, 2, 3, 4]);
  });

  it("blocks Drizzle imports in a client component outside components/", () => {
    const found = violations(
      "features/example/utils.ts",
      '"use client";\n\nimport { eq } from "drizzle-orm";\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      file: "features/example/utils.ts",
      line: 3,
    });
  });

  it("detects any \"use server\" module, not only actions.ts filenames", () => {
    const found = violations(
      "features/example/mutations.ts",
      '"use server";\n\nimport { db } from "@/lib/db/client";\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0].reason).toContain("server action");
  });

  it("still blocks unapproved action files", () => {
    const found = violations(
      "features/example/actions.ts",
      '"use server";\n\nimport { db } from "@/lib/db/client";\n',
    );

    expect(found).toHaveLength(1);
  });

  it("allows reviewed server actions", () => {
    const found = violations(
      "features/admin/mutations.ts",
      '"use server";\n\nimport { db } from "@/lib/db/client";\n',
    );

    expect(found).toEqual([]);
  });

  it("allows server-only mutation modules", () => {
    const found = violations(
      "features/example/mutations.ts",
      'import "server-only";\n\nimport { db } from "@/lib/db/client";\n',
    );

    expect(found).toEqual([]);
  });

  it("ignores type-only imports", () => {
    const found = violations(
      "components/example.tsx",
      'import type { SQL } from "drizzle-orm";\nimport type { Db } from "@/lib/db/client";\n',
    );

    expect(found).toEqual([]);
  });

  it("ignores type-only import-equals declarations", () => {
    const found = violations(
      "components/example.tsx",
      'import type Db = require("@/lib/db/client");\n',
    );

    expect(found).toEqual([]);
  });

  it("blocks runtime import-equals declarations", () => {
    const found = violations(
      "components/example.tsx",
      'import Db = require("@/lib/db/client");\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toContain("@/lib/db/client");
  });

  it("requires a reason for every allowlisted action", () => {
    for (const [file, reason] of Object.entries(ACTION_ALLOWLIST)) {
      expect(file, "allowlist key").toMatch(/\.tsx?$/);
      expect(reason.trim(), `reason for ${file}`).not.toBe("");
    }
  });
});
