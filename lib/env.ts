import { z } from "zod";

import { deploymentModes } from "@/lib/deployment-mode";

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  }, schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * `cloud` is the managed Requo Cloud service; `self-hosted` is an
   * independently operated installation. Missing values keep the historical
   * Cloud behavior so existing deployments do not change on upgrade.
   */
  REQUO_DEPLOYMENT_MODE: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;

      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z
      .enum(deploymentModes, {
        error: 'REQUO_DEPLOYMENT_MODE must be "cloud" or "self-hosted".',
      })
      .default("cloud"),
  ),
  DATABASE_URL: z.string().min(1),
  /**
   * Storage backend. Explicit values override the historical auto-detection:
   * Supabase credentials present -> supabase, otherwise local disk.
   */
  REQUO_STORAGE_DRIVER: emptyToUndefined(
    z.enum(["supabase", "s3", "local"]),
  ),
  /** Realtime transport. `supabase` also requires SUPABASE_JWT_SECRET. */
  REQUO_REALTIME_DRIVER: emptyToUndefined(z.enum(["supabase", "none"])),
  /** Billing provider. `none` grants the full product tier without billing. */
  REQUO_BILLING_DRIVER: emptyToUndefined(
    z.enum(["none", "polar", "paymongo"]),
  ),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  /**
   * Require email verification for password sign-ups. Defaults to true.
   * Set to false only for installs that intentionally run without email.
   */
  AUTH_REQUIRE_EMAIL_VERIFICATION: emptyToUndefined(
    z.enum(["0", "1", "true", "false"]),
  ),
  NEXT_PUBLIC_BETTER_AUTH_URL: emptyToUndefined(z.url()),
  APP_TOKEN_HASH_SECRET: emptyToUndefined(z.string().min(32)),
  ADMIN_EMAILS: emptyToUndefined(z.string().min(1)),
  VERCEL_URL: emptyToUndefined(z.string().min(1)),

  GOOGLE_CLIENT_ID: emptyToUndefined(z.string().min(1)),
  GOOGLE_CLIENT_SECRET: emptyToUndefined(z.string().min(1)),
  /** HTML tag verification value from Google Search Console (meta name="google-site-verification"). */
  GOOGLE_SITE_VERIFICATION: emptyToUndefined(z.string().min(1)),
  NEXT_PUBLIC_SUPABASE_URL: emptyToUndefined(z.url()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: emptyToUndefined(z.string().min(1)),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: emptyToUndefined(z.string().min(1)),
  SUPABASE_SERVICE_ROLE_KEY: emptyToUndefined(z.string().min(1)),
  SUPABASE_JWT_SECRET: emptyToUndefined(z.string().min(1)),
  /** S3-compatible storage (AWS S3, Cloudflare R2, MinIO, Backblaze B2). */
  S3_BUCKET: emptyToUndefined(z.string().trim().min(1)),
  S3_REGION: emptyToUndefined(z.string().trim().min(1)),
  S3_ENDPOINT: emptyToUndefined(z.url()),
  S3_ACCESS_KEY_ID: emptyToUndefined(z.string().trim().min(1)),
  S3_SECRET_ACCESS_KEY: emptyToUndefined(z.string().min(1)),
  S3_FORCE_PATH_STYLE: emptyToUndefined(
    z.enum(["0", "1", "true", "false"]),
  ),
  /** Optional key prefix inside S3_BUCKET. */
  S3_PREFIX: emptyToUndefined(z.string().trim().min(1)),
  /** Filesystem root for REQUO_STORAGE_DRIVER=local. */
  LOCAL_STORAGE_ROOT: emptyToUndefined(z.string().trim().min(1)),
  /** Geo header used for display currency, e.g. cf-ipcountry. */
  GEO_COUNTRY_HEADER: emptyToUndefined(z.string().trim().min(1)),
  RESEND_API_KEY: emptyToUndefined(z.string().min(1)),
  RESEND_FROM_EMAIL: emptyToUndefined(z.string().trim().min(1)),
  RESEND_REPLY_TO_EMAIL: emptyToUndefined(z.email()),
  CRISP_WEBSITE_ID: emptyToUndefined(z.string().min(1)),
  NEXT_PUBLIC_SENTRY_DSN: emptyToUndefined(z.url()),
  MAILTRAP_API_TOKEN: emptyToUndefined(z.string().min(1)),
  BREVO_API_KEY: emptyToUndefined(z.string().min(1)),
  /** Email driver: auto (fallback chain) or a named provider. */
  REQUO_EMAIL_DRIVER: emptyToUndefined(
    z.enum(["auto", "resend", "mailtrap", "brevo", "smtp"]),
  ),
  SMTP_HOST: emptyToUndefined(z.string().trim().min(1)),
  SMTP_PORT: emptyToUndefined(z.coerce.number().int().min(1).max(65535)),
  SMTP_SECURE: emptyToUndefined(z.enum(["0", "1", "true", "false"])),
  SMTP_ALLOW_INSECURE_AUTH: emptyToUndefined(z.enum(["0", "1", "true", "false"])),
  SMTP_USER: emptyToUndefined(z.string().trim().min(1)),
  SMTP_PASSWORD: emptyToUndefined(z.string().min(1)),
  EMAIL_DOMAIN: emptyToUndefined(z.string().trim().min(1)).default("test.requo.app"),
  EMAIL_FROM_DEFAULT: emptyToUndefined(z.string().trim().min(1)),
  EMAIL_FROM_NOTIFICATIONS: emptyToUndefined(z.string().trim().min(1)),
  EMAIL_FROM_SYSTEM: emptyToUndefined(z.string().trim().min(1)),
  EMAIL_FROM_QUOTES: emptyToUndefined(z.string().trim().min(1)),
  EMAIL_FROM_SUPPORT: emptyToUndefined(z.string().trim().min(1)),
  GROQ_API_KEY: emptyToUndefined(z.string().min(1)),
  GEMINI_API_KEY: emptyToUndefined(z.string().min(1)),
  OPENROUTER_API_KEY: emptyToUndefined(z.string().min(1)),
  CLOUDFLARE_ACCOUNT_ID: emptyToUndefined(z.string().min(1)),
  CLOUDFLARE_API_TOKEN: emptyToUndefined(z.string().min(1)),
  NVIDIA_NIM_API_KEY: emptyToUndefined(z.string().min(1)),
  /**
   * Self-hosted custom provider. Any OpenAI-compatible endpoint works; the
   * provider is ignored in Cloud mode. `AI_CUSTOM_API_KEY` is optional so a
   * local Ollama/vLLM endpoint can run without authentication.
   */
  AI_CUSTOM_BASE_URL: emptyToUndefined(z.url()),
  AI_CUSTOM_API_KEY: emptyToUndefined(z.string().min(1)),
  AI_CUSTOM_MODEL: emptyToUndefined(z.string().trim().min(1)),
  AI_CUSTOM_CONTEXT_WINDOW: emptyToUndefined(z.coerce.number().int().min(1)),
  AI_CUSTOM_MAX_OUTPUT_TOKENS: emptyToUndefined(z.coerce.number().int().min(1)),
  AI_CUSTOM_QUALITY: emptyToUndefined(z.coerce.number().int().min(1).max(10)),
  AI_CUSTOM_TOOLS: emptyToUndefined(z.enum(["0", "1", "true", "false"])),
  AI_CUSTOM_COST_INPUT: emptyToUndefined(z.coerce.number().min(0)),
  AI_CUSTOM_COST_OUTPUT: emptyToUndefined(z.coerce.number().min(0)),
  DEMO_OWNER_NAME: emptyToUndefined(z.string().trim().min(1)),
  DEMO_OWNER_EMAIL: emptyToUndefined(z.email()),
  DEMO_OWNER_PASSWORD: emptyToUndefined(z.string().min(8)),
  DEMO_BUSINESS_NAME: emptyToUndefined(z.string().trim().min(1)),
  DEMO_BUSINESS_SLUG: emptyToUndefined(z.string().trim().min(1)),
  DEMO_QUOTE_PUBLIC_TOKEN: emptyToUndefined(z.string().trim().min(1)),
  DEMO_EXPIRED_QUOTE_PUBLIC_TOKEN: emptyToUndefined(z.string().trim().min(1)),
  DEMO_VOIDED_QUOTE_PUBLIC_TOKEN: emptyToUndefined(z.string().trim().min(1)),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: emptyToUndefined(z.string().min(1)),
  VAPID_PRIVATE_KEY: emptyToUndefined(z.string().min(1)),

  POLAR_ACCESS_TOKEN: emptyToUndefined(z.string().min(1)),
  POLAR_WEBHOOK_SECRET: emptyToUndefined(z.string().min(1)),
  POLAR_SERVER: emptyToUndefined(z.enum(["sandbox", "production"])).default(
    "sandbox",
  ),
  POLAR_PRO_PRODUCT_ID: emptyToUndefined(z.string().min(1)),
  POLAR_BUSINESS_PRODUCT_ID: emptyToUndefined(z.string().min(1)),
  POLAR_PRO_YEARLY_PRODUCT_ID: emptyToUndefined(z.string().min(1)),
  POLAR_BUSINESS_YEARLY_PRODUCT_ID: emptyToUndefined(z.string().min(1)),
  /** Product ids used before the current pricing; kept for webhook reverse-resolution of active subscriptions. */
  POLAR_LEGACY_PRO_PRODUCT_ID: emptyToUndefined(z.string().min(1)),
  POLAR_LEGACY_BUSINESS_PRODUCT_ID: emptyToUndefined(z.string().min(1)),
  POLAR_LEGACY_PRO_YEARLY_PRODUCT_ID: emptyToUndefined(z.string().min(1)),
  POLAR_LEGACY_BUSINESS_YEARLY_PRODUCT_ID: emptyToUndefined(z.string().min(1)),
  NEXT_PUBLIC_APP_URL: emptyToUndefined(z.url()),

  /**
   * PayMongo QR Ph (Philippines only). PayMongo is a payment gateway, not a
   * merchant of record. Secret keys are `sk_test_...` or `sk_live_...`; the
   * prefix selects test vs live webhook signatures. The webhook secret comes
   * from the endpoint registered in Developer Tools → Webhooks.
   */
  PAYMONGO_SECRET_KEY: emptyToUndefined(z.string().min(1)),
  PAYMONGO_WEBHOOK_SECRET: emptyToUndefined(z.string().min(1)),

  INNGEST_DEV: emptyToUndefined(z.enum(["0", "1"]).or(z.literal("true"))),
  INNGEST_EVENT_KEY: emptyToUndefined(z.string().min(1)),
  INNGEST_SIGNING_KEY: emptyToUndefined(z.string().min(1)),

  /**
   * Deployment-level low-email mode for limited/free provider quotas.
   * When "1"/"true", optional operational emails are disabled at the
   * feature/job boundary while required auth email (verification, password
   * reset) and explicit owner-requested quote delivery keep working.
   *
   * Optional paths gated by this flag:
   * - inquiry acknowledgment email (per-business `sendInquiryAckEmail` still
   *   controls non-low-email deployments; new businesses default off in low mode)
   * - follow-up reminder email (in-app `follow_up_due` notifications still sent)
   * - quote auto-follow-up customer emails
   * - weekly analytics digest emails
   * - analytics scheduled report emails
   * - business member invite emails (invite creation + copy-link still work)
   *
   * Explicit quote delivery (`sendQuoteEmail`) and manual quote-link sharing
   * are never gated by this flag.
   */
  LOW_EMAIL_MODE: emptyToUndefined(z.enum(["0", "1", "true", "false"])),
  /**
   * Independently disable passwordless magic-link login email without
   * affecting password login, verification, or password reset.
   * When "1"/"true", the magic-link UI is hidden and no magic-link email
   * is sent. Defaults to enabled when email is configured.
   */
  DISABLE_MAGIC_LINK: emptyToUndefined(z.enum(["0", "1", "true", "false"])),
  /**
   * Test/seed-only kill-switch for transactional auth emails (verification,
   * password reset, magic link). Never set in production; auth flows either
   * fail loud or skip silent per flow when email is unconfigured.
   */
  DISABLE_TRANSACTIONAL_EMAILS: emptyToUndefined(
    z.enum(["0", "1", "true", "false"]),
  ),

  AI_CANARY_SECRET: emptyToUndefined(z.string().min(16)),

  UPSTASH_REDIS_REST_URL: emptyToUndefined(z.url()),
  UPSTASH_REDIS_REST_TOKEN: emptyToUndefined(z.string().min(1)),
  CRON_SECRET: emptyToUndefined(z.string().min(16)),
}).superRefine((value, ctx) => {
  const hasBaseUrl = Boolean(value.AI_CUSTOM_BASE_URL);
  const hasModel = Boolean(value.AI_CUSTOM_MODEL);

  if (hasBaseUrl !== hasModel) {
    ctx.addIssue({
      code: "custom",
      message: "AI_CUSTOM_BASE_URL and AI_CUSTOM_MODEL must be set together.",
      path: [hasBaseUrl ? "AI_CUSTOM_MODEL" : "AI_CUSTOM_BASE_URL"],
    });
  }
});

export const env = envSchema.parse(process.env);

export const supabaseKey =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseKey,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
};

function hasConfiguredEmailSender() {
  return Boolean(
    env.EMAIL_FROM_DEFAULT ||
      env.EMAIL_FROM_NOTIFICATIONS ||
      env.EMAIL_FROM_SYSTEM ||
      env.EMAIL_FROM_QUOTES ||
      env.EMAIL_FROM_SUPPORT ||
      env.RESEND_FROM_EMAIL ||
      env.EMAIL_DOMAIN,
  );
}

export const isResendConfigured = Boolean(
  env.RESEND_API_KEY && hasConfiguredEmailSender(),
);
export const isMailtrapConfigured = Boolean(
  env.MAILTRAP_API_TOKEN && hasConfiguredEmailSender(),
);
export const isBrevoConfigured = Boolean(
  env.BREVO_API_KEY && hasConfiguredEmailSender(),
);
export const isSmtpConfigured = Boolean(
  env.SMTP_HOST && env.SMTP_PORT && hasConfiguredEmailSender(),
);
export const isEmailConfigured = Boolean(
  isResendConfigured ||
    isMailtrapConfigured ||
    isBrevoConfigured ||
    isSmtpConfigured,
);

export const isGroqConfigured = Boolean(env.GROQ_API_KEY);
export const isGeminiConfigured = Boolean(env.GEMINI_API_KEY);
export const isSupabaseConfigured = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
);
/** Explicit realtime driver; defaults to Supabase when its JWT secret exists. */
export const realtimeDriver =
  env.REQUO_REALTIME_DRIVER ?? (env.SUPABASE_JWT_SECRET ? "supabase" : "none");
export const isSupabaseRealtimeConfigured = Boolean(
  realtimeDriver === "supabase" &&
    env.SUPABASE_JWT_SECRET &&
    env.NEXT_PUBLIC_SUPABASE_URL &&
    (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);
export const isEmailVerificationRequired = !(
  env.AUTH_REQUIRE_EMAIL_VERIFICATION === "0" ||
  env.AUTH_REQUIRE_EMAIL_VERIFICATION === "false"
);

export const isOpenRouterConfigured = Boolean(
  (process.env.OPENROUTER_API_KEY ?? "").trim().length > 0,
);
export const isCloudflareAiConfigured = Boolean(
  env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN,
);
export const isNvidiaNimConfigured = Boolean(env.NVIDIA_NIM_API_KEY);

/**
 * Whether the Upstash Redis cache layer is usable.
 *
 * Deliberately not a hard requirement — every consumer is best-effort:
 * caches, duplicate suppression, cooldowns, lockout counters, circuit-breaker
 * state, health/selection telemetry, and the capacity selector's ranking
 * mirror degrade to an in-process fallback (or to the database) when this is
 * false.
 *
 * Correctness-critical limits do not depend on it:
 * - Monthly AI spend is reserved in `ai_usage_events` (`usage-limiter.ts`).
 * - Provider capacity is reserved in `ai_capacity_counters`
 *   (`capacity-store.ts`); Redis only mirrors those counters for selection.
 * - Public action rate limits fall back to `public_action_events`.
 *
 * The consequence is still worth naming: caches become per-instance rather
 * than shared, which on serverless means a near-zero hit rate. The 24h
 * content-hash embedding cache in `lib/ai/embeddings.ts` is the clearest
 * example — identical text re-embeds on every cold start, which is paid for in
 * latency and in rate-limit headroom against the free-tier Gemini quota.
 */
export const isRedisConfigured = Boolean(
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN,
);
export const isPushConfigured = Boolean(
  env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY,
);

export const isPolarConfigured = Boolean(
  env.POLAR_ACCESS_TOKEN &&
    env.POLAR_WEBHOOK_SECRET &&
    (env.POLAR_PRO_PRODUCT_ID ||
      env.POLAR_BUSINESS_PRODUCT_ID ||
      env.POLAR_PRO_YEARLY_PRODUCT_ID ||
      env.POLAR_BUSINESS_YEARLY_PRODUCT_ID),
);

/**
 * Whether QR Ph checkout and webhook verification are fully configured. A key
 * whose prefix does not resolve to test or live mode is treated as
 * unconfigured so the option never appears for a half-wired provider.
 */
export const isPaymongoConfigured = Boolean(
  env.PAYMONGO_SECRET_KEY &&
    env.PAYMONGO_WEBHOOK_SECRET &&
    getPaymongoMode(),
);

/**
 * Test vs live mode is encoded in the secret key prefix. QR Ph checkout and
 * webhook verification must agree on it so a test webhook can never activate a
 * live subscription (or vice versa).
 */
export function getPaymongoMode(): "test" | "live" | null {
  const key = env.PAYMONGO_SECRET_KEY;

  if (!key) return null;
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";

  return null;
}

export const isInngestDevMode = Boolean(
  env.INNGEST_DEV === "1" || env.INNGEST_DEV === "true",
);

export const isLowEmailMode =
  env.LOW_EMAIL_MODE === "1" || env.LOW_EMAIL_MODE === "true";

export const isMagicLinkLoginEnabled = !(
  env.DISABLE_MAGIC_LINK === "1" || env.DISABLE_MAGIC_LINK === "true"
);

/** UI gate: show magic-link sign-in only when email works and it isn't disabled. */
export const isMagicLinkEnabled = Boolean(
  isEmailConfigured && isMagicLinkLoginEnabled,
);

/**
 * Deployment-level switches for optional email paths. Each defaults to
 * disabled in low-email mode and enabled otherwise. Per-business settings
 * (e.g. `sendInquiryAckEmail`, `notifyOnFollowUpReminder`,
 * `analyticsDigestEnabled`, per-report `enabled`) still apply when the
 * deployment switch is on — both must allow sending.
 */
export const isInquiryAckEmailEnabled = !isLowEmailMode;
export const isFollowUpReminderEmailEnabled = !isLowEmailMode;
export const isFollowUpAutoSendEmailEnabled = !isLowEmailMode;
export const isQuoteAutoFollowUpEmailEnabled = !isLowEmailMode;
export const isAnalyticsDigestEmailEnabled = !isLowEmailMode;
export const isAnalyticsScheduledReportEmailEnabled = !isLowEmailMode;
export const isMemberInviteEmailEnabled = !isLowEmailMode;

/**
 * Human-readable inventory of which email paths are active for this
 * deployment. Keep in sync with the gates above and the call sites in
 * `lib/email/transactional.ts`, the feature job modules, and `lib/auth/config.ts`.
 * Used for quota reasoning and docs; not a send path itself.
 */
export function getActiveEmailPaths() {
  return [
    {
      key: "auth-verification",
      label: "Email verification",
      active: true,
      reason: "Required for signup. Never gated by low-email mode.",
    },
    {
      key: "auth-password-reset",
      label: "Password reset",
      active: true,
      reason: "Required for account recovery. Never gated by low-email mode.",
    },
    {
      key: "auth-magic-link",
      label: "Magic-link login",
      active: isMagicLinkEnabled,
      reason: isMagicLinkLoginEnabled
        ? isEmailConfigured
          ? "Enabled (email configured, magic link not disabled)."
          : "Disabled (email not configured)."
        : "Disabled (DISABLE_MAGIC_LINK=1).",
    },
    {
      key: "quote-explicit",
      label: "Explicit quote delivery (owner-requested)",
      active: true,
      reason:
        "Core inquiry-to-quote workflow. Never gated by low-email mode; requires email configuration.",
    },
    {
      key: "quote-manual-link",
      label: "Manual quote-link sharing",
      active: true,
      reason: "No email involved. Always available.",
    },
    {
      key: "inquiry-ack",
      label: "Inquiry acknowledgment email",
      active: isInquiryAckEmailEnabled,
      reason: isLowEmailMode
        ? "Disabled (LOW_EMAIL_MODE=1). Per-business sendInquiryAckEmail can re-enable once low-email mode is off."
        : "Per-business sendInquiryAckEmail setting.",
    },
    {
      key: "follow-up-reminder",
      label: "Follow-up reminder email (in-app retained)",
      active: isFollowUpReminderEmailEnabled,
      reason: isLowEmailMode
        ? "Disabled (LOW_EMAIL_MODE=1). In-app follow_up_due notifications still sent via notifyInAppOnFollowUpReminder."
        : "Per-business notifyOnFollowUpReminder setting.",
    },
    {
      key: "quote-auto-follow-up",
      label: "Quote auto-follow-up emails",
      active: isQuoteAutoFollowUpEmailEnabled,
      reason: isLowEmailMode
        ? "Disabled (LOW_EMAIL_MODE=1)."
        : "Per-quote autoFollowUpEnabled setting.",
    },
    {
      key: "follow-up-auto-send",
      label: "Automatic follow-up sends",
      active: isFollowUpAutoSendEmailEnabled,
      reason: isLowEmailMode
        ? "Disabled (LOW_EMAIL_MODE=1)."
        : "Per-follow-up sendMode setting.",
    },
    {
      key: "analytics-digest",
      label: "Weekly analytics digest",
      active: isAnalyticsDigestEmailEnabled,
      reason: isLowEmailMode
        ? "Disabled (LOW_EMAIL_MODE=1)."
        : "Per-business analyticsDigestEnabled setting.",
    },
    {
      key: "analytics-scheduled-reports",
      label: "Analytics scheduled reports",
      active: isAnalyticsScheduledReportEmailEnabled,
      reason: isLowEmailMode
        ? "Disabled (LOW_EMAIL_MODE=1). Set report records to disabled for defense in depth."
        : "Per-report enabled setting.",
    },
    {
      key: "member-invite",
      label: "Business member invite email (link copy available)",
      active: isMemberInviteEmailEnabled,
      reason: isLowEmailMode
        ? "Disabled (LOW_EMAIL_MODE=1). Invite creation + copy-link sharing still work."
        : "Sent on invite creation; invite link also returned for manual sharing.",
    },
  ] as const;
}

export const isInngestCloudConfigured = Boolean(
  env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY,
);

