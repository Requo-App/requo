import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runAudit(args: string[]) {
  return spawnSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    // Keep CLI checks deterministic and prove invalid options fail before HTTP.
    `globalThis.fetch = async (url) => {
      console.error("AUDIT_FETCH:" + url);
      return new Response("");
    };
    await import("./scripts/audit-security-headers.ts");`,
    "--", ...args,
  ], {
    encoding: "utf8",
    env: { ...process.env, SECURITY_AUDIT_BASE_URL: "http://audit.example" },
  });
}

describe("security header audit CLI", () => {
  it.each([
    ["--csp-mode"],
    ["--csp-mode", "--json"],
    ["--csp-mode", "invalid"],
    ["--base-url"],
    ["--base-url", "--json"],
    ["--base-url", ""],
  ])("rejects invalid operands: %j", (...args) => {
    const result = runAudit(args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(args[0]);
    expect(result.stderr).not.toContain("AUDIT_FETCH:");
    expect(result.stdout).toBe("");
  });

  it.each([undefined, "enforce", "report-only"])(
    "accepts CSP mode %s and uses the environment URL when omitted",
    (mode) => {
      const result = runAudit(["--json", ...(mode ? ["--csp-mode", mode] : [])]);
      const output = JSON.parse(result.stdout);
      expect(output.cspMode).toBe(mode ?? "enforce");
      expect(output.baseUrl).toBe("http://audit.example");
      expect(output.results).toHaveLength(7);
    },
  );

  it("uses an explicit base URL instead of the environment default", () => {
    const result = runAudit(["--json", "--base-url", "http://preview.example/"]);
    expect(JSON.parse(result.stdout).baseUrl).toBe("http://preview.example");
    expect(result.stderr).toContain("AUDIT_FETCH:http://preview.example/");
  });
});
