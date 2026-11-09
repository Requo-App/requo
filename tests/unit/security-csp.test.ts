import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  getContentSecurityPolicyHeader,
  type CspOptions,
} from "@/lib/security/csp";

const production: CspOptions = { isProduction: true };
const development: CspOptions = { isProduction: false };

function directive(policy: string, name: string): string {
  const value = policy
    .split("; ")
    .find((entry) => entry === name || entry.startsWith(`${name} `));

  if (!value) {
    throw new Error(`Missing CSP directive: ${name}`);
  }

  return value;
}

describe("content security policy", () => {
  it("uses a report-only header until enforcement is enabled explicitly", () => {
    expect(getContentSecurityPolicyHeader("report-only", production).key).toBe(
      "Content-Security-Policy-Report-Only",
    );
    expect(getContentSecurityPolicyHeader("enforce", production).key).toBe(
      "Content-Security-Policy",
    );
  });

  it("keeps a static production policy with no nonce or eval", () => {
    const policy = buildContentSecurityPolicy(production);

    expect(policy).not.toContain("nonce-");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(directive(policy, "script-src")).toBe(
      "script-src 'self' 'unsafe-inline'",
    );
    expect(directive(policy, "script-src-attr")).toBe("script-src-attr 'none'");
    expect(directive(policy, "style-src")).toBe(
      "style-src 'self' 'unsafe-inline'",
    );
    expect(directive(policy, "img-src")).toBe(
      "img-src 'self' data: blob: https:",
    );
    expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
    expect(directive(policy, "worker-src")).toBe("worker-src 'self'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("allows React eval and the Vercel debug scripts only in development", () => {
    const policy = buildContentSecurityPolicy(development);

    expect(directive(policy, "script-src")).toContain("'unsafe-eval'");
    expect(directive(policy, "script-src")).toContain(
      "https://va.vercel-scripts.com",
    );
    expect(directive(policy, "connect-src")).toContain(
      "https://va.vercel-scripts.com",
    );
    expect(directive(policy, "connect-src")).toContain("ws://127.0.0.1:*");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("derives Supabase REST and Realtime origins from the project URL", () => {
    const policy = buildContentSecurityPolicy({
      ...production,
      supabaseUrl: "https://project-ref.supabase.co/",
    });

    expect(directive(policy, "connect-src")).toBe(
      "connect-src 'self' https://project-ref.supabase.co wss://project-ref.supabase.co",
    );
  });

  it("derives the Sentry ingest origin from the DSN", () => {
    const policy = buildContentSecurityPolicy({
      ...production,
      sentryDsn: "https://public-key@o123.ingest.sentry.io/456",
    });

    expect(directive(policy, "connect-src")).toBe(
      "connect-src 'self' https://o123.ingest.sentry.io",
    );
  });

  it("allows Crisp only when the widget is configured", () => {
    const disabled = buildContentSecurityPolicy(production);
    const enabled = buildContentSecurityPolicy({
      ...production,
      crispWebsiteId: "website-id",
    });

    expect(disabled).not.toContain("crisp.chat");
    expect(directive(enabled, "script-src")).toContain(
      "https://client.crisp.chat",
    );
    expect(directive(enabled, "connect-src")).toContain(
      "https://client.crisp.chat",
    );
    expect(directive(enabled, "connect-src")).toContain(
      "wss://client.relay.crisp.chat",
    );
    expect(directive(enabled, "frame-src")).toContain(
      "https://client.crisp.chat",
    );
  });

  it("ignores malformed optional origins instead of failing the build", () => {
    const policy = buildContentSecurityPolicy({
      ...production,
      crispWebsiteId: "",
      sentryDsn: "not a url",
      supabaseUrl: "also not a url",
    });

    expect(policy).not.toContain("not a url");
    expect(policy).not.toContain("also not a url");
    expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
  });

  it.each(["localhost:54321", "data:text/plain,hello", "ftp://example.com"])(
    "ignores non-HTTP optional origins (%s) without failing configuration loading",
    (origin) => {
      const policy = buildContentSecurityPolicy({
        ...production,
        supabaseUrl: origin,
        sentryDsn: origin,
      });

      expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
    },
  );

  it("deduplicates repeated origins", () => {
    const policy = buildContentSecurityPolicy({
      ...production,
      sentryDsn: "https://project-ref.supabase.co/sentry",
      supabaseUrl: "https://project-ref.supabase.co",
    });

    expect(
      directive(policy, "connect-src").match(
        /https:\/\/project-ref\.supabase\.co/g,
      ),
    ).toHaveLength(1);
  });

  it("serializes one line so the header cannot be split", () => {
    expect(buildContentSecurityPolicy(production)).not.toMatch(/[\r\n]/);
  });
});
