import "server-only";

import { cacheLayer } from "@/lib/ai/cache-layer";
import {
  adjustDurableCounter,
  reserveDurableCapacity,
} from "@/lib/ai/capacity-store";
import {
  isGroqConfigured,
  isGeminiConfigured,
  isOpenRouterConfigured,
  isCloudflareAiConfigured,
  isNvidiaNimConfigured,
} from "@/lib/env";
import {
  CLOUDFLARE_DAILY_NEURON_POOL,
  QUOTA_DIMENSIONS,
  getModelCatalog,
  getNeuronPoolOverride,
  quotaLimit,
  type ModelEntry,
  type QuotaDimension,
} from "@/lib/ai/catalog";
import {
  ROUTING_PROFILES,
  type AiRoutingProfile,
} from "@/lib/ai/routing-profiles";
import {
  classifyProviderFailure,
  type AiFailureKind,
} from "@/lib/ai/errors";
import { EMBEDDING_MODEL_ID } from "@/lib/ai/embedding-constants";
import type { CacheReservationCounter } from "@/lib/ai/cache-layer";

// ---------------------------------------------------------------------------
// Capacity-Aware Model Selector
//
// Tracks request counts per model in Postgres (authoritative) with a
// distributed Cache Layer mirror (best-effort) and selects the best available
// model that still has headroom.
//
// Metering matches how providers actually bill:
// - Per-minute AND per-day request counters (RPM/RPD)
// - Per-minute AND per-day token counters (TPM/TPD), each expiring when that
//   provider's day actually resets (UTC midnight vs Pacific midnight)
// - Provider-scoped counters for dimensions a provider meters
//   per-organisation rather than per-model (Groq shares its bucket)
// - Cloudflare's neuron pool counted as a shared daily counter
// - Every dispatch reserves first, then settles against reported usage
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
 * not license reaching or exceeding the quota.
 */
const QUOTA_CEILING = 1;
const EXHAUSTED_SENTINEL = 99999;
/** Dead identifiers are remembered for hours, not seconds. */
const DEAD_MODEL_TTL_SECONDS = 6 * 60 * 60;
/** A rejected credential affects every model on the account. */
const PROVIDER_AUTH_COOLDOWN_SECONDS = 10 * 60;
/** Success/failure telemetry used only to rank candidates, never to hard-block. */
const HEALTH_TTL_SECONDS = 60 * 60;

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

function getProviderCoolKey(provider: string): string {
  return `cap:provider:cool:${provider}`;
}

function getHealthKey(modelId: string): string {
  return `cap:health:${modelId}`;
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
        // The candidate is always the next Pacific midnight, even when it is
        // less than a minute away. Clamping that window to a full day would
        // silently lock a provider out for ~24 hours.
        return Math.max(
          1,
          Math.ceil((candidate.getTime() - now.getTime()) / 1000),
        );
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

type AccountingEntry = Pick<
  ModelEntry,
  "dayResets" | "sharedWithProvider" | "limits"
>;

/**
 * Off-catalog identifiers that still consume provider quota. The catalog is
 * the routing allowlist, so embeddings are intentionally not candidates; the
 * drift check lists them separately. They still need the provider's real day
 * boundary when usage is recorded, or an exhausted embedding quota would
 * linger for a rolling day instead of resetting with Gemini's day.
 */
const OFF_CATALOG_ACCOUNTING: Record<string, AccountingEntry> = {
  [EMBEDDING_MODEL_ID]: {
    dayResets: "pacific-midnight",
    sharedWithProvider: [],
    limits: { rpm: 100, rpd: 1_000, tpm: 0, tpd: 0 },
  },
};

function accountingEntryFor(modelId: string): AccountingEntry | undefined {
  return catalogEntryFor(modelId) ?? OFF_CATALOG_ACCOUNTING[modelId];
}

// ---------------------------------------------------------------------------
// Usage tracking
// ---------------------------------------------------------------------------

/**
 * Record that a request was made to a model.
 * Increments model-scoped AND provider-scoped counters for shared dimensions.
 *
 * Durable DB counters are authoritative (direct provider paths share the
 * same hard allowance as routed calls); the cache counters are a best-effort
 * selection mirror.
 */
export async function recordModelUsage(modelId: string): Promise<void> {
  const entry = accountingEntryFor(modelId);
  const provider = providerOf(modelId);
  const dayTtl = entry ? dayTtlSeconds(entry.dayResets) : 86_400;
  const durableWrites: Array<Promise<number | void>> = [
    adjustDurableCounter(getRpmKey(modelId), 1, RPM_TTL_SECONDS, 1),
    adjustDurableCounter(getRpdKey(modelId), 1, dayTtl, 1),
  ];
  mirrorCapacity(cacheLayer.increment(getRpmKey(modelId), RPM_TTL_SECONDS));
  mirrorCapacity(cacheLayer.increment(getRpdKey(modelId), dayTtl));
  if (entry && provider) {
    durableWrites.push(
      adjustDurableCounter(
        getProviderKey("rpm", provider),
        1,
        RPM_TTL_SECONDS,
        1,
      ),
      adjustDurableCounter(getProviderKey("rpd", provider), 1, dayTtl, 1),
    );
    mirrorCapacity(
      cacheLayer.increment(getProviderKey("rpm", provider), RPM_TTL_SECONDS),
    );
    mirrorCapacity(
      cacheLayer.increment(getProviderKey("rpd", provider), dayTtl),
    );
  }
  await recordDurableWrites(durableWrites);
}

/**
 * Fire a best-effort cache mirror without blocking or failing the caller.
 * Telemetry is allowed to lag or disappear; the durable store is the
 * authority for hard limits.
 */
function mirrorCapacity(operation: Promise<unknown>): void {
  void operation.catch((error) => {
    console.warn(
      "[ai-capacity] Cache mirror write failed:",
      error instanceof Error ? error.message : error,
    );
  });
}

/**
 * Await durable capacity writes without letting one failure break the caller.
 * A failed durable write under-counts usage, so it is logged; it must not fail
 * an embedding or extraction that already ran.
 */
async function recordDurableWrites(
  writes: Array<Promise<number | void>>,
): Promise<void> {
  const results = await Promise.allSettled(writes);
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(
        "[ai-capacity] Failed to record capacity usage:",
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
    }
  }
}

/**
 * Record token spend, charging model-scoped TPM/TPD plus provider-shared
 * dimensions and the Cloudflare neuron pool.
 */
export async function recordModelTokenUsageDetailed(
  modelId: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  const entry = accountingEntryFor(modelId);
  const total = Math.ceil(
    Math.max(0, usage.inputTokens) + Math.max(0, usage.outputTokens),
  );
  if (total <= 0 && !entry?.limits.neuronsPerMillion) return;
  const provider = providerOf(modelId);
  const dayTtl = entry ? dayTtlSeconds(entry.dayResets) : 86_400;
  const durableWrites: Array<Promise<number | void>> = [];
  if (total > 0) {
    durableWrites.push(
      adjustDurableCounter(getTpmKey(modelId), total, TPM_TTL_SECONDS, total),
      adjustDurableCounter(getTpdKey(modelId), total, dayTtl, total),
    );
    mirrorCapacity(
      cacheLayer.incrementBy(getTpmKey(modelId), total, TPM_TTL_SECONDS),
    );
    mirrorCapacity(cacheLayer.incrementBy(getTpdKey(modelId), total, dayTtl));
    if (entry && provider) {
      if (entry.sharedWithProvider.includes("tpm")) {
        durableWrites.push(
          adjustDurableCounter(
            getProviderKey("tpm", provider),
            total,
            TPM_TTL_SECONDS,
            total,
          ),
        );
        mirrorCapacity(
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
        durableWrites.push(
          adjustDurableCounter(
            getProviderKey("tpd", provider),
            total,
            dayTtl,
            total,
          ),
        );
        mirrorCapacity(
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
      const chargedNeurons = Math.ceil(charge * 1000);
      durableWrites.push(
        adjustDurableCounter(
          getNeuronKey(provider || "cloudflare"),
          chargedNeurons,
          dayTtl,
          chargedNeurons,
        ),
      );
      mirrorCapacity(
        cacheLayer.incrementBy(
          getNeuronKey(provider || "cloudflare"),
          chargedNeurons,
          dayTtl,
        ),
      );
    }
  }
  if (durableWrites.length > 0) await recordDurableWrites(durableWrites);
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
  options?: { turnAborted?: boolean },
): Promise<void> {
  const entry = accountingEntryFor(modelId);
  const provider = providerOf(modelId);
  const classification =
    error !== undefined
      ? classifyProviderFailure(error, options)
      : {
          cooldown: "minute" as const,
          kind: "unknown" as AiFailureKind,
          markModelDead: false,
        };

  // A cancelled request is caller intent, not provider exhaustion.
  if (classification.kind === "cancelled" || classification.cooldown === "none") {
    // A stale catalog identifier is still an eviction. The direct paths
    // (file importer, embeddings) only call this function, so skipping the
    // dead marker here would make them retry a 404 model indefinitely.
    if (classification.markModelDead) {
      await markModelDead(modelId);
    }
    return;
  }

  // Auth failures are account-wide: skip every model from this provider
  // rather than spending the remaining candidates on the same bad key.
  if (classification.cooldown === "provider") {
    if (provider) {
      await markProviderCooling(provider, PROVIDER_AUTH_COOLDOWN_SECONDS);
    }
    return;
  }

  const scope = classification.cooldown;

  if (scope === "day") {
    const dayTtl = entry ? dayTtlSeconds(entry.dayResets) : 86_400;
    await cacheLayer.set<number>(getRpdKey(modelId), EXHAUSTED_SENTINEL, dayTtl);
    // Cool the model's minute bucket for the day too. Providers whose daily
    // cap is not modelled (NVIDIA publishes no RPD) otherwise ignore the RPD
    // sentinel and stay selectable after a day-level refusal.
    await cacheLayer.set<number>(getRpmKey(modelId), EXHAUSTED_SENTINEL, dayTtl);
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

/** Cool an entire provider after an account-level failure (bad key, 403). */
export async function markProviderCooling(
  provider: string,
  ttlSeconds = PROVIDER_AUTH_COOLDOWN_SECONDS,
): Promise<void> {
  await cacheLayer.set<number>(
    getProviderCoolKey(provider),
    1,
    Math.max(1, Math.ceil(ttlSeconds)),
  );
}

export async function isProviderCooling(provider: string): Promise<boolean> {
  const value = await cacheLayer.get<number>(getProviderCoolKey(provider));
  return value !== null && value > 0;
}

// ---------------------------------------------------------------------------
// Health telemetry
//
// Health is a ranking signal, not a circuit breaker. A candidate is never
// removed from the chain because its success rate dipped; a cooldown or an
// exhausted quota is the only hard block. This keeps the fallback chain
// resilient to a bad minute without permanently benching a provider.
// ---------------------------------------------------------------------------

export type ModelHealth = {
  successes: number;
  failures: number;
  consecutiveFailures: number;
  /** Exponential moving average of successful-call latency. */
  latencyEwmaMs: number;
  lastFailureKind?: AiFailureKind;
  updatedAt: number;
};

const EMPTY_HEALTH: ModelHealth = {
  successes: 0,
  failures: 0,
  consecutiveFailures: 0,
  latencyEwmaMs: 0,
  updatedAt: 0,
};

function parseHealth(raw: unknown): ModelHealth {
  if (!raw || typeof raw !== "object") return { ...EMPTY_HEALTH };
  const value = raw as Partial<ModelHealth>;
  return {
    successes: Number.isFinite(value.successes) ? Math.max(0, value.successes ?? 0) : 0,
    failures: Number.isFinite(value.failures) ? Math.max(0, value.failures ?? 0) : 0,
    consecutiveFailures: Number.isFinite(value.consecutiveFailures)
      ? Math.max(0, value.consecutiveFailures ?? 0)
      : 0,
    latencyEwmaMs: Number.isFinite(value.latencyEwmaMs)
      ? Math.max(0, value.latencyEwmaMs ?? 0)
      : 0,
    lastFailureKind: value.lastFailureKind,
    updatedAt: Number.isFinite(value.updatedAt)
      ? (value.updatedAt ?? 0)
      : 0,
  };
}

async function readHealth(modelId: string): Promise<ModelHealth> {
  try {
    return parseHealth(await cacheLayer.get<ModelHealth>(getHealthKey(modelId)));
  } catch {
    return { ...EMPTY_HEALTH };
  }
}

async function writeHealth(modelId: string, health: ModelHealth): Promise<void> {
  try {
    await cacheLayer.set<ModelHealth>(
      getHealthKey(modelId),
      { ...health, updatedAt: Date.now() },
      HEALTH_TTL_SECONDS,
    );
  } catch {
    // Telemetry must never fail a turn.
  }
}

/** Record a completed attempt; latency is the time to completion. */
export async function recordModelSuccess(
  modelId: string,
  latencyMs: number,
): Promise<void> {
  const health = await readHealth(modelId);
  const sample = Math.max(1, Math.min(120_000, Math.round(latencyMs)));
  const latencyEwmaMs =
    health.latencyEwmaMs > 0
      ? Math.round(health.latencyEwmaMs * 0.7 + sample * 0.3)
      : sample;
  await writeHealth(modelId, {
    ...health,
    successes: health.successes + 1,
    consecutiveFailures: 0,
    latencyEwmaMs,
  });
}

/** Record a failed attempt and its classification for later ranking. */
export async function recordModelFailure(
  modelId: string,
  kind: AiFailureKind,
): Promise<void> {
  const health = await readHealth(modelId);
  await writeHealth(modelId, {
    ...health,
    failures: health.failures + 1,
    consecutiveFailures: health.consecutiveFailures + 1,
    lastFailureKind: kind,
  });
}

/**
 * Ranking penalty from observed behaviour. Small on purpose: the routing
 * profile still expresses product intent, and health only breaks ties or
 * demotes a candidate that has repeatedly failed or become noticeably slow.
 */
function healthPenalty(health: ModelHealth | undefined): number {
  if (!health) return 0;
  const attempts = health.successes + health.failures;
  let penalty = 0;

  if (health.consecutiveFailures >= 3) penalty += 6;
  else if (health.consecutiveFailures === 2) penalty += 3;

  if (attempts >= 3 && health.failures / attempts >= 0.5) penalty += 3;

  if (health.latencyEwmaMs >= 12_000) penalty += 2;
  else if (health.latencyEwmaMs >= 6_000) penalty += 1;

  return penalty;
}

/**
 * Quota-efficiency penalty: a candidate already at 70% of a modelled bucket
 * is a worse use of the remaining free allowance than one at 10%, even when
 * the profile lists it first.
 */
function pressurePenalty(loadRatio: number): number {
  if (loadRatio >= 0.9) return 3;
  if (loadRatio >= 0.7) return 2;
  if (loadRatio >= 0.5) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Selection logic
// ---------------------------------------------------------------------------

type ScoredModel = ModelEntry & {
  loadRatio: number;
  health: ModelHealth;
  score: number;
};

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

type CapacityValues = Map<string, unknown>;

function numberAt(values: CapacityValues, key: string): number {
  const value = values.get(key);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Collect the keys one selection pass needs, so they can be fetched in one
 * batched read. The old implementation issued ~10 cache round-trips per
 * candidate; the chain length multiplied that on every turn.
 */
function capacityKeysFor(entries: ModelEntry[]): string[] {
  const keys = new Set<string>();

  for (const entry of entries) {
    const provider = providerOf(entry.modelId);
    keys.add(getRpmKey(entry.modelId));
    keys.add(getRpdKey(entry.modelId));
    keys.add(getTpmKey(entry.modelId));
    keys.add(getTpdKey(entry.modelId));
    keys.add(getDeadKey(entry.modelId));
    keys.add(getHealthKey(entry.modelId));

    if (provider) {
      keys.add(getProviderCoolKey(provider));
      if (entry.sharedWithProvider.includes("rpm")) {
        keys.add(getProviderKey("rpm", provider));
      }
      if (entry.sharedWithProvider.includes("rpd")) {
        keys.add(getProviderKey("rpd", provider));
      }
      if (entry.sharedWithProvider.includes("tpm")) {
        keys.add(getProviderKey("tpm", provider));
      }
      if (
        entry.sharedWithProvider.includes("tpd") ||
        entry.sharedWithProvider.includes("tpm")
      ) {
        keys.add(getProviderKey("tpd", provider));
      }
    }

    if (entry.limits.neuronsPerMillion) {
      keys.add(getNeuronKey(provider));
    }
  }

  return [...keys];
}

async function readCapacityValues(entries: ModelEntry[]): Promise<CapacityValues> {
  const keys = capacityKeysFor(entries);
  try {
    const values = await cacheLayer.getMany<unknown>(keys);
    return new Map(keys.map((key, index) => [key, values[index]]));
  } catch {
    // Capacity telemetry is advisory. If the cache is unreachable, selection
    // falls back to profile order and the atomic reservation still refuses a
    // call that would exceed a hard limit.
    return new Map();
  }
}

/**
 * Calculates how "loaded" a model is as a 0-1 ratio.
 * Takes the worst of per-minute, per-day, token, daily-token, neuron, and
 * provider-shared load. `estimatedTokens` is folded into the token dimensions
 * so a model that cannot fit the turn is treated as stressed.
 */
function loadRatioFor(
  cap: ModelEntry,
  values: CapacityValues,
  estimatedTokens = 0,
): number {
  const provider = providerOf(cap.modelId);
  const minuteCount = numberAt(values, getRpmKey(cap.modelId));
  const dayCount = numberAt(values, getRpdKey(cap.modelId));
  const tokenCount = numberAt(values, getTpmKey(cap.modelId));
  const tpdCount = numberAt(values, getTpdKey(cap.modelId));

  const rpmLimit = quotaLimit(cap, "rpm");
  const rpdLimit = quotaLimit(cap, "rpd");
  const tpmLimit = quotaLimit(cap, "tpm");
  const tpdLimit = quotaLimit(cap, "tpd");

  const minuteLoad = rpmLimit ? (minuteCount + 1) / rpmLimit : 0;
  const dayLoad = rpdLimit ? (dayCount + 1) / rpdLimit : 0;
  const tokenLoad = tpmLimit
    ? (tokenCount + estimatedTokens) / tpmLimit
    : 0;
  const dailyTokenLoad = tpdLimit
    ? (tpdCount + estimatedTokens) / tpdLimit
    : 0;

  let sharedLoad = 0;
  if (provider) {
    const loads: number[] = [];

    if (rpmLimit && cap.sharedWithProvider.includes("rpm")) {
      loads.push(
        (numberAt(values, getProviderKey("rpm", provider)) + 1) / rpmLimit,
      );
    }
    if (rpdLimit && cap.sharedWithProvider.includes("rpd")) {
      loads.push(
        (numberAt(values, getProviderKey("rpd", provider)) + 1) / rpdLimit,
      );
    }
    if (tpmLimit && cap.sharedWithProvider.includes("tpm")) {
      loads.push(
        (numberAt(values, getProviderKey("tpm", provider)) + estimatedTokens) /
          tpmLimit,
      );
    }
    if (
      tpdLimit &&
      (cap.sharedWithProvider.includes("tpd") ||
        cap.sharedWithProvider.includes("tpm"))
    ) {
      loads.push(
        (numberAt(values, getProviderKey("tpd", provider)) + estimatedTokens) /
          tpdLimit,
      );
    }

    if (loads.length > 0) sharedLoad = Math.max(...loads);
  }

  let neuronLoad = 0;
  if (cap.limits.neuronsPerMillion) {
    const pool = getNeuronPoolOverride(CLOUDFLARE_DAILY_NEURON_POOL);
    const neuronMilli = numberAt(values, getNeuronKey(provider));
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

// ---------------------------------------------------------------------------
// Atomic capacity reservation
//
// Selection is a read, so two concurrent turns can both see the last request
// in a bucket. The router reserves before dispatch; the reservation increments
// every enforced dimension in one atomic database transaction
// (`capacity-store.ts`). Redis is an optional dependency, so it can only mirror
// the counters for ranking; it never decides whether a call may dispatch.
// A failed attempt keeps its request count (the provider saw it) but releases
// token capacity unless the failure may already have spent tokens
// (timeout/network/server).
// ---------------------------------------------------------------------------

export type ModelCapacityReservation = {
  modelId: `${string}:${string}`;
  estimatedTokens: number;
  /** Settle with real usage, or keep the conservative estimate when omitted. */
  settle(usage?: { inputTokens: number; outputTokens: number }): Promise<void>;
  /** Release the token hold but keep the request counted. */
  releaseTokens(): Promise<void>;
  /** Undo the whole reservation, e.g. a stale model identifier. */
  rollback(): Promise<void>;
};

type ReservationCounter = CacheReservationCounter & {
  kind: "request" | "tokens" | "neurons";
};

function reservationCountersFor(
  modelId: string,
  entry: AccountingEntry,
  estimatedTokens: number,
): ReservationCounter[] {
  const provider = providerOf(modelId);
  const dayTtl = dayTtlSeconds(entry.dayResets);
  const counters: ReservationCounter[] = [];

  const add = (
    kind: ReservationCounter["kind"],
    key: string,
    limit: number | null,
    amount: number,
    ttlSeconds: number,
  ) => {
    if (!limit) return;
    // A zero estimate is still a modelled bucket: keep the counter so a
    // successful call can settle against real usage. Only positive amounts
    // are sent to the atomic reservation.
    counters.push({
      kind,
      key,
      limit,
      amount: Math.max(0, Math.ceil(amount)),
      ttlSeconds,
    });
  };

  add(
    "request",
    getRpmKey(modelId),
    quotaLimit(entry, "rpm"),
    1,
    RPM_TTL_SECONDS,
  );
  add("request", getRpdKey(modelId), quotaLimit(entry, "rpd"), 1, dayTtl);

  add(
    "tokens",
    getTpmKey(modelId),
    quotaLimit(entry, "tpm"),
    estimatedTokens,
    TPM_TTL_SECONDS,
  );
  add("tokens", getTpdKey(modelId), quotaLimit(entry, "tpd"), estimatedTokens, dayTtl);

  if (provider) {
    if (entry.sharedWithProvider.includes("rpm")) {
      add(
        "request",
        getProviderKey("rpm", provider),
        quotaLimit(entry, "rpm"),
        1,
        RPM_TTL_SECONDS,
      );
    }
    if (entry.sharedWithProvider.includes("rpd")) {
      add(
        "request",
        getProviderKey("rpd", provider),
        quotaLimit(entry, "rpd"),
        1,
        dayTtl,
      );
    }
    if (entry.sharedWithProvider.includes("tpm")) {
      add(
        "tokens",
        getProviderKey("tpm", provider),
        quotaLimit(entry, "tpm"),
        estimatedTokens,
        TPM_TTL_SECONDS,
      );
    }
    if (
      entry.sharedWithProvider.includes("tpd") ||
      entry.sharedWithProvider.includes("tpm")
    ) {
      add(
        "tokens",
        getProviderKey("tpd", provider),
        quotaLimit(entry, "tpd"),
        estimatedTokens,
        dayTtl,
      );
    }
  }

  if (entry.limits.neuronsPerMillion) {
    const rates = entry.limits.neuronsPerMillion;
    const amount = Math.ceil(
      (estimatedTokens * Math.max(rates.input, rates.output)) / 1000,
    );
    add(
      "neurons",
      getNeuronKey(provider || "cloudflare"),
      getNeuronPoolOverride(CLOUDFLARE_DAILY_NEURON_POOL) * 1000,
      amount,
      dayTtl,
    );
  }

  return counters;
}

/**
 * Reserve request + token capacity for one dispatch attempt.
 *
 * Returns `null` when another request already holds the capacity, or when the
 * durable capacity store is unavailable. The caller should skip that candidate
 * without spending an attempt. Redis is updated afterwards only as a
 * best-effort selection mirror.
 */
export async function reserveModelCapacity(
  modelId: `${string}:${string}` | string,
  estimatedTokens = 0,
): Promise<ModelCapacityReservation | null> {
  const entry = accountingEntryFor(modelId);
  if (!entry) return null;

  const estimate = Number.isFinite(estimatedTokens)
    ? Math.max(0, Math.ceil(estimatedTokens))
    : 0;
  const counters = reservationCountersFor(modelId, entry, estimate);
  const heldCounters = counters.filter((counter) => counter.amount > 0);
  const result = await reserveDurableCapacity(
    heldCounters.map((counter) => ({
      key: counter.key,
      limit: counter.limit,
      amount: counter.amount,
      ttlSeconds: counter.ttlSeconds,
    })),
  );
  if (!result.ok) {
    console.warn(
      `[ai-capacity] Reservation refused: model="${modelId}" key="${result.key}"${
        result.unavailable
          ? " (capacity store unavailable; refusing dispatch)"
          : ""
      }`,
    );
    return null;
  }

  // Mirror the hold so selection/ranking sees it. The durable reservation is
  // already committed, so this write is fire-and-forget: a slow or missing
  // cache must not delay dispatch or revoke capacity.
  if (heldCounters.length > 0) {
    mirrorCapacity(
      cacheLayer.reserve(
        heldCounters.map((counter) => ({
          key: counter.key,
          limit: counter.limit,
          amount: counter.amount,
          ttlSeconds: counter.ttlSeconds,
        })),
      ),
    );
  }

  // Reference for window-aware settlement, sampled after the durable
  // reservation returns. The row can only have been created at or before this
  // instant, so a counter with a longer remaining lifetime is provably from a
  // newer window.
  const reservedAt = Date.now();
  const heldForMs = () => Math.max(0, Date.now() - reservedAt);

  let settled = false;
  const tokenCounters = counters.filter((counter) => counter.kind === "tokens");
  const neuronCounters = counters.filter(
    (counter) => counter.kind === "neurons",
  );

  const adjustCounter = async (
    counter: ReservationCounter,
    delta: number,
    whenMissing: number,
  ) => {
    const held = heldForMs();
    mirrorCapacity(
      cacheLayer.adjustCounter(
        counter.key,
        delta,
        counter.ttlSeconds,
        whenMissing,
        held,
      ),
    );
    await adjustDurableCounter(
      counter.key,
      delta,
      counter.ttlSeconds,
      whenMissing,
      held,
    );
  };

  const applyUsage = async (
    usage: { inputTokens: number; outputTokens: number },
  ) => {
    const actualInput = Math.max(0, usage.inputTokens);
    const actualOutput = Math.max(0, usage.outputTokens);
    const actualTotal = actualInput + actualOutput;
    const tokenDelta = actualTotal - estimate;
    if (tokenDelta !== 0) {
      await Promise.all(
        tokenCounters.map((counter) =>
          adjustCounter(counter, tokenDelta, actualTotal),
        ),
      );
    }

    const rates = entry.limits.neuronsPerMillion;
    if (rates && neuronCounters.length > 0) {
      const actualMilli = Math.ceil(
        (actualInput * rates.input + actualOutput * rates.output) / 1000,
      );
      const estimateMilli = neuronCounters.reduce(
        (total, counter) => total + counter.amount,
        0,
      );
      const neuronDelta = actualMilli - estimateMilli;
      if (neuronDelta !== 0) {
        await Promise.all(
          neuronCounters.map((counter) =>
            adjustCounter(counter, neuronDelta, actualMilli),
          ),
        );
      }
    }
  };

  return {
    modelId: modelId as `${string}:${string}`,
    estimatedTokens: estimate,
    async settle(usage) {
      if (settled) return;
      settled = true;
      // No usage report: keep the conservative hold rather than pretending
      // the provider spent nothing.
      if (!usage) return;
      await applyUsage(usage);
    },
    async releaseTokens() {
      if (settled) return;
      settled = true;
      await Promise.all(
        [...tokenCounters, ...neuronCounters]
          .filter((counter) => counter.amount > 0)
          .map((counter) => adjustCounter(counter, -counter.amount, 0)),
      );
    },
    async rollback() {
      if (settled) return;
      settled = true;
      await Promise.all(
        heldCounters.map((counter) =>
          adjustCounter(counter, -counter.amount, 0),
        ),
      );
    },
  };
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
  const { profile } = criteria;
  const estimatedTokens = Number.isFinite(criteria.estimatedTokens)
    ? Math.max(0, Math.ceil(criteria.estimatedTokens ?? 0))
    : 0;

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
    // Legacy path (criteria-based callers and tests): filter then apply
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

  // A payload larger than a candidate's context window can never succeed.
  // Filtering it here saves a doomed provider call; the fallback wrapper's
  // oversized escalation still covers estimation error.
  ordered = ordered.filter(
    (entry) => estimatedTokens === 0 || estimatedTokens <= entry.contextWindow,
  );

  // One batched cache read for every candidate: dead markers, provider
  // cooldowns, quota counters, and success/latency health. Previously this was
  // a serial fan-out of ~10 round-trips per candidate.
  const values = await readCapacityValues(ordered);

  ordered = ordered.filter((entry) => {
    const provider = providerOf(entry.modelId);
    if (numberAt(values, getDeadKey(entry.modelId)) > 0) return false;
    if (provider && numberAt(values, getProviderCoolKey(provider)) > 0) {
      return false;
    }
    return true;
  });

  const rankInProfile = new Map(ordered.map((e, i) => [e.modelId, i]));
  const scored: ScoredModel[] = ordered.map((cap) => {
    const loadRatio = loadRatioFor(cap, values, estimatedTokens);
    const health = parseHealth(values.get(getHealthKey(cap.modelId)));
    const profileRank = rankInProfile.get(cap.modelId) ?? 0;
    return {
      ...cap,
      loadRatio,
      health,
      score:
        profileRank + pressurePenalty(loadRatio) + healthPenalty(health),
    };
  });

  const available = scored.filter((m) => m.loadRatio < CAPACITY_THRESHOLD);
  const stressed = scored.filter(
    (m) => m.loadRatio >= CAPACITY_THRESHOLD && m.loadRatio < QUOTA_CEILING,
  );

  // Within the available tier, profile rank is the base score; observed
  // pressure/health only demote. Reserve entries stay last in both tiers no
  // matter how good their score is. Ties fall back to the explicit profile
  // order, so the intent encoded in routing-profiles.ts still wins.
  const compareAvailable = (a: ScoredModel, b: ScoredModel) => {
    const tier = reserveRank(a) - reserveRank(b);
    if (tier !== 0) return tier;
    if (a.score !== b.score) return a.score - b.score;
    return (
      (rankInProfile.get(a.modelId) ?? 0) - (rankInProfile.get(b.modelId) ?? 0)
    );
  };
  available.sort(compareAvailable);
  // Stressed: least-loaded first as last resort, reserve still held back.
  stressed.sort((a, b) => {
    const tier = reserveRank(a) - reserveRank(b);
    if (tier !== 0) return tier;
    if (a.loadRatio !== b.loadRatio) return a.loadRatio - b.loadRatio;
    return a.score - b.score;
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
 * The file importer calls this before each direct Gemini extraction attempt:
 * a model that is absent from the catalog, remembered dead, or already at its
 * quota is skipped without spending a request. "Stressed" is still selectable;
 * it only ranks behind healthy candidates in normal selection.
 */
export async function getModelQuotaState(
  modelId: string,
  estimatedTokens = 0,
): Promise<ModelQuotaState> {
  const entry = catalogEntryFor(modelId);
  if (!entry) return "unknown";
  const values = await readCapacityValues([entry]);
  if (numberAt(values, getDeadKey(modelId)) > 0) return "dead";
  const provider = providerOf(modelId);
  if (provider && numberAt(values, getProviderCoolKey(provider)) > 0) {
    return "exhausted";
  }
  const ratio = loadRatioFor(entry, values, estimatedTokens);
  if (ratio >= QUOTA_CEILING) return "exhausted";
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
export type CapacitySnapshotEntry = {
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
  /** Only dimensions the provider meters account-wide are populated. */
  providerShared: Record<QuotaDimension, number | null>;
  neuronUsageMilli: number | null;
  neuronPool: number | null;
  loadRatio: number;
  available: boolean;
  quotaExhausted: boolean;
  /** Stale catalog identifier (404) remembered for hours. */
  dead: boolean;
  /** Account-level cooldown after an auth/permission failure. */
  providerCooling: boolean;
  health: ModelHealth;
};

/**
 * Returns current capacity status for all models. Used in dev debug info and
 * the admin AI page. One batched cache read per model feeds every dimension,
 * including the health telemetry used for adaptive ranking.
 */
export async function getCapacitySnapshot(): Promise<CapacitySnapshotEntry[]> {
  const catalog = getModelCatalog();
  // One batched read for the whole catalog instead of a round-trip per model.
  const values = await readCapacityValues(catalog);
  return catalog.map((cap) => {
    const provider = providerOf(cap.modelId);
    const loadRatio = loadRatioFor(cap, values);
    const providerShared: Record<QuotaDimension, number | null> = {
      rpm: null,
      rpd: null,
      tpm: null,
      tpd: null,
    };
    for (const dimension of QUOTA_DIMENSIONS) {
      if (cap.sharedWithProvider.includes(dimension)) {
        providerShared[dimension] = numberAt(
          values,
          getProviderKey(dimension, provider),
        );
      }
    }
    return {
      modelId: cap.modelId,
      quality: cap.quality,
      rpm: cap.limits.rpm,
      rpd: cap.limits.rpd,
      tpm: cap.limits.tpm,
      tpd: cap.limits.tpd,
      minuteUsage: numberAt(values, getRpmKey(cap.modelId)),
      dayUsage: numberAt(values, getRpdKey(cap.modelId)),
      tokenUsage: numberAt(values, getTpmKey(cap.modelId)),
      dailyTokenUsage: numberAt(values, getTpdKey(cap.modelId)),
      providerShared,
      neuronUsageMilli: cap.limits.neuronsPerMillion
        ? numberAt(values, getNeuronKey(provider))
        : null,
      neuronPool: cap.limits.neuronsPerMillion
        ? getNeuronPoolOverride(CLOUDFLARE_DAILY_NEURON_POOL)
        : null,
      loadRatio,
      available: loadRatio < CAPACITY_THRESHOLD,
      quotaExhausted: loadRatio >= QUOTA_CEILING,
      dead: numberAt(values, getDeadKey(cap.modelId)) > 0,
      providerCooling:
        Boolean(provider) &&
        numberAt(values, getProviderCoolKey(provider)) > 0,
      health: parseHealth(values.get(getHealthKey(cap.modelId))),
    };
  });
}

/** Get all registered model IDs for the dev model selector. */
export function getAllRegisteredModelIds(): `${string}:${string}`[] {
  return getModelCatalog().map((cap) => cap.modelId);
}

/**
 * Resets the best-effort usage mirror. Used for testing.
 * Durable counters live in Postgres and end with their window; a test that
 * needs a clean durable state must clear `ai_capacity_counters` directly.
 * @internal
 */
export async function _resetUsageCounters(): Promise<void> {
  const catalog = getModelCatalog();
  const providers = new Set(catalog.map((cap) => providerOf(cap.modelId)));
  await Promise.all([
    ...catalog.flatMap((cap) => [
      cacheLayer.delete(getRpmKey(cap.modelId)),
      cacheLayer.delete(getRpdKey(cap.modelId)),
      cacheLayer.delete(getTpmKey(cap.modelId)),
      cacheLayer.delete(getTpdKey(cap.modelId)),
      cacheLayer.delete(getDeadKey(cap.modelId)),
      cacheLayer.delete(getHealthKey(cap.modelId)),
    ]),
    ...[...providers].flatMap((provider) => [
      cacheLayer.delete(getProviderKey("rpm", provider)),
      cacheLayer.delete(getProviderKey("rpd", provider)),
      cacheLayer.delete(getProviderKey("tpm", provider)),
      cacheLayer.delete(getProviderKey("tpd", provider)),
      cacheLayer.delete(getProviderCoolKey(provider)),
      cacheLayer.delete(getNeuronKey(provider)),
    ]),
  ]);
}

/** Attempt budget for chat turns — explicit, visible at the call site. */
export const CHAT_MAX_ATTEMPTS = 5;
/** Attempt budget for non-chat (single-shot) generation. */
export const NON_CHAT_MAX_ATTEMPTS = 4;
