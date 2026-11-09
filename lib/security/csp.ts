/**
 * Content Security Policy builder.
 *
 * The policy is intentionally static. Requo's public pages are prerendered
 * (and partially prefetched) and served from the CDN, so a per-request nonce
 * would force dynamic rendering and disable that cache path. Next.js also
 * emits inline RSC flight scripts that cannot be hashed on static pages. The
 * resulting policy therefore allows `'unsafe-inline'` for scripts and styles.
 *
 * Keep this module dependency-free so `next.config.ts` can import it without
 * pulling in the application runtime or environment validation.
 */

export type CspMode = "report-only" | "enforce";

export type CspOptions = {
  isProduction: boolean;
  /** Supabase project URL; enables REST and Realtime connections. */
  supabaseUrl?: string | null;
  /** Sentry DSN; its origin receives browser error envelopes. */
  sentryDsn?: string | null;
  /** Crisp website id; when set, the chat widget origins are allowed. */
  crispWebsiteId?: string | null;
};

const CRISP_CLIENT_ORIGIN = "https://client.crisp.chat";
const CRISP_RELAY_ORIGIN = "wss://client.relay.crisp.chat";
const VERCEL_SCRIPTS_ORIGIN = "https://va.vercel-scripts.com";

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function parseOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function toWebSocketOrigin(origin: string): string {
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.origin;
}

function buildDirectives(options: CspOptions): string[] {
  const isProduction = options.isProduction;
  const supabaseOrigin = parseOrigin(options.supabaseUrl);
  const supabaseSocketOrigin = supabaseOrigin
    ? toWebSocketOrigin(supabaseOrigin)
    : null;
  const sentryOrigin = parseOrigin(options.sentryDsn);
  const crispEnabled = Boolean(options.crispWebsiteId);

  // React's development build uses eval for enhanced stack traces. Next's dev
  // server also loads the Vercel analytics/speed-insights debug scripts from
  // va.vercel-scripts.com and opens a same-host HMR socket.
  const developmentScriptOrigins = isProduction
    ? []
    : [VERCEL_SCRIPTS_ORIGIN];
  const developmentConnectOrigins = isProduction
    ? []
    : [
        VERCEL_SCRIPTS_ORIGIN,
        "ws://127.0.0.1:*",
        "ws://localhost:*",
      ];

  const crispScriptOrigins = crispEnabled ? [CRISP_CLIENT_ORIGIN] : [];
  const crispConnectOrigins = crispEnabled
    ? [CRISP_CLIENT_ORIGIN, CRISP_RELAY_ORIGIN]
    : [];

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      unique([
        "'self'",
        "'unsafe-inline'",
        ...(isProduction ? [] : ["'unsafe-eval'"]),
        ...developmentScriptOrigins,
        ...crispScriptOrigins,
      ]),
    ],
    // React attaches event handlers with addEventListener rather than inline
    // `on*` attributes. Keeping attributes blocked is a cheap XSS barrier; it
    // is report-only first so an unforeseen embed can be caught before
    // enforcement.
    ["script-src-attr", ["'none'"]],
    [
      "style-src",
      unique([
        "'self'",
        "'unsafe-inline'",
        ...(crispEnabled ? [CRISP_CLIENT_ORIGIN] : []),
      ]),
    ],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    [
      "font-src",
      unique([
        "'self'",
        "data:",
        ...(crispEnabled ? [CRISP_CLIENT_ORIGIN] : []),
      ]),
    ],
    [
      "connect-src",
      unique([
        "'self'",
        ...developmentConnectOrigins,
        supabaseOrigin,
        supabaseSocketOrigin,
        sentryOrigin,
        ...crispConnectOrigins,
      ]),
    ],
    ["media-src", ["'self'", "blob:"]],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["frame-src", unique(["'self'", ...(crispEnabled ? [CRISP_CLIENT_ORIGIN] : [])])],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];

  const serialized = directives.map(([name, values]) =>
    values.length > 0 ? `${name} ${values.join(" ")}` : name,
  );

  if (isProduction) {
    serialized.push("upgrade-insecure-requests");
  }

  return serialized;
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  return buildDirectives(options).join("; ");
}

export function getContentSecurityPolicyHeader(
  mode: CspMode,
  options: CspOptions,
): { key: string; value: string } {
  return {
    key:
      mode === "enforce"
        ? "Content-Security-Policy"
        : "Content-Security-Policy-Report-Only",
    value: buildContentSecurityPolicy(options),
  };
}
