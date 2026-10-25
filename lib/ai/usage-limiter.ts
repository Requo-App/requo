import "server-only";

import { and, eq, gte, isNull, or, sql, sum } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { aiUsageEvents } from "@/lib/db/schema";
import type { AiTaskType } from "./types";
import type { PlanTier } from "@/lib/plans/plans";
import { getUpgradePlan } from "@/lib/plans/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { cacheLayer } from "@/lib/ai/cache-layer";
import { newEntityId } from "@/lib/ids";

// ---------------------------------------------------------------------------
// Usage Limiter — enforces monthly weighted usage limits and per-request cooldown
//
// Business-scoped tracking:
// - Monthly weighted usage is summed per business (`aiUsageEvents.businessId`)
// - Subscriptions are business-scoped, so each subscribed business receives
//   its own full allowance; an owner's other businesses never consume it
// - Requests are rejected only when the business's own usage meets the limit
//
// Plan-scoped tracking (reset on plan change):
// - Each usage event records the plan in effect when it was metered
//   (`aiUsageEvents.plan`), and the monthly sum is filtered to that plan.
// - Changing plan mid-month therefore starts a fresh allowance for the new
//   plan instead of carrying the previous plan's total against it: an upgrade
//   immediately receives the full new allowance, a downgrade starts at the
//   full (smaller) allowance. No proration math is required.
// - Rows written before plan attribution existed have `plan IS NULL` and count
//   toward whichever plan is current, so no business loses an already
//   accumulated allowance at deploy time.
//
// Weighting:
// - Weight is derived from the tokens an invocation actually spent rather than
//   a fixed per-task constant (see `computeCreditsForTokens`).
//
// Cooldown:
// - 3-second minimum between consecutive requests (same user + task type)
// - Cooldown tracked via Cache Layer (Redis with in-memory fallback)
// - Cooldown is an abuse guard, not a hard spend limit: the monthly quota is
//   always enforced from the database (`reserveUsage`), so a lost cooldown
//   cannot let a business exceed its allowance
// - Cooldown starts when a request is accepted for processing (not on cache hits)
// - Cooldown rejections do not deduct usage
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Plan limits
//
// The monthly AI allowance is defined centrally in `lib/plans/usage-limits.ts`
// (`aiWeightedCreditsPerMonth`). This compatibility constant is derived from
// that single source of truth.
// ---------------------------------------------------------------------------

export const PLAN_LIMITS: Record<PlanTier, number> = {
  free: getUsageLimit("free", "aiWeightedCreditsPerMonth") ?? 30,
  pro: getUsageLimit("pro", "aiWeightedCreditsPerMonth") ?? 150,
  business: getUsageLimit("business", "aiWeightedCreditsPerMonth") ?? 500,
};

// ---------------------------------------------------------------------------
// Fallback task weights
//
// Credits are metered from real token usage. These fixed per-task weights are
// only a fallback for an invocation that returns no token accounting at all
// (a provider that omits `usage`), so a metered call can never silently cost
// zero credits.
// ---------------------------------------------------------------------------

export const TASK_WEIGHTS: Record<AiTaskType, number> = {
  quote_improvement: 2,
  quote_draft: 3,
  agent_conversation: 1, // One credit per agent turn (cheaper — public-facing, lighter quality tier)
  assistant_message: 1, // One credit per assistant turn; separate daily bucket enforced in conversation-limits
  follow_up_message: 1, // One credit per generated follow-up message
};

// ---------------------------------------------------------------------------
// Token → credit conversion
//
// credit = max(1, ceil((inputTokens + 4 × outputTokens) / 5000))
//
// Output tokens are weighted 4× because generation is roughly an order of
// magnitude more expensive than reading the same volume, and because output
// length is what actually drives spend. The 5,000-token divisor keeps a
// typical quote draft (~2 credits) and chat turn (~1 credit) in the same range
// the previous fixed weights produced.
// ---------------------------------------------------------------------------

/** Weighted tokens per credit. */
export const CREDIT_TOKEN_DIVISOR = 5_000;

/** Multiplier applied to output tokens when computing weighted tokens. */
export const OUTPUT_TOKEN_MULTIPLIER = 4;

/** Every metered invocation costs at least this much. */
export const MIN_CREDITS_PER_INVOCATION = 1;

/** Token accounting for one invocation, if the provider reported any. */
export type InvocationTokenUsage =
  | {
      inputTokens?: number | null;
      outputTokens?: number | null;
    }
  | null
  | undefined;

/**
 * Converts an invocation's token spend into credits.
 *
 * Always returns at least `MIN_CREDITS_PER_INVOCATION`, so a recorded
 * invocation is never free.
 */
export function computeCreditsForTokens(
  inputTokens: number,
  outputTokens: number,
): number {
  const safeInput = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const safeOutput = Number.isFinite(outputTokens)
    ? Math.max(0, outputTokens)
    : 0;

  const weightedTokens = safeInput + safeOutput * OUTPUT_TOKEN_MULTIPLIER;

  return Math.max(
    MIN_CREDITS_PER_INVOCATION,
    Math.ceil(weightedTokens / CREDIT_TOKEN_DIVISOR),
  );
}

/**
 * Resolves the credit weight to record for one invocation.
 *
 * Uses real token usage when the provider reported it, and falls back to the
 * fixed per-task weight when there is no token accounting at all.
 */
export function computeUsageWeight(
  taskType: AiTaskType,
  usage?: InvocationTokenUsage,
): number {
  if (usage === null || usage === undefined) {
    return TASK_WEIGHTS[taskType];
  }

  return computeCreditsForTokens(
    usage.inputTokens ?? 0,
    usage.outputTokens ?? 0,
  );
}

// ---------------------------------------------------------------------------
// Cooldown tracking (via Cache Layer)
// ---------------------------------------------------------------------------

const COOLDOWN_SECONDS = 3;
const COOLDOWN_KEY_PREFIX = "cool:";

function getCooldownKey(userId: string, taskType: AiTaskType): string {
  return `${COOLDOWN_KEY_PREFIX}${userId}:${taskType}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UsageLimitCheck = {
  userId: string;
  businessId: string;
  taskType: AiTaskType;
  plan: PlanTier;
};

export type UsageLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "quota_exceeded" | "cooldown"; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStartOfCurrentMonthUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * SQL predicate scoping usage rows to a plan.
 *
 * Legacy rows written before plan attribution have `plan IS NULL` and count
 * toward whichever plan is current, so no business loses its accumulated
 * allowance at deploy time.
 */
function planScope(plan: PlanTier) {
  return or(eq(aiUsageEvents.plan, plan), isNull(aiUsageEvents.plan));
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Checks whether an AI request is allowed based on:
 * 1. Cooldown (3-second minimum between same user + task type, best-effort)
 * 2. Monthly weighted usage quota (business-level, scoped to the current plan)
 *
 * The quota is read from the authoritative `ai_usage_events` rows rather than
 * a cache: a cached total is not safe to compare against a hard allowance.
 * Callers that dispatch a provider should use `reserveUsage`, which performs
 * the check and the reservation (including concurrent requests) under one
 * per-business database lock.
 *
 * Returns `{ allowed: true }` or `{ allowed: false, reason, message }`.
 */
export async function checkUsageLimit(
  input: UsageLimitCheck,
): Promise<UsageLimitResult> {
  const { userId, businessId, taskType, plan } = input;

  const cooldown = await checkCooldown(userId, taskType);
  if (cooldown) return cooldown;

  // --- Quota check (database authority) ---
  const limit = PLAN_LIMITS[plan];
  const businessUsage = await getBusinessUsageTotal(businessId, plan);

  if (businessUsage >= limit) {
    return buildQuotaExceededResult(plan);
  }

  return { allowed: true };
}

async function checkCooldown(
  userId: string,
  taskType: AiTaskType,
): Promise<Extract<UsageLimitResult, { allowed: false }> | null> {
  const cooldownKey = getCooldownKey(userId, taskType);
  const lastAccepted = await cacheLayer.get<number>(cooldownKey);

  if (lastAccepted !== null) {
    const elapsedMs = Date.now() - lastAccepted;
    const cooldownMs = COOLDOWN_SECONDS * 1000;

    if (elapsedMs < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
      return {
        allowed: false,
        reason: "cooldown",
        message: `Please wait ${remainingSeconds} second${remainingSeconds === 1 ? "" : "s"} before making another ${taskType} request.`,
      };
    }
  }

  return null;
}

export type UsageReservation = {
  id: string;
  businessId: string;
  plan: PlanTier;
};

type UsageReservationResult =
  | { allowed: true; reservation: UsageReservation }
  | Extract<UsageLimitResult, { allowed: false }>;

/** Reserve one credit before invoking a provider, serialized per business. */
export async function reserveUsage(
  input: UsageLimitCheck,
): Promise<UsageReservationResult> {
  const { userId, businessId, taskType, plan } = input;
  const cooldown = await checkCooldown(userId, taskType);
  if (cooldown) return cooldown;

  const result = await db.transaction(async (tx): Promise<UsageReservationResult> => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('ai-usage'), hashtext(${businessId}))`,
    );

    // The database is the authority. A cache-first total could be stale, and
    // two concurrent requests could both pass the same last-credit check.
    const [row] = await tx
      .select({ total: sum(aiUsageEvents.weight) })
      .from(aiUsageEvents)
      .where(and(
        eq(aiUsageEvents.businessId, businessId),
        gte(aiUsageEvents.createdAt, getStartOfCurrentMonthUTC()),
        planScope(plan),
      ));

    if (Number(row?.total ?? 0) >= PLAN_LIMITS[plan]) {
      return buildQuotaExceededResult(plan);
    }

    const reservation = { id: newEntityId(), businessId, plan };
    await tx.insert(aiUsageEvents).values({
      ...reservation, userId, taskType, weight: MIN_CREDITS_PER_INVOCATION,
    });
    return { allowed: true, reservation };
  });

  return result;
}

/** Replace the reservation with the invocation's final token-weighted cost. */
export async function settleUsageReservation(
  reservation: UsageReservation,
  weight: number,
): Promise<void> {
  await finalizeUsageReservation(reservation, weight);
}

/** Release the reserved credit when generation fails. */
export async function releaseUsageReservation(
  reservation: UsageReservation,
): Promise<void> {
  await finalizeUsageReservation(reservation, null);
}

async function finalizeUsageReservation(
  reservation: UsageReservation,
  weight: number | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('ai-usage'), hashtext(${reservation.businessId}))`,
    );
    const condition = and(
      eq(aiUsageEvents.id, reservation.id),
      eq(aiUsageEvents.businessId, reservation.businessId),
      eq(aiUsageEvents.plan, reservation.plan),
    );
    if (weight === null) {
      await tx.delete(aiUsageEvents).where(condition);
    } else {
      await tx.update(aiUsageEvents).set({ weight }).where(condition);
    }
  });
}

/** The authoritative monthly weighted usage for a business under a plan. */
async function getBusinessUsageTotal(
  businessId: string,
  plan: PlanTier,
): Promise<number> {
  const monthStart = getStartOfCurrentMonthUTC();

  const [usageRow] = await db
    .select({ businessTotal: sum(aiUsageEvents.weight) })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.businessId, businessId),
        gte(aiUsageEvents.createdAt, monthStart),
        planScope(plan),
      ),
    );

  return Number(usageRow?.businessTotal ?? 0);
}

/**
 * Records a usage event in the database. Call this after a successful AI
 * invocation (not on cache hits or cooldown rejections).
 *
 * `weight` is normally derived from the invocation's real token usage via
 * `computeUsageWeight`. `plan` is the plan in effect for this invocation and
 * scopes the event, so a later plan change starts a fresh allowance.
 *
 * The insert is the only write: there is no cached quota total to keep in
 * sync, so a cache outage cannot corrupt the allowance.
 */
export async function recordUsage(
  userId: string,
  businessId: string,
  taskType: AiTaskType,
  weight: number,
  plan: PlanTier,
): Promise<void> {
  const id = newEntityId();

  await db.insert(aiUsageEvents).values({
    id,
    userId,
    businessId,
    taskType,
    weight,
    plan,
  });
}

/**
 * Starts the cooldown timer for a user + task type combination.
 * Call this when a request is accepted for processing (not on cache hits).
 */
export async function startCooldown(userId: string, taskType: AiTaskType): Promise<void> {
  const key = getCooldownKey(userId, taskType);
  await cacheLayer.set<number>(key, Date.now(), COOLDOWN_SECONDS);
}

/**
 * Resets the cooldown for a specific user + task type. Primarily useful for testing.
 */
export async function resetCooldown(userId: string, taskType: AiTaskType): Promise<void> {
  const key = getCooldownKey(userId, taskType);
  await cacheLayer.delete(key);
}

/**
 * Returns the current month's usage for a business under the given plan, plus
 * the plan limit. Used for displaying credit status in the UI.
 */
export async function getMonthlyUsageSummary(
  businessId: string,
  plan: PlanTier,
): Promise<{ used: number; limit: number }> {
  const monthStart = getStartOfCurrentMonthUTC();
  const limit = PLAN_LIMITS[plan];

  const [row] = await db
    .select({ total: sum(aiUsageEvents.weight) })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.businessId, businessId),
        gte(aiUsageEvents.createdAt, monthStart),
        planScope(plan),
      ),
    );

  return { used: Number(row?.total ?? 0), limit };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildQuotaExceededResult(
  plan: PlanTier,
): Extract<UsageLimitResult, { allowed: false }> {
  const upgradePlan = getUpgradePlan(plan);
  const upgradeMessage = upgradePlan
    ? " Upgrade for more drafts."
    : "";

  return {
    allowed: false,
    reason: "quota_exceeded",
    message: `You've used this month's AI drafting allowance.${upgradeMessage}`,
  };
}