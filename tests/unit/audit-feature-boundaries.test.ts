import { describe, expect, it } from "vitest";

import {
  auditSource,
  INFRASTRUCTURE_ALLOWLIST,
  resolveRepoSpecifier,
  UI_ALLOWLIST,
} from "../../scripts/audit-feature-boundaries";

function violations(relPath: string, source: string) {
  return auditSource(relPath, source);
}

describe("feature boundary audit", () => {
  it("blocks shared infrastructure from importing a product feature", () => {
    const found = violations(
      "lib/example.ts",
      'import { writeAuditLog } from "@/features/audit/mutations";\n',
    );

    expect(found).toEqual([
      expect.objectContaining({
        file: "lib/example.ts",
        line: 1,
        reason: expect.stringContaining("features/audit/mutations"),
      }),
    ]);
  });

  it("allows type-only reverse dependencies", () => {
    const found = violations(
      "lib/db/schema/example.ts",
      'import type { InquiryFormConfig } from "@/features/inquiries/form-config";\n',
    );

    expect(found).toEqual([]);
  });

  it("allows reviewed infrastructure exceptions and the Inngest composition root", () => {
    expect(
      violations(
        "lib/ai/chat-attachments.ts",
        'import { extractKnowledgeText } from "@/features/knowledge/extraction";\n',
      ),
    ).toEqual([]);
    expect(
      violations(
        "lib/inngest/functions/cron.ts",
        'import { processInvoiceOverdue } from "@/features/invoices/jobs/overdue";\n',
      ),
    ).toEqual([]);
  });

  it("blocks unlisted feature imports from allowlisted infrastructure", () => {
    const found = violations(
      "lib/ai/chat-attachments.ts",
      'import { writeAuditLog } from "@/features/audit/mutations";\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toContain("features/audit/mutations");
    expect(found[0]?.reason).toContain("INFRASTRUCTURE_ALLOWLIST");
  });

  it("blocks feature imports from Inngest plumbing outside the composition root", () => {
    const found = violations(
      "lib/inngest/send.ts",
      'import { processInvoiceOverdue } from "@/features/invoices/jobs/overdue";\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toContain("shared infrastructure");
  });

  it("blocks generic UI from importing a product feature", () => {
    const found = violations(
      "components/shared/example.tsx",
      'import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toContain("generic UI");
  });

  it("blocks non-composition component folders from importing a product feature", () => {
    const found = violations(
      "components/feedback/example.tsx",
      'import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toContain("generic UI");
  });

  it("blocks unlisted feature imports from allowlisted shared UI", () => {
    const found = violations(
      "components/shared/theme-toggle.tsx",
      'import { formatMoney } from "@/features/analytics/format";\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toContain("features/analytics/format");
    expect(found[0]?.reason).toContain("UI_ALLOWLIST");
  });

  it("allows shell, provider, and reviewed shared UI composition", () => {
    expect(
      violations(
        "components/shell/example.tsx",
        'import { getBusinessInquiriesPath } from "@/features/businesses/routes";\n',
      ),
    ).toEqual([]);
    expect(
      violations(
        "components/providers/theme-provider.tsx",
        'import { themeStorageKey } from "@/features/theme/types";\n',
      ),
    ).toEqual([]);
    expect(
      violations(
        "components/shared/theme-toggle.tsx",
        'import { updateThemePreferenceAction } from "@/features/theme/actions";\n',
      ),
    ).toEqual([]);
  });

  it("allows cross-feature root modules and components", () => {
    expect(
      violations(
        "features/quotes/actions.ts",
        [
          'import { formatInquiryDate } from "@/features/inquiries/utils";',
          'import { InquiryStatusBadge } from "@/features/inquiries/components/inquiry-status-badge";',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("blocks cross-feature imports of private implementation folders", () => {
    const found = violations(
      "features/businesses/home-content.ts",
      'import { formatMoney } from "@/features/analytics/lib/format";\n',
    );

    expect(found).toEqual([
      expect.objectContaining({
        file: "features/businesses/home-content.ts",
        line: 1,
        reason: expect.stringContaining("private module"),
      }),
    ]);
  });

  it("resolves relative private imports across features", () => {
    const found = violations(
      "features/businesses/home-content.ts",
      'import { formatMoney } from "../analytics/lib/format";\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toContain("features/analytics/lib/format");
    expect(resolveRepoSpecifier("features/businesses/home-content.ts", "../analytics/lib/format")).toBe(
      "features/analytics/lib/format",
    );
  });

  it("blocks cross-feature directory imports of private folders", () => {
    const found = auditSource(
      "features/businesses/home-content.ts",
      'import { formatMoney } from "@/features/analytics/lib";\n',
      new Set(["features/analytics/lib"]),
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toContain("private module");
  });

  it("allows a feature to import its own internals", () => {
    const found = violations(
      "features/analytics/components/example.tsx",
      'import { formatMoney } from "../lib/format";\n',
    );

    expect(found).toEqual([]);
  });

  it("ignores type-only import-equals declarations", () => {
    const found = violations(
      "components/shared/example.tsx",
      'import type Queries = require("@/features/quotes/queries");\n',
    );

    expect(found).toEqual([]);
  });

  it("blocks runtime import-equals declarations", () => {
    const found = violations(
      "components/shared/example.tsx",
      'import Queries = require("@/features/quotes/queries");\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toContain("generic UI");
  });

  it("fails computed dynamic imports instead of skipping them", () => {
    const found = violations(
      "features/example/queries.ts",
      'const moduleName = "@/features/quotes/queries";\nconst quoted = await import(moduleName);\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(2);
    expect(found[0]?.reason).toContain("computed import()");
  });

  it("fails computed require calls instead of skipping them", () => {
    const found = violations(
      "lib/example.ts",
      'const moduleName = "./somewhere";\nconst loaded = require(moduleName);\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(2);
    expect(found[0]?.reason).toContain("computed require()");
  });

  it("blocks inbound imports from app/", () => {
    const found = violations(
      "features/example/queries.ts",
      'import { dashboardRoute } from "@/app/(business)/dashboard/route";\n',
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toContain("app/");
  });

  it("requires a reason and allowed targets for every allowlisted exception", () => {
    for (const [file, exception] of Object.entries(INFRASTRUCTURE_ALLOWLIST)) {
      expect(file, "infrastructure allowlist key").toMatch(/^lib\/.+\.tsx?$/);
      expect(exception.reason.trim(), `reason for ${file}`).not.toBe("");
      expect(
        exception.imports.length,
        `allowed imports for ${file}`,
      ).toBeGreaterThan(0);
      for (const target of exception.imports) {
        expect(target, `allowed import for ${file}`).toMatch(/^features\/.+/);
      }
    }
    for (const [file, exception] of Object.entries(UI_ALLOWLIST)) {
      expect(file, "UI allowlist key").toMatch(/^components\/.+\.tsx?$/);
      expect(exception.reason.trim(), `reason for ${file}`).not.toBe("");
      expect(
        exception.imports.length,
        `allowed imports for ${file}`,
      ).toBeGreaterThan(0);
      for (const target of exception.imports) {
        expect(target, `allowed import for ${file}`).toMatch(/^features\/.+/);
      }
    }
  });
});
