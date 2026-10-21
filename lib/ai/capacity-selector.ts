import "server-only";

import { cacheLayer } from "@/lib/ai/cache-layer";
import {
  isGroqConfigured,
  isGeminiConfigured,
  isOpenRouterConfigured,
  isCloudflareAiConfigured,
  isNvidiaNimConfigured,
} from "@/lib/env";
import {
  CLOUDFLARE_DAILY_NEURON_POOL,
  getModelCatalog,
  getNeuronPoolOverride,
  type ModelEntry,
} from "@/lib/ai/catalog";
import {
  ROUTING_PROFILES,
  type AiRoutingProfile,
} from "@/lib/ai/routing-profiles";
import { classifyExhaustionScope } from "@/lib/ai/errors";

// ---------------------------------------------------------------------------
// Capacity-Aware Model Selector
//
// Tracks request counts per model via the distributed Cache Layer and selects
// the best available model that still has headroom.
//
// Metering matches how providers actually bill:
// - Per-minute AND per-day request counters (RPM/RPD)
// - Per-minute AND per-day token counters (TPM/TPD), each expiring when that
//   provider's day actually resets (UTC midnight vs Pacific midnight)
// - Provider-scoped counters for dimensions a provider meters
//   per-organisation rather than per-model (Groq shares its bucket)
// - Cloudflare's neuron pool counted as a shared daily counter
// - Token counters corrected against real usage after each turn
// ---------------------------------------------------------------------------

export type ModelCapacity = {
  /** Registry model ID (e.g., "groq:openai/gpt-oss-120b") */
  modelId: `${string}:${string}`;
  /** Requests per minute limit */
  rpm: number;
  /** Requests per day limit (0 = unlimited) */
  rpd: number;
  tpm: number;
  /** Quality score 1-10 (10 = best). */
  quality: number;
  /** Whether this model supports tool calling reliably */
  toolCapable: boolean;
  reserve?: boolean;
};

// ---------------------------------------------------------------------------
// Cache keys & TTLs
// ---------------------------------------------------------------------------

const RPM_TTL_SECONDS = 60;
const TPM_TTL_SECONDS = 60;
const CAPACITY_THRESHOLD = 0.80; // Pick models under 80% of their limit
/**
 * The hard ceiling. A candidate at or above 100% of any modelled free quota
 * is never returned: the 80% threshold only deprioritizes a model, it does
 * not license exceeding the quota. A next-request load of exactly 1.0 is
 * still inside the quota, so the cutoff is `> 1`.
 */
const QUOTA_CEILING = 1;
const EXHAUSTED_SENTINEL = 99999;
/** Dead identifiers are remembered for hours, not seconds. */
const DEAD_MODEL_TTL_SECONDS = 6 * 60 * 60;

function getRpmKey(modelId: string): string {
  return `cap:rpm:${modelId}`;
}

function getRpdKey(modelId: string): string {
  return `cap:rpd:${modelId}`;
}

function getTpmKey(modelId: string): string {
  return `cap:tpm:${modelId}`;
}

function getTpdKey(modelId: string): string {
  return `cap:tpd:${modelId}`;
}

function getProviderKey(
  dimension: "rpm" | "rpd" | "tpm" | "tpd",
  provider: string,
): string {
  return `cap:provider:${dimension}:${provider}`;
}

function getNeuronKey(provider = "cloudflare"): string {
  return `cap:neurons:${provider}`;
}

function getDeadKey(modelId: string): string {
  return `cap:dead:${modelId}`;
}

function secondsUntilUtcMidnight(now = new Date()): number {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
    ),
  );
  return Math.max(60, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

function secondsUntilPacificMidnight(now = new Date()): number {
  // Next midnight in America/Los_Angeles. Compute by formatting the current
  // Pacific wall-clock time, then converting back. DST-safe: we step forward
  // in Pacific-local days rather than assuming a fixed UTC offset.
  try {
    const pacificFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(
      pacificFmt.formatToParts(now).map((p) => [p.type, p.value]),
    );
    // Pacific-local tomorrow 00:00 ≈ find by adding a day and re-resolving.
    // Approximation: Pacific midnight is 07:00/08:00 UTC; probe both.
    for (const offsetHours of [7, 8]) {
      const candidate = new Date(
        Date.UTC(
          Number(parts.year),
          Number(parts.month) - 1,
          Number(parts.day) + 1,
          offsetHours,
          0,
          0,
        ),
      );
      // Verify the candidate is actually midnight Pacific.
      const check = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(candidate);
      if (check === "00:00" || check === "24:00") {
        const secs = Math.ceil((candidate.getTime() - now.getTime()) / 1000);
        if (secs > 60) return secs;
      }
    }
  } catch {
    // Intl unavailable — fall through to rolling.
  }
  return 86_400;
}

function dayTtlSeconds(
  dayResets: ModelEntry["dayResets"],
): number {
  switch (dayResets) {
    case "utc-midnight":
      return secondsUntilUtcMidnight();
    case "pacific-midnight":
      return secondsUntilPacificMidnight();
    default:
      return 86_400;
  }
}

function providerOf(modelId: string): string {
  return modelId.split(":")[0] ?? "";
}

function catalogEntryFor(modelId: string): ModelEntry | undefined {
  return getModelCatalog().find((e) => e.modelId === modelId);
}

// ---------------------------------------------------------------------------
// Usage tracking
// ---------------------------------------------------------------------------

async function getMinuteCount(modelId: string): Promise<number> {
  const value = await cacheLayer.get<number>(getRpmKey(modelId));
  return value ?? 0;
}

async function getDayCount(modelId: string): Promise<number> {
  const value = await cacheLayer.get<number>(getRpdKey(modelId));
  return value ?? 0;
}

/**
 * Record that a request was made to a model.
 * Increments model-scoped AND provider-scoped counters for shared dimensions.
 */
export async function recordModelUsage(modelId: string): Promise<void> {
  const entry = catalogEntryFor(modelId);
  const provider = providerOf(modelId);
  const dayTtl = entry ? dayTtlSeconds(entry.dayResets) : 86_400;
  const writes: Array<Promise<number | void>> = [
    cacheLayer.increment(getRpmKey(modelId), RPM_TTL_SECONDS),
    cacheLayer.increment(getRpdKey(modelId), dayTtl),
  ];
  if (entry && provider) {
    writes.push(
      cacheLayer.increment(
        getProviderKey("rpm", provider),
        RPM_TTL_SECONDS,
      ),
      cacheLayer.increment(getProviderKey("rpd", provider), dayTtl),
    );
  }
  await Promise.all(writes);
}

export async function recordModelTokenUsage(
  modelId: string,
  tokens: number,
): Promise<void> {
  await recordModelTokenUsageDetailed(modelId, {
    inputTokens: tokens,
    outputTokens: 0,
  });
}

/**
 * Record token spend, charging model-scoped TPM/TPD plus provider-shared
 * dimensions and the Cloudflare neuron pool.
 */
export async function recordModelTokenUsageDetailed(
  modelId: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  const entry = catalogEntryFor(modelId);
  const total = Math.ceil(
    Math.max(0, usage.inputTokens) + Math.max(0, usage.outputTokens),
  );
  if (total <= 0 && !entry?.limits.neuronsPerMillion) return;
  const provider = providerOf(modelId);
  const dayTtl = entry ? dayTtlSeconds(entry.dayResets) : 86_400;
  const writes: Array<Promise<number | void>> = [];
  if (total > 0) {
    writes.push(
      cacheLayer.incrementBy(getTpmKey(modelId), total, TPM_TTL_SECONDS),
      cacheLayer.incrementBy(getTpdKey(modelId), total, dayTtl),
    );
    if (entry && provider) {
      if (entry.sharedWithProvider.includes("tpm")) {
        writes.push(
          cacheLayer.incrementBy(
            getProviderKey("tpm", provider),
            total,
            TPM_TTL_SECONDS,
          ),
        );
      }
      // Daily tokens are provider-scoped whenever the provider shares any
      // token dimension (Groq's 200K TPD covers all its models).
      if (
        entry.sharedWithProvider.includes("tpd") ||
        entry.sharedWithProvider.includes("tpm")
      ) {
        writes.push(
          cacheLayer.incrementBy(
            getProviderKey("tpd", provider),
            total,
            dayTtl,
          ),
        );
      }
    }
  }
  if (entry?.limits.neuronsPerMillion) {
    const rates = entry.limits.neuronsPerMillion;
    const neurons =
      (Math.max(0, usage.inputTokens) * rates.input +
        Math.max(0, usage.outputTokens) * rates.output) /
      1_000_000;
    // Preflight estimates arrive as input-only totals; charge those at the
    // higher of the two rates so the pool is never under-counted.
    const charge =
      total > 0 && usage.outputTokens === 0 && usage.inputTokens > 0
        ? (usage.inputTokens * Math.max(rates.input, rates.output)) / 1_000_000
        : neurons;
    if (charge > 0) {
      writes.push(
        cacheLayer.incrementBy(
          getNeuronKey(provider || "cloudflare"),
          Math.ceil(charge * 1000),
          dayTtl,
        ),
      );
    }
  }
  if (writes.length > 0) await Promise.all(writes);
}

/**
 * Correct a minute's counters against the real usage a turn reported, so
 * accounting converges on truth instead of accumulating an estimate's error.
 * Posts the difference (actual − estimated), not the full amount.
 *
 * Every dimension the selector enforces has to converge: the per-minute and
 * per-day token counters, the provider-shared token counters and the
 * Cloudflare neuron pool. Correcting only the per-minute counter left the
 * daily budget pinned to an estimate that never moved.
 */
export async function correctTokenUsage(
  modelId: string,
  estimatedTokens: number,
  actualTokens: { inputTokens: number; outputTokens: number },
): Promise<void> {
  const actual =
    Math.max(0, actualTokens.inputTokens) +
    Math.max(0, actualTokens.outputTokens);
  const estimated = Math.max(0, estimatedTokens);
  const delta = Math.ceil(actual - estimated);
  const entry = catalogEntryFor(modelId);
  const provider = providerOf(modelId);
  const dayTtl = entry ? dayTtlSeconds(entry.dayResets) : 86_400;
  const writes: Array<Promise<number | void>> = [];

  if (delta !== 0) {
    // incrementBy with a negative delta corrects an over-estimate downward.
    writes.push(
      cacheLayer.incrementBy(getTpmKey(modelId), delta, TPM_TTL_SECONDS),
      cacheLayer.incrementBy(getTpdKey(modelId), delta, dayTtl),
    );
    if (entry && provider) {
      if (entry.sharedWithProvider.includes("tpm")) {
        writes.push(
          cacheLayer.incrementBy(
            getProviderKey("tpm", provider),
            delta,
            TPM_TTL_SECONDS,
          ),
        );
      }
      // Daily tokens are provider-scoped whenever the provider shares any
      // token dimension (Groq's 200K TPD covers all its models).
      if (
        entry.sharedWithProvider.includes("tpd") ||
        entry.sharedWithProvider.includes("tpm")
      ) {
        writes.push(
          cacheLayer.incrementBy(getProviderKey("tpd", provider), delta, dayTtl),
        );
      }
    }
  }

  // The neuron pool is charged by a rate-weighted amount, and the estimate
  // was charged at the higher of the two rates. The correction is the
  // difference between the real weighted charge and that estimate.
  if (entry?.limits.neuronsPerMillion) {
    const rates = entry.limits.neuronsPerMillion;
    const actualCharge =
      (Math.max(0, actualTokens.inputTokens) * rates.input +
        Math.max(0, actualTokens.outputTokens) * rates.output) /
      1_000_000;
    const estimateCharge =
      (estimated * Math.max(rates.input, rates.output)) / 1_000_000;
    const neuronDelta =
      Math.ceil(actualCharge * 1000) - Math.ceil(estimateCharge * 1000);

    if (neuronDelta !== 0) {
      writes.push(
        cacheLayer.incrementBy(
          getNeuronKey(provider || "cloudflare"),
          neuronDelta,
          dayTtl,
        ),
      );
    }
  }

  if (writes.length > 0) await Promise.all(writes);
}

/**
 * Mark a model as temporarily exhausted.
 *
 * The cooldown is scoped to the limit that tripped: a refusal naming a daily
 * quota cools down until the day boundary; a per-minute limit cools down for
 * a minute only. Pass the raw error when available so the scope is parsed —
 * otherwise a minute cooldown is applied.
 */
export async function markModelExhausted(
  modelId: string,
  error?: unknown,
): Promise<void> {
  const entry = catalogEntryFor(modelId);
  const provider = providerOf(modelId);
  const scope = error !== undefined ? classifyExhaustionScope(error) : "minute";

  if (scope === "day") {
    const dayTtl = entry ? dayTtlSeconds(entry.dayResets) : 86_400;
    await cacheLayer.set<number>(getRpdKey(modelId), EXHAUSTED_SENTINEL, dayTtl);
    if (provider) {
      await cacheLayer.set<number>(
        getProviderKey("rpd", provider),
        EXHAUSTED_SENTINEL,
        dayTtl,
      );
      // A day-level refusal applies to the provider's shared request bucket
      // for the rest of the day. This also covers providers whose daily cap
      // is not modelled, where poisoning the unused RPD key alone would leave
      // every model selectable.
      if (entry?.sharedWithProvider.includes("rpm")) {
        await cacheLayer.set<number>(
          getProviderKey("rpm", provider),
          EXHAUSTED_SENTINEL,
          dayTtl,
        );
      }
      // Cloudflare's daily quota is the shared neuron pool, not RPD. Poisoning
      // the pool makes every Cloudflare candidate look exhausted until the
      // UTC boundary instead of leaving the pool at its recorded load.
      if (entry?.limits.neuronsPerMillion) {
        await cacheLayer.set<number>(
          getNeuronKey(provider),
          EXHAUSTED_SENTINEL * 1000,
          dayTtl,
        );
      }
    }
    return;
  }

  const sharedTpmProviders = new Set(
    getModelCatalog()
      .filter((e) => e.sharedWithProvider.includes("tpm"))
      .map((e) => providerOf(e.modelId)),
  );
  const sharedRpmProviders = new Set(
    getModelCatalog()
      .filter((e) => e.sharedWithProvider.includes("rpm"))
      .map((e) => providerOf(e.modelId)),
  );
  const providerSharesMinute =
    Boolean(provider) &&
    (sharedTpmProviders.has(provider) || sharedRpmProviders.has(provider));

  const modelsToExhaust = providerSharesMinute
    ? getModelCatalog()
        .filter((m) => m.modelId.startsWith(provider + ":"))
        .map((m) => m.modelId)
    : [modelId];

  await Promise.all(
    modelsToExhaust.map((id) =>
      cacheLayer.set<number>(getRpmKey(id), EXHAUSTED_SENTINEL, RPM_TTL_SECONDS),
    ),
  );
  if (provider && providerSharesMinute) {
    await cacheLayer.set<number>(
      getProviderKey("rpm", provider),
      EXHAUSTED_SENTINEL,
      RPM_TTL_SECONDS,
    );
  }
  if (provider && sharedTpmProviders.has(provider)) {
    await cacheLayer.set<number>(
      getProviderKey("tpm", provider),
      EXHAUSTED_SENTINEL,
      RPM_TTL_SECONDS,
    );
  }
}

/** Remember a dead identifier for hours so every request rediscovers nothing. */
export async function markModelDead(modelId: string): Promise<void> {
  await cacheLayer.set<number>(getDeadKey(modelId), 1, DEAD_MODEL_TTL_SECONDS);
}

export async function isModelDead(modelId: string): Promise<boolean> {
  const value = await cacheLayer.get<number>(getDeadKey(modelId));
  return value !== null && value > 0;
}

// ---------------------------------------------------------------------------
// Selection logic
// ---------------------------------------------------------------------------

type ScoredModel = ModelEntry & { loadRatio: number };

/** 0 for normal models, 1 for reserve — reserve always ranks last. */
function reserveRank(cap: ModelEntry): number {
  return cap.reserve ? 1 : 0;
}

export type SelectionCriteria = {
  /** Routing profile (preferred). Falls back to loose criteria when omitted. */
  profile?: AiRoutingProfile;
  /** Whether tool calling is required (legacy; profile supplies this). */
  needsTools?: boolean;
  /** Minimum quality score 1-10 (legacy; profile supplies this). */
  minQuality?: number;
  /** Prefer these providers first (legacy). */
  preferProviders?: string[];
  /** Estimated input + output tokens for this request. */
  estimatedTokens?: number;
};

/**
 * Calculates how "loaded" a model is as a 0-1 ratio.
 * Takes the worst of per-minute, per-day, token, daily-token, neuron, and
 * provider-shared load. `estimatedTokens` is folded into the token dimensions
 * so a model that cannot fit the turn is treated as stressed.
 */
async function getLoadRatio(
  cap: ModelEntry,
  estimatedTokens = 0,
): Promise<number> {
  const provider = providerOf(cap.modelId);
  const [minuteCount, dayCount, tokenCount, tpdCount] = await Promise.all([
    getMinuteCount(cap.modelId),
    getDayCount(cap.modelId),
    cacheLayer.get<number>(getTpmKey(cap.modelId)),
    cacheLayer.get<number>(getTpdKey(cap.modelId)),
  ]);

  const minuteLoad = cap.limits.rpm > 0 ? (minuteCount + 1) / cap.limits.rpm : 0;
  const dayLoad =
    cap.limits.rpd > 0 ? (dayCount + 1) / cap.limits.rpd : 0;
  const tokenLoad =
    cap.limits.tpm > 0
      ? ((tokenCount ?? 0) + estimatedTokens) / cap.limits.tpm
      : 0;
  const dailyTokenLoad =
    cap.limits.tpd > 0
      ? ((tpdCount ?? 0) + estimatedTokens) / cap.limits.tpd
      : 0;

  let sharedLoad = 0;
  if (provider) {
    const [pRpm, pRpd, pTpm, pTpd] = await Promise.all([
      cap.sharedWithProvider.includes("rpm")
        ? cacheLayer.get<number>(getProviderKey("rpm", provider))
        : Promise.resolve(null),
      cap.sharedWithProvider.includes("rpd")
        ? cacheLayer.get<number>(getProviderKey("rpd", provider))
        : Promise.resolve(null),
      cap.sharedWithProvider.includes("tpm")
        ? cacheLayer.get<number>(getProviderKey("tpm", provider))
        : Promise.resolve(null),
      cap.sharedWithProvider.includes("tpd") ||
      cap.sharedWithProvider.includes("tpm")
        ? cacheLayer.get<number>(getProviderKey("tpd", provider))
        : Promise.resolve(null),
    ]);
    const loads: number[] = [];
    if (cap.limits.rpm > 0 && pRpm !== null)
      loads.push((pRpm + 1) / cap.limits.rpm);
    if (cap.limits.rpd > 0 && pRpd !== null)
      loads.push((pRpd + 1) / cap.limits.rpd);
    if (cap.limits.tpm > 0 && pTpm !== null)
      loads.push((pTpm + estimatedTokens) / cap.limits.tpm);
    if (cap.limits.tpd > 0 && pTpd !== null)
      loads.push((pTpd + estimatedTokens) / cap.limits.tpd);
    if (loads.length > 0) sharedLoad = Math.max(...loads);
  }

  let neuronLoad = 0;
  if (cap.limits.neuronsPerMillion) {
    const pool = getNeuronPoolOverride(CLOUDFLARE_DAILY_NEURON_POOL);
    const neuronMilli =
      (await cacheLayer.get<number>(getNeuronKey(provider))) ?? 0;
    const rates = cap.limits.neuronsPerMillion;
    const estimatedNeuronMilli =
      (estimatedTokens * Math.max(rates.input, rates.output)) / 1000;
    neuronLoad =
      pool > 0 ? (neuronMilli + estimatedNeuronMilli) / (pool * 1000) : 0;
  }

  return Math.max(
    minuteLoad,
    dayLoad,
    tokenLoad,
    dailyTokenLoad,
    sharedLoad,
    neuronLoad,
  );
}

/**
 * Selects the best available models as an ordered list (best first).
 *
 * Profile-driven: the profile's explicit order is the ranking within each
 * capacity tier (available under 80%, then stressed as fallback), with
 * reserve-tier models held last in both tiers. A provider that cannot serve
 * a kind of work is excluded from that chain entirely.
 */
export async function selectModels(
  criteria: SelectionCriteria,
): Promise<`${string}:${string}`[]> {
  const { profile, estimatedTokens = 0 } = criteria;

  const configuredProvider = (prov: string): boolean => {
    switch (prov) {
      case "groq":
        return isGroqConfigured;
      case "google":
        return isGeminiConfigured;
      case "openrouter":
        return isOpenRouterConfigured;
      case "cloudflare":
        return isCloudflareAiConfigured;
      case "nvidia":
        return isNvidiaNimConfigured;
      default:
        return false;
    }
  };

  const catalog = getModelCatalog();
  const byId = new Map(catalog.map((e) => [e.modelId, e]));

  let ordered: ModelEntry[];
  if (profile && ROUTING_PROFILES[profile]) {
    const def = ROUTING_PROFILES[profile];
    ordered = def.order
      .map((id) => byId.get(id))
      .filter((e): e is ModelEntry => Boolean(e))
      .filter((e) => {
        if (def.needsTools && !e.toolCapable) return false;
        if (e.quality < def.minQuality) return false;
        const prov = providerOf(e.modelId);
        if (def.excludedProviders.includes(prov)) return false;
        if (!configuredProvider(prov)) return false;
        return true;
      });
  } else {
    // Legacy path (router pinned-model fallback, tests): filter then apply
    // preferProviders ordering.
    const { needsTools, minQuality = 1, preferProviders } = criteria;
    let eligible = catalog.filter((cap) => {
      if (needsTools && !cap.toolCapable) return false;
      if (cap.quality < minQuality) return false;
      if (!configuredProvider(providerOf(cap.modelId))) return false;
      return true;
    });
    if (preferProviders?.length) {
      eligible = [
        ...eligible.filter((cap) =>
          preferProviders.some((p) => cap.modelId.startsWith(p + ":")),
        ),
        ...eligible.filter(
          (cap) =>
            !preferProviders.some((p) => cap.modelId.startsWith(p + ":")),
        ),
      ];
    }
    ordered = eligible;
  }

  // Dead identifiers are skipped here as well as in the fallback wrapper, so
  // a stale catalog entry costs nothing at selection time either. The checks
  // run concurrently: this is the hot path of every AI turn, and a serial
  // cache round-trip per candidate made the per-turn latency a function of
  // the chain length.
  const deadFlags = await Promise.all(
    ordered.map((entry) => isModelDead(entry.modelId)),
  );
  const alive: ModelEntry[] = [];
  ordered.forEach((entry, index) => {
    if (!deadFlags[index]) alive.push(entry);
  });
  ordered = alive;

  const loadRatios = await Promise.all(
    ordered.map((cap) => getLoadRatio(cap, estimatedTokens)),
  );
  const scored: ScoredModel[] = ordered.map((cap, i) => ({
    ...cap,
    loadRatio: loadRatios[i] ?? 0,
  }));

  const available = scored.filter((m) => m.loadRatio < CAPACITY_THRESHOLD);
  const stressed = scored.filter(
    (m) => m.loadRatio >= CAPACITY_THRESHOLD && m.loadRatio <= QUOTA_CEILING,
  );

  // Profile order is the ranking: stable-sort by (reserve, stressed-position)
  // while preserving the profile's explicit sequence. Higher quality does NOT
  // reorder — the profile already encodes where quality matters, and reserve
  // entries stay last no matter how good they are.
  const rankInProfile = new Map(ordered.map((e, i) => [e.modelId, i]));
  const byProfileOrder = (a: ScoredModel, b: ScoredModel) => {
    const tier = reserveRank(a) - reserveRank(b);
    if (tier !== 0) return tier;
    return (
      (rankInProfile.get(a.modelId) ?? 0) - (rankInProfile.get(b.modelId) ?? 0)
    );
  };
  available.sort(byProfileOrder);
  // Stressed: least-loaded first as last resort, reserve still held back.
  stressed.sort((a, b) => {
    const tier = reserveRank(a) - reserveRank(b);
    if (tier !== 0) return tier;
    return a.loadRatio - b.loadRatio;
  });

  return [...available, ...stressed].map((m) => m.modelId);
}

export type ModelQuotaState =
  | "available"
  | "stressed"
  | "exhausted"
  | "dead"
  | "unknown";

/**
 * Check one model against its modelled free quota.
 *
 * The pinned-model router path uses this before calling a provider: a model
 * that is absent from the catalog, remembered dead, or already at its quota
 * fails without spending a request. "Stressed" is still selectable; it only
 * ranks behind healthy candidates in normal selection.
 */
export async function getModelQuotaState(
  modelId: string,
  estimatedTokens = 0,
): Promise<ModelQuotaState> {
  const entry = catalogEntryFor(modelId);
  if (!entry) return "unknown";
  if (await isModelDead(modelId)) return "dead";
  const ratio = await getLoadRatio(entry, estimatedTokens);
  if (ratio > QUOTA_CEILING) return "exhausted";
  return ratio >= CAPACITY_THRESHOLD ? "stressed" : "available";
}

// ---------------------------------------------------------------------------
// Dev/debug utilities
// ---------------------------------------------------------------------------

/**
 * Returns current capacity status for all models. Used in dev debug info.
 * Exposes daily, neuron and provider-shared dimensions alongside the
 * existing ones.
 */
export async function getCapacitySnapshot(): Promise<
  Array<{
    modelId: string;
    quality: number;
    rpm: number;
    rpd: number;
    tpm: number;
    tpd: number;
    minuteUsage: number;
    dayUsage: number;
    tokenUsage: number;
    dailyTokenUsage: number;
    providerShared: Record<string, number | null>;
    neuronUsageMilli: number | null;
    neuronPool: number | null;
    loadRatio: number;
    available: boolean;
    quotaExhausted: boolean;
  }>
> {
  const catalog = getModelCatalog();
  const results = await Promise.all(
    catalog.map(async (cap) => {
      const provider = providerOf(cap.modelId);
      const loadRatio = await getLoadRatio(cap);
      const minuteCount = await getMinuteCount(cap.modelId);
      const dayCount = await getDayCount(cap.modelId);
      const [providerRpm, providerRpd, providerTpm, providerTpd, neuronMilli] =
        await Promise.all([
          cacheLayer.get<number>(getProviderKey("rpm", provider)),
          cacheLayer.get<number>(getProviderKey("rpd", provider)),
          cacheLayer.get<number>(getProviderKey("tpm", provider)),
          cacheLayer.get<number>(getProviderKey("tpd", provider)),
          cap.limits.neuronsPerMillion
            ? cacheLayer.get<number>(getNeuronKey(provider))
            : Promise.resolve(null),
        ]);
      return {
        modelId: cap.modelId,
        quality: cap.quality,
        rpm: cap.limits.rpm,
        rpd: cap.limits.rpd,
        tpm: cap.limits.tpm,
        tpd: cap.limits.tpd,
        minuteUsage: minuteCount,
        dayUsage: dayCount,
        tokenUsage:
          (await cacheLayer.get<number>(getTpmKey(cap.modelId))) ?? 0,
        dailyTokenUsage:
          (await cacheLayer.get<number>(getTpdKey(cap.modelId))) ?? 0,
        providerShared: {
          rpm: providerRpm,
          rpd: providerRpd,
          tpm: providerTpm,
          tpd: providerTpd,
        },
        neuronUsageMilli: neuronMilli,
        neuronPool: cap.limits.neuronsPerMillion
          ? getNeuronPoolOverride(CLOUDFLARE_DAILY_NEURON_POOL)
          : null,
        loadRatio,
        available: loadRatio < CAPACITY_THRESHOLD,
        quotaExhausted: loadRatio > QUOTA_CEILING,
      };
    }),
  );
  return results;
}

/** Get all registered model IDs for the dev model selector. */
export function getAllRegisteredModelIds(): `${string}:${string}`[] {
  return getModelCatalog().map((cap) => cap.modelId);
}

/**
 * Resets all usage counters. Used for testing.
 * Note: Only clears the in-memory fallback layer. Redis entries expire via TTL.
 * @internal
 */
export async function _resetUsageCounters(): Promise<void> {
  await Promise.all(
    getModelCatalog().flatMap((cap) => {
      const provider = providerOf(cap.modelId);
      return [
        cacheLayer.delete(getRpmKey(cap.modelId)),
        cacheLayer.delete(getRpdKey(cap.modelId)),
        cacheLayer.delete(getTpmKey(cap.modelId)),
        cacheLayer.delete(getTpdKey(cap.modelId)),
        cacheLayer.delete(getDeadKey(cap.modelId)),
        cacheLayer.delete(getProviderKey("rpm", provider)),
        cacheLayer.delete(getProviderKey("rpd", provider)),
        cacheLayer.delete(getProviderKey("tpm", provider)),
        cacheLayer.delete(getProviderKey("tpd", provider)),
      ];
    }),
  );
  await cacheLayer.delete(getNeuronKey("cloudflare"));
}

/** Attempt budget for chat turns — explicit, visible at the call site. */
export const CHAT_MAX_ATTEMPTS = 5;
/** Attempt budget for non-chat (single-shot) generation. */
export const NON_CHAT_MAX_ATTEMPTS = 4;
