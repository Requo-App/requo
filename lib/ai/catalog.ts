import "server-only";

/**
 * Unified free-tier model catalog — the single source of truth for model
 * identifiers, free-tier allowances, capabilities, and list pricing.
 *
 * Replaces three disagreeing lists:
 * - `lib/ai/model-options.ts` (docs/selection UI)
 * - `lib/ai/capacity-selector.ts` MODEL_CAPACITIES (routing)
 * - `lib/ai/token-logger.ts` TOKEN_COST_TABLE (pricing)
 *
 * Keyed by the provider prefix the runtime registry uses
 * (`groq`, `google`, `cloudflare`, `nvidia`, `openrouter`). In particular
 * Gemini entries use `google:` — the cost table previously keyed them under
 * `gemini:`, so every Gemini-served turn was logged as unpriced.
 *
 * This catalog is also the routing allowlist: every identifier named by a
 * routing profile must match an entry here, and the router has no manual
 * model-override path. An entry normally belongs here only when the provider
 * offers an ongoing free tier with no card, no expiring trial credits, and no
 * paid-plan requirement. Providers that fail that test are removed, not
 * commented out.
 *
 * NVIDIA NIM is the deliberate exception: Requo routes it in production even
 * though NVIDIA documents build.nvidia.com endpoints for prototyping and
 * development only, with production use requiring NVIDIA AI Enterprise. The
 * entry is kept because production routing was explicitly requested; it is
 * not a claim that NVIDIA's hosted free tier is licensed for production. See
 * `docs/setup/ai-provider-limits.md` for the operational and legal caveat.
 *
 * Reviewed 2026-10-22 against the sources below. Groq's console pages
 * returned HTTP 403 to the audit environment, so its request ceilings remain
 * the prior documented figures rather than a fresh verification. See
 * `docs/setup/ai-provider-limits.md` for the per-provider status.
 * - Groq rate limits + model pages: https://console.groq.com/docs/rate-limits
 * - Gemini pricing/models/rate limits: https://ai.google.dev/gemini-api/docs
 * - Cloudflare Workers AI pricing/limits + model pages:
 *   https://developers.cloudflare.com/workers-ai/platform/pricing/
 * - NVIDIA NIM API catalog/FAQ + AI Enterprise:
 *   https://build.nvidia.com/ and
 *   https://forums.developer.nvidia.com/t/nvidia-nim-faq/300317/1
 * - OpenRouter limits + live `/api/v1/models` metadata:
 *   https://openrouter.ai/docs/api-reference/limits
 *
 * Limits were researched from provider documentation and live `models`
 * endpoint probes. Where a provider stopped publishing a static limit
 * (Gemini's per-model free RPD/RPM), the entry records a conservative
 * deployment budget and says so; the provider console is authoritative.
 * Every allowance stays overridable from the environment (see below) so a
 * provider changing its free tier is a config change, not a release.
 *
 * `costCentsPerMillion` is list price for observability. Free-tier traffic
 * is billed at zero; logged cost is list-price equivalent, not spend.
 */

/** The quota dimensions the selector can enforce. */
export const QUOTA_DIMENSIONS = ["rpm", "rpd", "tpm", "tpd"] as const;

export type QuotaDimension = (typeof QUOTA_DIMENSIONS)[number];

export type ModelQuotaLimits = Record<QuotaDimension, number> & {
  /** Cloudflare only: neurons per 1M tokens, billed against a daily pool. */
  neuronsPerMillion?: { input: number; output: number };
};

export type ModelEntry = {
  modelId: `${string}:${string}`;
  quality: number; // 1-10
  contextWindow: number;
  maxOutputTokens: number;
  toolCapable: boolean;
  structuredOutput: boolean;
  limits: ModelQuotaLimits;
  /** Which limits are per-organisation rather than per-model. */
  sharedWithProvider: QuotaDimension[];
  /** When the day counter resets, so exhaustion cooldowns are accurate. */
  dayResets: "rolling" | "utc-midnight" | "pacific-midnight";
  costCentsPerMillion: { input: number; output: number };
  /** Held back for last: too small an allowance to carry normal traffic. */
  reserve?: boolean;
};

/**
 * A positive quota ceiling, or `null` when the dimension is not published or
 * not modelled. Zero is deliberately not "unlimited": every caller must skip
 * an unpriced dimension rather than compute a load ratio of zero and pretend
 * the model has infinite headroom.
 */
export function quotaLimit(
  entry: Pick<ModelEntry, "limits">,
  dimension: QuotaDimension,
): number | null {
  const value = entry.limits[dimension];
  return Number.isFinite(value) && value > 0 ? value : null;
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function providerOf(modelId: string): string {
  return modelId.split(":")[0] ?? "";
}

/**
 * Environment overrides. Extends the existing `AI_TPM_<PROVIDER>` convention
 * with per-minute request, per-day request and per-day token equivalents,
 * plus dedicated overrides for OpenRouter's daily request cap and
 * Cloudflare's daily neuron pool.
 *
 * - AI_RPM_<PROVIDER>, AI_RPD_<PROVIDER>, AI_TPM_<PROVIDER>, AI_TPD_<PROVIDER>
 * - AI_RPD_OPENROUTER (alias: OPENROUTER_DAILY_REQUESTS)
 * - AI_NEURONS_CLOUDFLARE_DAILY (alias: CLOUDFLARE_DAILY_NEURONS)
 * - AI_*_GEMINI (alias for AI_*_GOOGLE; the registry prefix is `google`)
 */
export function getProviderOverride(
  provider: string,
  dimension: "rpm" | "rpd" | "tpm" | "tpd",
  fallback: number,
): number {
  const upper = provider.toUpperCase();
  const primary = envNumber(`AI_${dimension.toUpperCase()}_${upper}`, fallback);
  if (primary !== fallback) return primary;
  // Dedicated aliases.
  if (provider === "openrouter" && dimension === "rpd") {
    const alias = envNumber("OPENROUTER_DAILY_REQUESTS", fallback);
    if (alias !== fallback) return alias;
  }
  // Gemini's registry prefix is `google`, but operators know the provider as
  // Gemini and the documented environment names use `AI_*_GEMINI`.
  const geminiAlias =
    provider === "google"
      ? "gemini"
      : provider === "gemini"
        ? "google"
        : null;
  if (geminiAlias) {
    const alias = envNumber(
      `AI_${dimension.toUpperCase()}_${geminiAlias.toUpperCase()}`,
      fallback,
    );
    if (alias !== fallback) return alias;
  }
  return fallback;
}

export function getNeuronPoolOverride(fallback: number): number {
  const primary = envNumber("AI_NEURONS_CLOUDFLARE_DAILY", fallback);
  if (primary !== fallback) return primary;
  return envNumber("CLOUDFLARE_DAILY_NEURONS", fallback);
}

/** Cloudflare's free neuron budget: 10,000 neurons/day, resets 00:00 UTC. */
export const CLOUDFLARE_DAILY_NEURON_POOL = 10_000;

// ---------------------------------------------------------------------------
// Base catalog (before env overrides)
// ---------------------------------------------------------------------------

const BASE_CATALOG: ModelEntry[] = [
  // ─── Groq: 30 RPM · 1K RPD · 8K TPM · 200K TPD, per-organisation ───
  // Free tier requires no card. All four dimensions are shared by every Groq
  // model, so adding a second Groq identifier adds no capacity — only a
  // different quality/latency point. Llama identifiers are Enterprise-only
  // and are deliberately absent.
  {
    modelId: "groq:openai/gpt-oss-120b",
    quality: 9,
    contextWindow: 131_072,
    maxOutputTokens: 65_536,
    toolCapable: true,
    structuredOutput: true,
    limits: { rpm: 30, rpd: 1_000, tpm: 8_000, tpd: 200_000 },
    sharedWithProvider: ["rpm", "rpd", "tpm", "tpd"],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 15, output: 60 },
  },
  {
    modelId: "groq:openai/gpt-oss-20b",
    quality: 7,
    contextWindow: 131_072,
    maxOutputTokens: 65_536,
    toolCapable: true,
    structuredOutput: true,
    limits: { rpm: 30, rpd: 1_000, tpm: 8_000, tpd: 200_000 },
    sharedWithProvider: ["rpm", "rpd", "tpm", "tpd"],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 7.5, output: 30 },
  },
  {
    modelId: "groq:qwen/qwen3.8-27b",
    quality: 8,
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    toolCapable: true,
    structuredOutput: true,
    limits: { rpm: 30, rpd: 1_000, tpm: 8_000, tpd: 200_000 },
    sharedWithProvider: ["rpm", "rpd", "tpm", "tpd"],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 80, output: 400 },
  },

  // ─── Gemini: free tier, per-project, Pacific midnight reset ───
  // Google no longer publishes static per-model free RPM/RPD. The values
  // below are conservative deployment budgets, not provider claims; AI
  // Studio's per-project rate-limit page is authoritative and the AI_* env
  // overrides win. Free-tier content is used to improve Google products —
  // see the legal disclosures in `features/legal/`.
  //
  // The 2.5 family is absent because 2.5 access is restricted to prior users.
  // Gemini 4 Argon and 3.1 Pro Preview are paid-only and never belong here.
  {
    modelId: "google:gemini-3.8-flash",
    quality: 9,
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    toolCapable: true,
    structuredOutput: true,
    limits: { rpm: 10, rpd: 250, tpm: 250_000, tpd: 0 },
    sharedWithProvider: [],
    dayResets: "pacific-midnight",
    costCentsPerMillion: { input: 75, output: 375 },
  },
  {
    modelId: "google:gemini-3.6-flash",
    quality: 8,
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    toolCapable: true,
    structuredOutput: true,
    limits: { rpm: 10, rpd: 250, tpm: 250_000, tpd: 0 },
    sharedWithProvider: [],
    dayResets: "pacific-midnight",
    costCentsPerMillion: { input: 75, output: 375 },
  },
  {
    modelId: "google:gemini-3.1-flash-lite",
    quality: 8,
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    toolCapable: true,
    structuredOutput: true,
    limits: { rpm: 15, rpd: 500, tpm: 250_000, tpd: 0 },
    sharedWithProvider: [],
    dayResets: "pacific-midnight",
    costCentsPerMillion: { input: 25, output: 150 },
  },
  {
    modelId: "google:gemini-3.5-flash-lite",
    quality: 8,
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    toolCapable: true,
    structuredOutput: true,
    limits: { rpm: 15, rpd: 500, tpm: 250_000, tpd: 0 },
    sharedWithProvider: [],
    dayResets: "pacific-midnight",
    costCentsPerMillion: { input: 30, output: 250 },
  },

  // ─── Cloudflare Workers AI: 10,000 neurons/day (00:00 UTC) · 300 RPM ───
  // The neuron pool is the real daily budget; RPM is account-wide. Models are
  // function-calling capable. Workers AI exposes `response_format`, but this
  // catalog only marks strict JSON-schema support as structured output, so
  // these entries stay false. Workers AI does not publish a per-model output
  // cap; `maxOutputTokens` is a conservative deployment ceiling.
  {
    modelId: "cloudflare:@cf/openai/gpt-oss-120b",
    quality: 8,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    toolCapable: true,
    structuredOutput: false,
    limits: {
      rpm: 300,
      rpd: 0,
      tpm: 10_000,
      tpd: 0,
      neuronsPerMillion: { input: 31_818, output: 68_182 },
    },
    sharedWithProvider: ["rpm"],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 35, output: 75 },
  },
  {
    modelId: "cloudflare:@cf/openai/gpt-oss-20b",
    quality: 7,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    toolCapable: true,
    structuredOutput: false,
    limits: {
      rpm: 300,
      rpd: 0,
      tpm: 10_000,
      tpd: 0,
      neuronsPerMillion: { input: 18_182, output: 27_273 },
    },
    sharedWithProvider: ["rpm"],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 20, output: 30 },
  },
  {
    modelId: "cloudflare:@cf/zai-org/glm-4.7-flash",
    quality: 6,
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    toolCapable: true,
    structuredOutput: false,
    limits: {
      rpm: 300,
      rpd: 0,
      tpm: 10_000,
      tpd: 0,
      neuronsPerMillion: { input: 5_500, output: 36_400 },
    },
    sharedWithProvider: ["rpm"],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 6.05, output: 40 },
  },
  {
    modelId: "cloudflare:@cf/qwen/qwen3-30b-a3b-fp8",
    quality: 5,
    contextWindow: 32_768,
    maxOutputTokens: 8_192,
    toolCapable: true,
    structuredOutput: false,
    limits: {
      rpm: 300,
      rpd: 0,
      tpm: 10_000,
      tpd: 0,
      neuronsPerMillion: { input: 4_625, output: 30_475 },
    },
    sharedWithProvider: ["rpm"],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 5.1, output: 33.5 },
  },

  // ─── NVIDIA NIM: 40 RPM hard cap, credit-based; configured at 20 RPM ───
  // Production use is a deliberate exception to the free-tier-only policy:
  // NVIDIA documents the hosted build.nvidia.com endpoints for prototyping
  // and development, while production use requires NVIDIA AI Enterprise.
  // The callable Nemotron 3.x generation is reached through OpenRouter, not
  // through this provider, so only NVIDIA's gpt-oss-20b host belongs here.
  {
    modelId: "nvidia:openai/gpt-oss-20b",
    quality: 7,
    contextWindow: 131_072,
    maxOutputTokens: 4_096,
    toolCapable: false,
    structuredOutput: false,
    limits: { rpm: 20, rpd: 0, tpm: 20_000, tpd: 0 },
    sharedWithProvider: [],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 0, output: 0 },
  },

  // ─── OpenRouter: 20 RPM · 50 RPD while <10 credits purchased ───
  // Only `:free` identifiers belong here. The account shares one RPM and one
  // RPD bucket across every free model, and OpenRouter publishes no TPM/TPD
  // for them. These entries are reserved for last-resort overflow: 50 RPD is
  // too small to carry normal traffic. `:free` routes may be logged or used
  // to improve upstream models; see the legal disclosures.
  {
    modelId: "openrouter:nvidia/nemotron-3-ultra-550b-a55b:free",
    quality: 9,
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    toolCapable: true,
    structuredOutput: false,
    limits: { rpm: 20, rpd: 50, tpm: 0, tpd: 0 },
    sharedWithProvider: ["rpm", "rpd"],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 0, output: 0 },
    reserve: true,
  },
  {
    modelId: "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
    quality: 8,
    contextWindow: 262_144,
    maxOutputTokens: 235_929,
    toolCapable: true,
    structuredOutput: true,
    limits: { rpm: 20, rpd: 50, tpm: 0, tpd: 0 },
    sharedWithProvider: ["rpm", "rpd"],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 0, output: 0 },
    reserve: true,
  },
  {
    modelId: "openrouter:nvidia/nemotron-3.5-lightning:free",
    quality: 7,
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    toolCapable: true,
    structuredOutput: false,
    limits: { rpm: 20, rpd: 50, tpm: 0, tpd: 0 },
    sharedWithProvider: ["rpm", "rpd"],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 0, output: 0 },
    reserve: true,
  },
  {
    modelId: "openrouter:google/gemma-4-31b-it:free",
    quality: 7,
    contextWindow: 262_144,
    maxOutputTokens: 32_768,
    toolCapable: true,
    structuredOutput: false,
    limits: { rpm: 20, rpd: 50, tpm: 0, tpd: 0 },
    sharedWithProvider: ["rpm", "rpd"],
    dayResets: "utc-midnight",
    costCentsPerMillion: { input: 0, output: 0 },
    reserve: true,
  },
];

/** Catalog with environment overrides applied. */
export function getModelCatalog(): ModelEntry[] {
  return BASE_CATALOG.map((entry) => {
    const provider = providerOf(entry.modelId);
    return {
      ...entry,
      limits: {
        rpm: getProviderOverride(provider, "rpm", entry.limits.rpm),
        rpd: getProviderOverride(provider, "rpd", entry.limits.rpd),
        tpm: getProviderOverride(provider, "tpm", entry.limits.tpm),
        tpd: getProviderOverride(provider, "tpd", entry.limits.tpd),
        ...(entry.limits.neuronsPerMillion
          ? { neuronsPerMillion: entry.limits.neuronsPerMillion }
          : {}),
      },
    };
  });
}

/** Raw base catalog (no env overrides). Useful for invariant tests. */
export function getBaseCatalog(): ModelEntry[] {
  return [...BASE_CATALOG];
}

export function getCatalogEntry(
  modelId: string,
): ModelEntry | undefined {
  return getModelCatalog().find((e) => e.modelId === modelId);
}

/** Cost table derived from the catalog (single source of truth). */
export function getDerivedCostTable(): Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
> {
  const table: Record<
    string,
    { inputPerMillion: number; outputPerMillion: number }
  > = {};
  for (const entry of getModelCatalog()) {
    table[entry.modelId] = {
      inputPerMillion: entry.costCentsPerMillion.input,
      outputPerMillion: entry.costCentsPerMillion.output,
    };
  }
  return table;
}

/** Model identifiers used by the importer (multimodal extraction). */
export const EXTRACTION_MODEL_IDS = [
  "google:gemini-3.8-flash",
  "google:gemini-3.6-flash",
  "google:gemini-3.1-flash-lite",
  "google:gemini-3.5-flash-lite",
] as const;

/** Registry prefixes the runtime knows. */
export const KNOWN_CATALOG_PROVIDERS = [
  "groq",
  "google",
  "cloudflare",
  "nvidia",
  "openrouter",
] as const;
