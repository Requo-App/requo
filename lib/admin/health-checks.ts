/**
 * Shared platform health checks for the admin console and dev CLI.
 *
 * Never exposes secret values — only status, safe messages, and durations.
 */

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

import { pingRedisRestWithRetry } from "@/lib/admin/redis-health";

export type AdminHealthCheckStatus = "pass" | "fail" | "warn" | "skip";

export type AdminHealthCheckCategory =
  | "core"
  | "email"
  | "ai"
  | "jobs"
  | "cache"
  | "billing"
  | "push";

export type AdminHealthCheckResult = {
  name: string;
  status: AdminHealthCheckStatus;
  message?: string;
  duration?: number;
  hint?: string;
  category: AdminHealthCheckCategory;
};

export type AdminHealthReport = {
  results: AdminHealthCheckResult[];
  totalDuration: number;
  environment: string;
  critical: number;
  warnings: number;
  healthy: number;
};

export type AdminHealthSummary = {
  critical: number;
  warnings: number;
  healthy: number;
  byCategory: Record<
    AdminHealthCheckCategory,
    AdminHealthCheckStatus | "mixed"
  >;
  checkedAt: Date;
};

function getEnv(key: string): string | undefined {
  const val = process.env[key];
  return val && val.trim() !== "" ? val.trim() : undefined;
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "****";
    return parsed.toString();
  } catch {
    return "[invalid url]";
  }
}

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  return [result, Math.round(performance.now() - start)];
}

function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      return true;
    }
    // Honor the standard Postgres opt-out so containerized local setups
    // (e.g. Docker reaching the Supabase stack by container hostname) can
    // use plaintext without tripping the require-TLS default below.
    // Production pooler URLs never carry this flag, so their behavior is
    // unchanged.
    return parsed.searchParams.get("sslmode") === "disable";
  } catch {
    return false;
  }
}

function hasEmailSenderConfigured(): boolean {
  return Boolean(
    getEnv("EMAIL_FROM_DEFAULT") ||
      getEnv("EMAIL_FROM_NOTIFICATIONS") ||
      getEnv("EMAIL_FROM_SYSTEM") ||
      getEnv("EMAIL_FROM_QUOTES") ||
      getEnv("EMAIL_FROM_SUPPORT") ||
      getEnv("RESEND_FROM_EMAIL") ||
      getEnv("EMAIL_DOMAIN"),
  );
}

function isResendConfigured(): boolean {
  return Boolean(getEnv("RESEND_API_KEY") && hasEmailSenderConfigured());
}

function isMailtrapConfigured(): boolean {
  return Boolean(getEnv("MAILTRAP_API_TOKEN") && hasEmailSenderConfigured());
}

function isBrevoConfigured(): boolean {
  return Boolean(getEnv("BREVO_API_KEY") && hasEmailSenderConfigured());
}

function isEmailConfigured(): boolean {
  return isResendConfigured() || isMailtrapConfigured() || isBrevoConfigured();
}

function isGroqConfigured(): boolean {
  return Boolean(getEnv("GROQ_API_KEY"));
}

function isGeminiConfigured(): boolean {
  return Boolean(getEnv("GEMINI_API_KEY"));
}

function isCloudflareAiConfigured(): boolean {
  return Boolean(getEnv("CLOUDFLARE_ACCOUNT_ID") && getEnv("CLOUDFLARE_API_TOKEN"));
}

function isNvidiaNimConfigured(): boolean {
  return Boolean(getEnv("NVIDIA_NIM_API_KEY"));
}

function isOpenRouterConfigured(): boolean {
  return Boolean(getEnv("OPENROUTER_API_KEY"));
}

function isPolarConfigured(): boolean {
  return Boolean(
    getEnv("POLAR_ACCESS_TOKEN") &&
      getEnv("POLAR_WEBHOOK_SECRET") &&
      (getEnv("POLAR_PRO_PRODUCT_ID") ||
        getEnv("POLAR_BUSINESS_PRODUCT_ID") ||
        getEnv("POLAR_PRO_YEARLY_PRODUCT_ID") ||
        getEnv("POLAR_BUSINESS_YEARLY_PRODUCT_ID")),
  );
}

function isInngestDevMode(): boolean {
  const value = getEnv("INNGEST_DEV");
  return value === "1" || value === "true";
}

function isInngestCloudConfigured(): boolean {
  return Boolean(getEnv("INNGEST_EVENT_KEY") && getEnv("INNGEST_SIGNING_KEY"));
}

function isPushConfigured(): boolean {
  return Boolean(
    getEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY") && getEnv("VAPID_PRIVATE_KEY"),
  );
}

export function getConfiguredAiProviderLabels(): string[] {
  const providers: string[] = [];
  if (isGroqConfigured()) providers.push("Groq");
  if (isGeminiConfigured()) providers.push("Gemini");
  if (isCloudflareAiConfigured()) providers.push("Cloudflare");
  if (isNvidiaNimConfigured()) providers.push("NVIDIA NIM");
  if (isOpenRouterConfigured()) providers.push("OpenRouter");
  return providers;
}

export function getConfiguredEmailProviderLabels(): string[] {
  const providers: string[] = [];
  if (isResendConfigured()) providers.push("Resend");
  if (isMailtrapConfigured()) providers.push("Mailtrap");
  if (isBrevoConfigured()) providers.push("Brevo");
  return providers;
}

async function checkEnvironment(): Promise<AdminHealthCheckResult> {
  const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"];
  const missing = required.filter((key) => !getEnv(key));

  if (missing.length > 0) {
    return {
      name: "Environment variables",
      status: "fail",
      message: `Missing required: ${missing.join(", ")}`,
      hint: "Copy .env.example to .env.local and fill in the required values.",
      category: "core",
    };
  }

  return {
    name: "Environment variables",
    status: "pass",
    message: "Loaded",
    category: "core",
  };
}

async function checkAdminAccess(): Promise<AdminHealthCheckResult> {
  const databaseUrl = getEnv("DATABASE_URL");
  if (!databaseUrl) {
    return {
      name: "Admin access",
      status: "warn",
      message: "Cannot verify admins without a database connection",
      hint: "Set DATABASE_URL to enable the admin presence check.",
      category: "core",
    };
  }

  const client = postgres(databaseUrl, {
    connect_timeout: 8,
    max: 1,
    prepare: false,
    ssl: isLocalUrl(databaseUrl) ? false : "require",
  });

  try {
    const [rows, duration] = await timed(async () => {
      return await client`select count(*)::int as count from "user" where "role" = 'admin' and "banned" = false`;
    });
    const adminCount = Number(rows?.[0]?.count ?? 0);
    return {
      name: "Admin access",
      status: adminCount > 0 ? "pass" : "fail",
      message:
        adminCount > 0
          ? `${adminCount} admin user(s) in database`
          : "No admin users in database",
      duration,
      hint:
        adminCount > 0
          ? undefined
          : "Run scripts/bootstrap-admin.ts to promote users to admin.",
      category: "core",
    };
  } catch (err) {
    const error = err as Error;
    return {
      name: "Admin access",
      status: "fail",
      message: error.message.split("\n")[0],
      hint: "Check database connectivity.",
      category: "core",
    };
  } finally {
    await client.end();
  }
}

async function checkDatabase(): Promise<AdminHealthCheckResult> {
  const databaseUrl = getEnv("DATABASE_URL");
  if (!databaseUrl) {
    return {
      name: "Database",
      status: "fail",
      message: "DATABASE_URL not set",
      hint: "Set DATABASE_URL in your environment.",
      category: "core",
    };
  }

  const client = postgres(databaseUrl, {
    connect_timeout: 8,
    max: 1,
    prepare: false,
    ssl: isLocalUrl(databaseUrl) ? false : "require",
  });

  try {
    const [, duration] = await timed(async () => {
      await client`SELECT 1 as health_check`;
    });
    return {
      name: "Database",
      status: "pass",
      message: "Connected",
      duration,
      category: "core",
    };
  } catch (err) {
    const error = err as Error;
    return {
      name: "Database",
      status: "fail",
      message: error.message.split("\n")[0],
      hint: `Check DATABASE_URL (${maskUrl(databaseUrl)}).`,
      category: "core",
    };
  } finally {
    await client.end();
  }
}

async function checkSupabase(): Promise<AdminHealthCheckResult> {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    return {
      name: "Supabase",
      status: "fail",
      message: "Credentials not set",
      hint: "Configure Supabase credentials in the environment.",
      category: "core",
    };
  }

  try {
    const [, duration] = await timed(async () => {
      const client = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await client.storage.listBuckets();
      if (error) throw error;
    });
    return {
      name: "Supabase",
      status: "pass",
      message: "Connected",
      duration,
      category: "core",
    };
  } catch (err) {
    const error = err as Error;
    return {
      name: "Supabase",
      status: "fail",
      message: error.message.split("\n")[0],
      hint: "Check Supabase URL and service role key.",
      category: "core",
    };
  }
}

async function checkStorage(): Promise<AdminHealthCheckResult> {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    return {
      name: "Storage",
      status: "skip",
      message: "Supabase not configured",
      category: "core",
    };
  }

  try {
    const [, duration] = await timed(async () => {
      const client = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await client.storage.listBuckets();
      if (error) throw error;
    });
    return {
      name: "Storage",
      status: "pass",
      message: "Available",
      duration,
      category: "core",
    };
  } catch (err) {
    const error = err as Error;
    return {
      name: "Storage",
      status: "warn",
      message: error.message.split("\n")[0],
      hint: "Check Supabase Storage settings.",
      category: "core",
    };
  }
}

async function checkBetterAuth(): Promise<AdminHealthCheckResult> {
  const secret = getEnv("BETTER_AUTH_SECRET");
  const url = getEnv("BETTER_AUTH_URL");

  if (!secret || !url) {
    return {
      name: "Better Auth",
      status: "fail",
      message: "BETTER_AUTH_SECRET or BETTER_AUTH_URL not set",
      category: "core",
    };
  }

  if (secret.length < 32) {
    return {
      name: "Better Auth",
      status: "fail",
      message: "BETTER_AUTH_SECRET must be at least 32 characters",
      category: "core",
    };
  }

  return {
    name: "Better Auth",
    status: "pass",
    message: "Configured",
    category: "core",
  };
}

async function checkEmail(): Promise<AdminHealthCheckResult> {
  const providers = getConfiguredEmailProviderLabels();

  if (providers.length === 0) {
    return {
      name: "Email providers",
      status: "warn",
      message: "No email provider configured",
      hint: "Set RESEND_API_KEY, MAILTRAP_API_TOKEN, or BREVO_API_KEY.",
      category: "email",
    };
  }

  return {
    name: "Email providers",
    status: "pass",
    message: `${providers.join(" → ")} (fallback order)`,
    category: "email",
  };
}

async function checkAiProviders(): Promise<AdminHealthCheckResult> {
  const providers = getConfiguredAiProviderLabels();

  if (providers.length === 0) {
    return {
      name: "AI providers",
      status: "warn",
      message: "No AI provider configured",
      hint: "Set at least one AI provider API key for AI features.",
      category: "ai",
    };
  }

  return {
    name: "AI providers",
    status: "pass",
    message: `${providers.length} active · ${providers.join(" → ")}`,
    category: "ai",
  };
}

async function checkBilling(): Promise<AdminHealthCheckResult> {
  if (!getEnv("POLAR_ACCESS_TOKEN")) {
    return {
      name: "Billing (Polar)",
      status: "warn",
      message: "Not configured",
      hint: "Set POLAR_ACCESS_TOKEN for subscription billing.",
      category: "billing",
    };
  }

  if (!isPolarConfigured()) {
    return {
      name: "Billing (Polar)",
      status: "warn",
      message: "Partially configured",
      hint: "Set POLAR_WEBHOOK_SECRET and product IDs.",
      category: "billing",
    };
  }

  const server = getEnv("POLAR_SERVER") || "sandbox";
  return {
    name: "Billing (Polar)",
    status: "pass",
    message: `Ready (${server})`,
    category: "billing",
  };
}

async function checkRedis(): Promise<AdminHealthCheckResult> {
  const url = getEnv("UPSTASH_REDIS_REST_URL");
  const token = getEnv("UPSTASH_REDIS_REST_TOKEN");

  // `isRedisConfigured` is the single source of truth for this, but it is
  // imported dynamically rather than statically: `scripts/dev-health-check.ts`
  // loads `.env.local` *after* its imports, and a static `@/lib/env` import
  // would evaluate the env schema (and throw on a missing DATABASE_URL) before
  // dotenv has run. The direct read is the fallback for exactly that case.
  let redisConfigured = Boolean(url && token);

  try {
    const { isRedisConfigured } = await import("@/lib/env");
    redisConfigured = isRedisConfigured;
  } catch {
    // Env module not loadable in this context — keep the direct read.
  }

  if (!redisConfigured || !url || !token) {
    return {
      name: "Redis",
      status: "warn",
      message: "Not configured — in-memory fallback",
      hint: "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. The Docker Compose stack exposes a local Upstash-compatible proxy at http://127.0.0.1:8079. Caches fall back to per-instance memory, so on serverless the 24h embedding cache never hits and identical text re-embeds on every cold start.",
      category: "cache",
    };
  }

  try {
    const [, duration] = await timed(() => pingRedisRestWithRetry(url, token));
    return {
      name: "Redis",
      status: "pass",
      message: "Connected",
      duration,
      category: "cache",
    };
  } catch (err) {
    const error = err as Error;
    const msg =
      error.name === "AbortError"
        ? "Connection timeout"
        : error.message.split("\n")[0];
    return {
      name: "Redis",
      status: "warn",
      message: msg,
      hint: "Falls back to in-memory cache.",
      category: "cache",
    };
  }
}

async function checkInngest(): Promise<AdminHealthCheckResult> {
  if (isInngestDevMode()) {
    return {
      name: "Inngest",
      status: "pass",
      message: "Dev mode (local server)",
      category: "jobs",
    };
  }

  if (isInngestCloudConfigured()) {
    return {
      name: "Inngest",
      status: "pass",
      message: "Cloud configured",
      category: "jobs",
    };
  }

  return {
    name: "Inngest",
    status: "warn",
    message: "Not configured",
    hint: "Set INNGEST_DEV=1 for local dev or cloud keys for production.",
    category: "jobs",
  };
}

async function checkPushNotifications(): Promise<AdminHealthCheckResult> {
  if (!isPushConfigured()) {
    return {
      name: "Push notifications",
      status: "warn",
      message: "Not configured",
      hint: "Generate VAPID keys for web push.",
      category: "push",
    };
  }

  return {
    name: "Push notifications",
    status: "pass",
    message: "Configured",
    category: "push",
  };
}

function summarizeCategory(
  results: AdminHealthCheckResult[],
  category: AdminHealthCheckCategory,
): AdminHealthCheckStatus | "mixed" {
  const categoryResults = results.filter((r) => r.category === category);
  if (categoryResults.length === 0) return "skip";

  const statuses = new Set(categoryResults.map((r) => r.status));
  if (statuses.has("fail")) return "fail";
  if (statuses.has("warn")) return "warn";
  if (statuses.size === 1 && statuses.has("pass")) return "pass";
  if (statuses.size === 1 && statuses.has("skip")) return "skip";
  return "mixed";
}

export function buildAdminHealthSummary(
  report: AdminHealthReport,
): AdminHealthSummary {
  const categories: AdminHealthCheckCategory[] = [
    "core",
    "email",
    "ai",
    "jobs",
    "cache",
    "billing",
    "push",
  ];

  const byCategory = Object.fromEntries(
    categories.map((category) => [
      category,
      summarizeCategory(report.results, category),
    ]),
  ) as AdminHealthSummary["byCategory"];

  return {
    critical: report.critical,
    warnings: report.warnings,
    healthy: report.healthy,
    byCategory,
    checkedAt: new Date(),
  };
}

export async function runAdminHealthChecks(): Promise<AdminHealthReport> {
  const startTime = performance.now();
  const envResult = await checkEnvironment();

  if (envResult.status === "fail") {
    const report: AdminHealthReport = {
      results: [envResult],
      totalDuration: Math.round(performance.now() - startTime),
      environment: getEnv("NODE_ENV") || "unknown",
      critical: 1,
      warnings: 0,
      healthy: 0,
    };
    return report;
  }

  const [
    dbResult,
    supabaseResult,
    storageResult,
    authResult,
    emailResult,
    aiResult,
    billingResult,
    redisResult,
    inngestResult,
    pushResult,
    adminAccessResult,
  ] = await Promise.all([
    checkDatabase(),
    checkSupabase(),
    checkStorage(),
    checkBetterAuth(),
    checkEmail(),
    checkAiProviders(),
    checkBilling(),
    checkRedis(),
    checkInngest(),
    checkPushNotifications(),
    checkAdminAccess(),
  ]);

  const results: AdminHealthCheckResult[] = [
    envResult,
    dbResult,
    supabaseResult,
    storageResult,
    authResult,
    emailResult,
    aiResult,
    billingResult,
    redisResult,
    inngestResult,
    pushResult,
    adminAccessResult,
  ];

  const critical = results.filter((r) => r.status === "fail").length;
  const warnings = results.filter((r) => r.status === "warn").length;
  const healthy = results.filter((r) => r.status === "pass").length;

  return {
    results,
    totalDuration: Math.round(performance.now() - startTime),
    environment: getEnv("NODE_ENV") || "development",
    critical,
    warnings,
    healthy,
  };
}

export type AdminConfigMatrixRow = {
  integration: string;
  configured: boolean;
  notes: string;
};

export function getAdminConfigMatrix(): AdminConfigMatrixRow[] {
  const aiProviders = getConfiguredAiProviderLabels();
  const emailProviders = getConfiguredEmailProviderLabels();

  return [
    {
      integration: "Database",
      configured: Boolean(getEnv("DATABASE_URL")),
      notes: "PostgreSQL via DATABASE_URL",
    },
    {
      integration: "Better Auth",
      configured: Boolean(getEnv("BETTER_AUTH_SECRET") && getEnv("BETTER_AUTH_URL")),
      notes: "Session and admin JWT signing",
    },
    {
      integration: "Supabase",
      configured: Boolean(
        getEnv("NEXT_PUBLIC_SUPABASE_URL") && getEnv("SUPABASE_SERVICE_ROLE_KEY"),
      ),
      notes: "Storage and realtime",
    },
    {
      integration: "Email",
      configured: isEmailConfigured(),
      notes: emailProviders.length
        ? emailProviders.join(" → ")
        : "No provider configured",
    },
    {
      integration: "AI",
      configured: aiProviders.length > 0,
      notes: aiProviders.length
        ? `${aiProviders.length} providers · ${aiProviders.join(" → ")}`
        : "No provider configured",
    },
    {
      integration: "Inngest",
      configured: isInngestDevMode() || isInngestCloudConfigured(),
      notes: isInngestDevMode()
        ? "Dev mode"
        : isInngestCloudConfigured()
          ? "Cloud"
          : "Not configured",
    },
    {
      integration: "Redis cache",
      configured: Boolean(
        getEnv("UPSTASH_REDIS_REST_URL") && getEnv("UPSTASH_REDIS_REST_TOKEN"),
      ),
      notes: "Upstash REST · AI cache layer · embedding cache",
    },
    {
      integration: "Billing (Polar)",
      configured: isPolarConfigured(),
      notes: getEnv("POLAR_ACCESS_TOKEN")
        ? `Server: ${getEnv("POLAR_SERVER") || "sandbox"}`
        : "Not configured",
    },
    {
      integration: "Push (VAPID)",
      configured: isPushConfigured(),
      notes: isPushConfigured() ? "Web push enabled" : "Not configured",
    },
    {
      integration: "Admin access",
      configured: Boolean(getEnv("ADMIN_EMAILS")),
      notes: "DB role-based (user.role = admin). Admin emails are bootstrap-only.",
    },
  ];
}
