/**
 * Security header and public metadata audit.
 *
 * Run against a running deployment (or `npm run dev`) after changing headers,
 * CSP, or the proxy matcher:
 *
 *   npm run audit:security-headers -- --base-url http://127.0.0.1:3000
 *
 * It intentionally has no test-runner dependency: the same command can compare
 * a preview deployment with production before and after a rollout.
 */

type CspMode = "enforce" | "report-only";

type AuditTarget = {
  path: string;
  kind: "app" | "auth" | "crawler" | "discovery" | "image";
  metadata?: boolean;
};

type AuditResult = {
  path: string;
  status: number;
  headers: Record<string, string | null>;
  metadata?: {
    canonical: string | null;
    description: string | null;
    h1: string[];
    h2: string[];
    jsonLdCount: number;
    links: string[];
    robots: string | null;
    title: string | null;
  };
  failures: string[];
};

const targets: AuditTarget[] = [
  { kind: "app", metadata: true, path: "/" },
  { kind: "app", metadata: true, path: "/pricing" },
  { kind: "auth", metadata: true, path: "/login" },
  { kind: "crawler", path: "/robots.txt" },
  { kind: "crawler", path: "/sitemap.xml" },
  { kind: "discovery", path: "/.well-known/security.txt" },
  { kind: "image", path: "/opengraph-image" },
];

const selectedHeaders = [
  "cache-control",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "permissions-policy",
  "referrer-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "x-permitted-cross-domain-policies",
  "x-powered-by",
  "x-robots-tag",
];

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readCspMode(): CspMode {
  const value = readArg("--csp-mode");

  if (value === "enforce" || value === "report-only") {
    return value;
  }

  return "report-only";
}

function headerValue(headers: Headers, name: string): string | null {
  return headers.get(name);
}

function isPrivateCache(
  value: string | null,
  allowFrameworkNoStore = false,
): boolean {
  if (!value) {
    return false;
  }

  if (/(?:^|,\s*)private\b/i.test(value)) {
    return true;
  }

  return (
    !allowFrameworkNoStore && /(?:^|,\s*)no-store\b/i.test(value)
  );
}

function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

function extractMetadata(html: string): NonNullable<AuditResult["metadata"]> {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const description =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    )?.[1] ?? null;
  const robots =
    html.match(
      /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i,
    )?.[1] ?? null;
  const canonical =
    html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i,
    )?.[1] ?? null;

  return {
    canonical,
    description,
    h1: Array.from(html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi), (match) =>
      stripTags(match[1] ?? ""),
    ),
    h2: Array.from(html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi), (match) =>
      stripTags(match[1] ?? ""),
    ),
    jsonLdCount: (
      html.match(/<script[^>]+type=["']application\/ld\+json["']/gi) ?? []
    ).length,
    links: Array.from(
      html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi),
      (match) => match[1] ?? "",
    ),
    robots,
    title: title ? stripTags(title) : null,
  };
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function auditTarget(
  target: AuditTarget,
  response: Response,
  body: string,
  cspMode: CspMode,
  allowFrameworkNoStore: boolean,
): AuditResult {
  const failures: string[] = [];
  const headers = Object.fromEntries(
    selectedHeaders.map((name) => [name, headerValue(response.headers, name)]),
  );
  const cspHeaderName =
    cspMode === "enforce"
      ? "content-security-policy"
      : "content-security-policy-report-only";
  const unexpectedCspHeaderName =
    cspMode === "enforce"
      ? "content-security-policy-report-only"
      : "content-security-policy";

  if (response.status !== 200) {
    failures.push(`expected status 200, got ${response.status}`);
  }

  if (target.kind === "app" || target.kind === "auth") {
    if (!headers[cspHeaderName]) {
      failures.push(`missing ${cspHeaderName}`);
    }

    if (headers[unexpectedCspHeaderName]) {
      failures.push(`unexpected ${unexpectedCspHeaderName}`);
    }

    if (headers["cross-origin-opener-policy"] !== "same-origin") {
      failures.push("missing Cross-Origin-Opener-Policy: same-origin");
    }

    if (headers["x-content-type-options"] !== "nosniff") {
      failures.push("missing X-Content-Type-Options: nosniff");
    }

    if (headers["x-frame-options"] !== "DENY") {
      failures.push("missing X-Frame-Options: DENY");
    }

    if (headers["x-permitted-cross-domain-policies"] !== "none") {
      failures.push("missing X-Permitted-Cross-Domain-Policies: none");
    }

    if (!headers["referrer-policy"]) {
      failures.push("missing Referrer-Policy");
    }

    if (!headers["permissions-policy"]) {
      failures.push("missing Permissions-Policy");
    }

    if (headers["x-powered-by"]) {
      failures.push(`unexpected X-Powered-By: ${headers["x-powered-by"]}`);
    }
  }

  if (target.kind === "auth") {
    if (!headers["x-robots-tag"]?.includes("noindex")) {
      failures.push("auth page is missing X-Robots-Tag: noindex");
    }

    if (!isPrivateCache(headers["cache-control"])) {
      failures.push("auth page is missing a private/no-store Cache-Control");
    }

    if (headers["cross-origin-resource-policy"] !== "same-origin") {
      failures.push("auth page is missing Cross-Origin-Resource-Policy");
    }
  }

  if (target.kind === "app") {
    if (headers["cross-origin-resource-policy"]) {
      failures.push("public app page should not set Cross-Origin-Resource-Policy");
    }

    if (headers["x-robots-tag"]) {
      failures.push(`public app page has X-Robots-Tag: ${headers["x-robots-tag"]}`);
    }
  }

  if (
    target.kind === "crawler" ||
    target.kind === "discovery" ||
    target.kind === "image"
  ) {
    if (headers["x-robots-tag"]) {
      failures.push(
        `${target.kind} resource has X-Robots-Tag: ${headers["x-robots-tag"]}`,
      );
    }

    if (isPrivateCache(headers["cache-control"], allowFrameworkNoStore)) {
      failures.push(
        `${target.kind} resource has private/no-store Cache-Control: ${headers["cache-control"]}`,
      );
    }
  }

  return {
    failures,
    headers,
    metadata: target.metadata ? extractMetadata(body) : undefined,
    path: target.path,
    status: response.status,
  };
}

async function main() {
  const baseUrl = (
    readArg("--base-url") ??
    process.env.SECURITY_AUDIT_BASE_URL ??
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
  const cspMode = readCspMode();
  const localDev = isLocalBaseUrl(baseUrl);
  const results: AuditResult[] = [];

  for (const target of targets) {
    const url = `${baseUrl}${target.path}`;
    let response: Response;

    try {
      response = await fetch(url, {
        headers: { accept: target.kind === "image" ? "image/*" : "*/*" },
        redirect: "manual",
      });
    } catch (error) {
      results.push({
        failures: [`request failed: ${String(error)}`],
        headers: {},
        path: target.path,
        status: 0,
      });
      continue;
    }

    const body =
      target.kind === "image" ? "" : await response.text();

    results.push(
      auditTarget(
        target,
        response,
        body,
        cspMode,
        localDev && target.kind === "image",
      ),
    );
  }

  const failures = results.flatMap((result) =>
    result.failures.map((failure) => `${result.path}: ${failure}`),
  );

  if (hasFlag("--json")) {
    console.log(JSON.stringify({ baseUrl, cspMode, failures, results }, null, 2));
  } else {
    console.log(`Security header audit: ${baseUrl} (CSP ${cspMode})`);

    for (const result of results) {
      console.log(`\n${result.path} -> ${result.status}`);
      for (const [name, value] of Object.entries(result.headers)) {
        if (value) {
          console.log(`  ${name}: ${value}`);
        }
      }

      if (result.metadata) {
        console.log(`  title: ${result.metadata.title ?? "(missing)"}`);
        console.log(`  canonical: ${result.metadata.canonical ?? "(missing)"}`);
        console.log(`  robots: ${result.metadata.robots ?? "(missing)"}`);
        console.log(`  json-ld: ${result.metadata.jsonLdCount}`);
        console.log(`  h1: ${result.metadata.h1.join(" | ") || "(none)"}`);
      }
    }

    if (failures.length > 0) {
      console.error(`\n${failures.length} failure(s):`);
      for (const failure of failures) {
        console.error(`  - ${failure}`);
      }
    } else {
      console.log("\nAll header checks passed.");
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

void main();
