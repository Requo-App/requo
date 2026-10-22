import "server-only";

import { generateText, streamText } from "ai";

import {
  CHAT_MAX_ATTEMPTS,
  NON_CHAT_MAX_ATTEMPTS,
  selectModels,
} from "@/lib/ai/capacity-selector";
import { wrapProviderError } from "@/lib/ai/errors";
import {
  createFallbackLanguageModel,
  type FallbackAttemptTrailEntry,
} from "@/lib/ai/fallback-model";
import { noModelsAvailableError } from "@/lib/ai/routing-errors";
import type { AiRoutingProfile } from "@/lib/ai/routing-profiles";
// Re-exported so feature orchestrators route model selection through the
// router entry-point instead of importing capacity-selector directly.
export { selectModels } from "@/lib/ai/capacity-selector";
import { estimateTokens } from "@/lib/ai/token-budget";
import type {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProviderName,
  AiStreamResponse,
  AiStreamChunk,
} from "@/lib/ai/types";

// ---------------------------------------------------------------------------
// AI Provider + Model Fallback Router — Vercel AI SDK
//
// Profile-driven selection (see lib/ai/routing-profiles.ts) plus a fallback
// chain that advances through every candidate. Both entry points run through
// the same `createFallbackLanguageModel` wrapper, so streaming and
// non-streaming turns cannot drift into different failure, cooldown, or
// accounting policies.
//
// - A non-retryable error advances to the next provider; only an exhausted
//   candidate list is a failure.
// - A 404 / model-not-found is skipped (and remembered as dead for hours)
//   without consuming an attempt.
// - Oversized payloads route to a higher-context candidate, not plain rotation.
// - Caller cancellation stops the chain; an end-to-end deadline bounds it.
// - Every dispatch reserves provider capacity atomically before the provider
//   call (see capacity-selector.ts).
// ---------------------------------------------------------------------------

const PROVIDER_TIMEOUTS: Record<AiProviderName, number> = {
  groq: 15_000,
  gemini: 20_000,
  cloudflare: 25_000,
  nvidia: 25_000,
  openrouter: 30_000,
};

/** End-to-end budgets. Per-candidate timeouts sit inside these. */
const NON_CHAT_DEADLINE_MS = 90_000;
const CHAT_DEADLINE_MS = 120_000;

/** The registry prefixes `google` for Gemini; the rest of the code uses `gemini`. */
function normalizeProviderName(providerPrefix: string): AiProviderName {
  return (providerPrefix === "google" ? "gemini" : providerPrefix) as AiProviderName;
}

/** Per-candidate provider timeout, keyed by registry prefix. */
export function providerTimeoutMs(providerPrefix: string): number {
  return PROVIDER_TIMEOUTS[normalizeProviderName(providerPrefix)] ?? 25_000;
}

function parseServingModel(modelId: string): {
  provider: AiProviderName;
  model: string;
} {
  const [providerPrefix, ...modelParts] = modelId.split(":");
  return {
    provider: normalizeProviderName(providerPrefix),
    model: modelParts.join(":"),
  };
}

/** Combine caller cancellation with an end-to-end deadline. */
function deadlineSignal(
  request: AiCompletionRequest,
  defaultMs: number,
): AbortSignal {
  const requested = request.deadlineMs;
  const deadlineMs =
    typeof requested === "number" && Number.isFinite(requested) && requested > 0
      ? requested
      : defaultMs;
  const timeout = AbortSignal.timeout(deadlineMs);
  return request.abortSignal
    ? AbortSignal.any([request.abortSignal, timeout])
    : timeout;
}

function buildMessages(request: AiCompletionRequest) {
  return {
    system: request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n") || undefined,
    messages: request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  };
}

/** Legacy quality-tier → profile mapping (quality tiers are removed). */
function profileForLegacyTier(
  tier: AiCompletionRequest["qualityTier"],
): AiRoutingProfile {
  switch (tier) {
    case "cheap":
      return "short_text";
    case "best":
      return "quote_draft";
    default:
      return "quote_draft";
  }
}

function estimateRequestTokens(request: AiCompletionRequest): number {
  const text = request.messages.map((m) => m.content).join("\n");
  // 15% headroom over the char/4 approximation: provider tokenisers and
  // non-Latin text routinely run hotter, and an under-estimate is what lets a
  // "quota-aware" router overshoot. The fixed 500 covers protocol overhead.
  const raw = estimateTokens(text) * 1.15 + (request.maxOutputTokens ?? 0) + 500;
  return Math.ceil(raw);
}

function attemptReason(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 200);
  return "unknown error";
}

function trailText(trail: FallbackAttemptTrailEntry[]): string {
  return trail.map((t) => `${t.modelId} (${t.reason})`).join("; ");
}

// ---------------------------------------------------------------------------
// generateWithFallback
// ---------------------------------------------------------------------------

/**
 * Generate a completion using profile-driven selection + fallback chain.
 *
 * Strategy:
 * 1. Select via routing profile (explicit `routingProfile` wins; legacy
 *    `qualityTier` maps onto a profile).
 * 2. Dispatch through the fallback wrapper, which tries each candidate in
 *    order. EVERY failure advances to the next candidate — including failures
 *    previously classified as non-retryable. A 404 marks the identifier dead
 *    for hours. Oversized payloads prefer larger-context candidates next.
 * 3. If ALL candidates fail, throw with an attempt trail.
 */
export async function generateWithFallback(
  request: AiCompletionRequest,
): Promise<AiCompletionResponse> {
  const profile = request.routingProfile ?? profileForLegacyTier(request.qualityTier);
  const estimatedTokens =
    request.estimatedTokens ?? estimateRequestTokens(request);
  const modelIds = await selectModels({ profile, estimatedTokens });

  if (modelIds.length === 0) {
    throw noModelsAvailableError(profile);
  }

  const { system, messages } = buildMessages(request);
  let serving = parseServingModel(modelIds[0]);
  let lastFailedProvider: AiProviderName | undefined;
  const trail: FallbackAttemptTrailEntry[] = [];

  const fallbackModel = createFallbackLanguageModel({
    modelIds,
    maxAttempts: Math.min(NON_CHAT_MAX_ATTEMPTS, modelIds.length),
    estimatedTokens,
    getTimeoutMs: ({ provider }) => providerTimeoutMs(provider),
    onModelSelected: (selected) => {
      serving = {
        provider: normalizeProviderName(selected.provider),
        model: selected.model,
      };
    },
    onAttemptFailed: (selected, error) => {
      lastFailedProvider = normalizeProviderName(selected.provider);
      const reason = attemptReason(error);
      trail.push({ modelId: selected.modelId, reason });
      console.warn(
        `[ai-router] Failed (advancing): model="${selected.modelId}" reason="${reason}"`,
      );
    },
  });

  try {
    const result = await generateText({
      model: fallbackModel,
      system,
      messages,
      temperature: request.temperature,
      maxOutputTokens: request.maxOutputTokens,
      abortSignal: deadlineSignal(request, NON_CHAT_DEADLINE_MS),
      // The fallback wrapper owns retries: an SDK retry would re-dispatch the
      // same candidate and double-charge the quota reservation.
      maxRetries: 0,
    });

    if (!result.text?.trim()) {
      console.error(
        `[ai-router] Zero-text completion (logged as error): model="${serving.provider}:${serving.model}"`,
      );
    }
    console.info(
      `[ai-router] Completion succeeded: model="${serving.provider}:${serving.model}"`,
    );

    return {
      provider: serving.provider,
      model: serving.model,
      text: result.text,
      usage: {
        promptTokens: result.usage?.inputTokens ?? undefined,
        completionTokens: result.usage?.outputTokens ?? undefined,
        totalTokens: result.usage
          ? (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)
          : undefined,
      },
      raw: result,
    };
  } catch (error) {
    const text = trailText(trail);
    console.error(`[ai-router] All candidates failed: ${text || "no attempt trail"}`);
    // Preserve the structured provider error contract used by callers that
    // inspect status/retryability. The wrapper already logged each attempt.
    const provider =
      lastFailedProvider ?? parseServingModel(modelIds[0]).provider;
    throw wrapProviderError(provider, error);
  }
}

// ---------------------------------------------------------------------------
// streamWithFallback
// ---------------------------------------------------------------------------

/**
 * Start a streaming completion using profile-driven selection + fallback.
 * Advances through the chain on every failure (including non-retryable).
 */
export async function streamWithFallback(
  request: AiCompletionRequest,
  options?: { onFallback?: () => void },
): Promise<AiStreamResponse> {
  const profile = request.routingProfile ?? profileForLegacyTier(request.qualityTier);
  const estimatedTokens =
    request.estimatedTokens ?? estimateRequestTokens(request);
  const modelIds = await selectModels({ profile, estimatedTokens });

  if (modelIds.length === 0) {
    throw noModelsAvailableError(profile);
  }

  const { system, messages } = buildMessages(request);
  let serving = parseServingModel(modelIds[0]);
  let fallbackReported = false;
  // The AI SDK's `streamText` is synchronous: it returns a result object and
  // performs the provider call lazily, when the stream is consumed. A
  // try/catch around `streamText` therefore never observes a provider
  // failure, and the chain could not advance. The fallback wrapper is the
  // seam that keeps the contract: it resolves the candidate inside its own
  // `doStream`, so a provider error advances to the next candidate before
  // any chunk reaches the client.
  const fallbackModel = createFallbackLanguageModel({
    modelIds,
    maxAttempts: CHAT_MAX_ATTEMPTS,
    estimatedTokens,
    getTimeoutMs: ({ provider }) => providerTimeoutMs(provider),
    onModelSelected: (selected) => {
      serving = {
        provider: normalizeProviderName(selected.provider),
        model: selected.model,
      };
    },
    onAttemptFailed: () => {
      if (!fallbackReported) {
        fallbackReported = true;
        options?.onFallback?.();
      }
    },
  });

  const turnSignal = deadlineSignal(request, CHAT_DEADLINE_MS);
  let streamFailure: { error: unknown } | undefined;
  const result = streamText({
    model: fallbackModel,
    system,
    messages,
    temperature: request.temperature,
    maxOutputTokens: request.maxOutputTokens,
    abortSignal: turnSignal,
    // The fallback wrapper owns the cross-provider walk. The SDK default (2)
    // would re-run the whole candidate chain and double-charge reservations
    // whenever every candidate failed before the stream starts.
    maxRetries: 0,
    onError: ({ error }) => {
      streamFailure = { error };
    },
  });

  async function* chunks(): AsyncGenerator<AiStreamChunk> {
    try {
      for await (const chunk of result.textStream) {
        if (chunk) {
          yield { delta: chunk, finishReason: null };
        }
      }
      turnSignal.throwIfAborted();
      if (streamFailure) throw streamFailure.error;
    } catch (error) {
      if (streamFailure) throw streamFailure.error;
      throw error;
    }
    yield { delta: "", finishReason: "stop" };
  }

  return {
    // Live getters: the wrapper resolves the serving candidate when the
    // stream starts, which is after this object is returned. Callers that read
    // these after consuming the stream observe the model that actually served.
    get provider() {
      return serving.provider;
    },
    get model() {
      return serving.model;
    },
    stream: chunks(),
  };
}
