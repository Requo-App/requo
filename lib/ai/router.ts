import "server-only";

import { generateText, streamText } from "ai";

import { registry, groq, google, openrouter, cloudflare, nvidia, isAiConfigured } from "@/lib/ai/registry";
import {
  AiProviderError,
  getSanitizedErrorInfo,
  isModelNotFoundError,
  isOversizedError,
  wrapProviderError,
} from "@/lib/ai/errors";
import { getModelsForProvider } from "@/lib/ai/model-options";
import {
  NON_CHAT_MAX_ATTEMPTS,
  CHAT_MAX_ATTEMPTS,
  correctTokenUsage,
  markModelDead,
  recordModelTokenUsageDetailed,
  recordModelUsage,
  markModelExhausted,
  getModelQuotaState,
  selectModels,
} from "@/lib/ai/capacity-selector";
import { createFallbackLanguageModel } from "@/lib/ai/fallback-model";
import { getCatalogEntry } from "@/lib/ai/catalog";
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
// chain that advances through every candidate. A non-retryable error advances
// to the next provider — only an exhausted candidate list is a failure.
// A 404 / model-not-found is skipped (and remembered as dead for hours).
// Oversized payloads route to a higher-context candidate, not plain rotation.
// ---------------------------------------------------------------------------

const MAX_RETRY_AFTER_MS = 5_000;

const PROVIDER_TIMEOUTS: Record<AiProviderName, number> = {
  groq: 15_000,
  gemini: 20_000,
  cloudflare: 25_000,
  nvidia: 25_000,
  openrouter: 30_000,
};

/** Ordered list of provider names that are configured. */
function getConfiguredProviderNames(): AiProviderName[] {
  const names: AiProviderName[] = [];
  if (groq) names.push("groq");
  if (google) names.push("gemini");
  if (cloudflare) names.push("cloudflare");
  if (nvidia) names.push("nvidia");
  if (openrouter) names.push("openrouter");
  return names;
}

function getProviderCandidates(
  requestedProvider: AiProviderName | undefined,
): AiProviderName[] {
  const all = getConfiguredProviderNames();
  return requestedProvider
    ? all.filter((p) => p === requestedProvider)
    : all;
}

function getModelCandidates(
  request: AiCompletionRequest,
  providerName: AiProviderName,
): string[] {
  if (request.provider === providerName && request.model.trim()) {
    return [request.model];
  }
  return getModelsForProvider(providerName, request.qualityTier ?? "balanced");
}

/** Get the registry model ID string for a provider + model combination. */
function getRegistryModelId(providerName: AiProviderName, model: string): `${string}:${string}` {
  const registryPrefix = providerName === "gemini" ? "google" : providerName;
  return `${registryPrefix}:${model}` as `${string}:${string}`;
}

/**
 * The free-tier allowlist gate for pinned/manual model overrides.
 *
 * A request that names a provider and model bypasses normal profile
 * selection, so this is the only place that can stop a stale setting,
 * hand-edited payload, or removed model from reaching a paid endpoint.
 * Anything absent from `lib/ai/catalog.ts` fails before a provider call.
 */
async function assertPinnedModelAllowed(
  modelId: `${string}:${string}`,
  estimatedTokens: number,
): Promise<void> {
  const entry = getCatalogEntry(modelId);
  if (!entry) {
    throw new Error(
      `The selected AI model "${modelId}" is not in the free-tier catalog. Choose an auto-routed model instead.`,
    );
  }

  const quota = await getModelQuotaState(modelId, estimatedTokens);
  if (quota === "dead") {
    throw new Error(
      `The selected AI model "${modelId}" is unavailable. Choose an auto-routed model instead.`,
    );
  }
  if (quota === "exhausted") {
    throw new Error(
      `The free-tier quota for "${modelId}" is exhausted. Wait for it to reset or choose an auto-routed model.`,
    );
  }
}

/** The registry prefixes `google` for Gemini; the rest of the code uses `gemini`. */
function normalizeProviderName(providerPrefix: string): AiProviderName {
  return (providerPrefix === "google" ? "gemini" : providerPrefix) as AiProviderName;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Settle a bookkeeping write without failing the turn (mock-safe). */
async function safeSettle(value: unknown): Promise<void> {
  try {
    await value;
  } catch {
    // Capacity bookkeeping must never fail a turn.
  }
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
  return estimateTokens(text) + (request.maxOutputTokens ?? 0) + 500;
}

/**
 * Distinguish "nothing is configured" from "everything free is used up".
 * Both return no candidates, but only one is fixed by waiting.
 */
function noModelsAvailableError(): Error {
  if (isAiConfigured()) {
    return new Error(
      "No free-tier AI capacity is available for this request. Every configured free quota is exhausted or cooling down; wait for the quota to reset or configure another free provider.",
    );
  }
  return new Error(
    "No AI providers are configured. Add at least one free-tier API key to enable the assistant.",
  );
}

function contextWindowOf(modelId: string): number {
  try {
    return getCatalogEntry(modelId)?.contextWindow ?? 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// generateWithFallback
// ---------------------------------------------------------------------------

/**
 * Generate a completion using profile-driven selection + fallback chain.
 *
 * Strategy:
 * 1. If a specific provider/model is requested, try only that (pinned).
 * 2. Otherwise, select via routing profile (explicit `routingProfile` wins;
 *    legacy `qualityTier` maps onto a profile).
 * 3. Try each candidate in order. EVERY failure advances to the next
 *    candidate — including failures previously classified as non-retryable.
 *    A 404 marks the identifier dead for hours. Oversized payloads prefer
 *    larger-context candidates next.
 * 4. If ALL candidates fail, throw with an attempt trail.
 */
export async function generateWithFallback(
  request: AiCompletionRequest,
): Promise<AiCompletionResponse> {
  if (request.provider && request.model.trim()) {
    return generateWithProviderFallback(request);
  }

  const profile = request.routingProfile ?? profileForLegacyTier(request.qualityTier);
  const estimatedTokens =
    request.estimatedTokens ?? estimateRequestTokens(request);
  const modelIds = await selectModels({ profile, estimatedTokens });

  if (modelIds.length === 0) {
    throw noModelsAvailableError();
  }

  let lastError: unknown;
  const { system, messages } = buildMessages(request);
  const trail: Array<{ modelId: string; reason: string }> = [];
  const maxAttempts = Math.min(NON_CHAT_MAX_ATTEMPTS, modelIds.length);
  let attemptsUsed = 0;
  let remaining = [...modelIds];

  while (remaining.length > 0 && attemptsUsed < maxAttempts) {
    const modelId = remaining.shift() as `${string}:${string}`;
    const [providerPrefix, ...modelParts] = modelId.split(":");
    const providerName = (providerPrefix === "google" ? "gemini" : providerPrefix) as AiProviderName;
    const model = modelParts.join(":");
    const timeout = PROVIDER_TIMEOUTS[providerName] ?? 25_000;

    try {
      const result = await generateText({
        model: registry.languageModel(modelId),
        system,
        messages,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        abortSignal: AbortSignal.timeout(timeout),
      });

      await recordModelUsage(modelId);
      const inputTokens = result.usage?.inputTokens ?? 0;
      const outputTokens = result.usage?.outputTokens ?? 0;
      if (inputTokens > 0 || outputTokens > 0) {
        // Charge the estimate first and correct it with the real usage, the
        // same sequence the chat path uses. Recording the actual and then
        // applying the correction on top counted the correction twice and
        // drove the per-minute counter negative, which made a saturated
        // provider look idle to the capacity selector.
        await safeSettle(
          recordModelTokenUsageDetailed(modelId, {
            inputTokens: estimatedTokens,
            outputTokens: 0,
          }),
        );
        await safeSettle(
          correctTokenUsage(modelId, estimatedTokens, {
            inputTokens,
            outputTokens,
          }),
        );
      }
      if (!result.text?.trim()) {
        console.error(
          `[ai-router] Zero-text completion (logged as error): model="${modelId}"`,
        );
      }
      console.info(
        `[ai-router] Completion succeeded: model="${modelId}"`,
      );

      return {
        provider: providerName,
        model,
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
      // Wrap the raw provider error so the retry-after back-off and the
      // typed error the callers map to a user-facing message both work. The
      // wrapper keeps the original message and status, so the not-found and
      // oversized checks below still classify it correctly.
      const providerError = wrapProviderError(providerName, error);
      lastError = providerError;
      const errorInfo = getSanitizedErrorInfo(providerError);
      const reason = `status=${errorInfo.statusCode ?? "N/A"} ${errorInfo.message}`.slice(0, 200);
      trail.push({ modelId, reason });

      console.warn(
        `[ai-router] Failed (advancing): model="${modelId}" status=${errorInfo.statusCode ?? "N/A"} retryable=${errorInfo.retryable} message="${errorInfo.message}"`,
      );

      if (isModelNotFoundError(providerError)) {
        await safeSettle(markModelDead(modelId));
        // Dead identifiers cost no attempt.
        continue;
      }
      attemptsUsed += 1;
      await safeSettle(markModelExhausted(modelId, providerError));

      if (isOversizedError(providerError)) {
        const failedContext = contextWindowOf(modelId);
        remaining = [
          ...remaining.filter((id) => contextWindowOf(id) > failedContext),
          ...remaining.filter((id) => contextWindowOf(id) <= failedContext),
        ];
      }

      if (providerError.retryAfterMs) {
        const waitMs = Math.min(providerError.retryAfterMs, MAX_RETRY_AFTER_MS);
        await sleep(waitMs);
      }
    }
  }

  const trailText = trail.map((t) => `${t.modelId} (${t.reason})`).join("; ");
  console.error(`[ai-router] All candidates failed: ${trailText}`);
  if (lastError instanceof AiProviderError) throw lastError;
  throw new Error(
    lastError instanceof Error
      ? `${lastError.message} [tried: ${trailText}]`
      : `All AI providers failed. [tried: ${trailText}]`,
  );
}

/**
 * Pinned-model path (a specific provider + model was requested).
 *
 * The model must be in the free-tier catalog and under its modelled quota
 * before any provider call. There is deliberately no cross-model fallback:
 * a manual override that is unavailable fails safely rather than silently
 * spending a different quota.
 */
async function generateWithProviderFallback(
  request: AiCompletionRequest,
): Promise<AiCompletionResponse> {
  const providers = getProviderCandidates(request.provider);

  if (providers.length === 0) {
    throw new Error(
      `The selected AI provider "${request.provider}" is not configured.`,
    );
  }

  const estimatedTokens =
    request.estimatedTokens ?? estimateRequestTokens(request);
  let lastError: unknown;
  const { system, messages } = buildMessages(request);

  for (const providerName of providers) {
    const models = getModelCandidates(request, providerName);
    const timeout = PROVIDER_TIMEOUTS[providerName];

    for (const model of models) {
      const modelId = getRegistryModelId(providerName, model);
      await assertPinnedModelAllowed(modelId, estimatedTokens);

      try {
        const result = await generateText({
          model: registry.languageModel(modelId),
          system,
          messages,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          abortSignal: AbortSignal.timeout(timeout),
        });

        await recordModelUsage(modelId);
        const inputTokens = result.usage?.inputTokens ?? 0;
        const outputTokens = result.usage?.outputTokens ?? 0;
        if (inputTokens > 0 || outputTokens > 0) {
          // Charge the preflight estimate first, then post the difference so
          // the counters converge on real usage. Same sequence as the
          // profile-driven and chat paths.
          await safeSettle(
            recordModelTokenUsageDetailed(modelId, {
              inputTokens: estimatedTokens,
              outputTokens: 0,
            }),
          );
          await safeSettle(
            correctTokenUsage(modelId, estimatedTokens, {
              inputTokens,
              outputTokens,
            }),
          );
        }
        console.info(
          `[ai-router] Completion succeeded: provider="${providerName}" model="${model}"`,
        );

        return {
          provider: providerName,
          model,
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
        // Wrap so status/retry classification is consistent with the
        // profile path, while preserving the original message.
        const providerError = wrapProviderError(providerName, error);
        lastError = providerError;
        const errorInfo = getSanitizedErrorInfo(providerError);

        console.warn(
          `[ai-router] Failed (pinned): provider="${providerName}" model="${model}" status=${errorInfo.statusCode ?? "N/A"} retryable=${errorInfo.retryable}`,
        );

        if (isModelNotFoundError(providerError)) {
          await safeSettle(markModelDead(modelId));
          continue;
        }
        await safeSettle(markModelExhausted(modelId, providerError));
      }
    }
  }

  if (lastError instanceof AiProviderError) throw lastError;
  throw new Error(lastError instanceof Error ? lastError.message : "The selected AI model failed.");
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
  if (request.provider && request.model.trim()) {
    return streamWithProviderFallback(request, options);
  }

  const profile = request.routingProfile ?? profileForLegacyTier(request.qualityTier);
  const estimatedTokens =
    request.estimatedTokens ?? estimateRequestTokens(request);
  const modelIds = await selectModels({ profile, estimatedTokens });

  if (modelIds.length === 0) {
    throw noModelsAvailableError();
  }

  const { system, messages } = buildMessages(request);
  let serving = parseServingModel(modelIds[0]);
  let servingModelId = modelIds[0];
  let served = false;
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
    getTimeoutMs: ({ provider }) => PROVIDER_TIMEOUTS[normalizeProviderName(provider)] ?? 25_000,
    onModelSelected: (selected) => {
      served = true;
      servingModelId = selected.modelId;
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

  let streamFailure: { error: unknown } | undefined;
  const result = streamText({
    model: fallbackModel,
    system,
    messages,
    temperature: request.temperature,
    maxOutputTokens: request.maxOutputTokens,
    abortSignal: request.abortSignal,
    onError: ({ error }) => { streamFailure = { error }; },
  });

  async function* chunks(): AsyncGenerator<AiStreamChunk> {
    try {
      for await (const chunk of result.textStream) {
        if (chunk) {
          yield { delta: chunk, finishReason: null };
        }
      }
      request.abortSignal?.throwIfAborted();
      if (streamFailure) throw streamFailure.error;
    } finally {
      // The real token spend is only known once the stream ends. Correct the
      // estimate charged when the model was selected so the counters
      // converge on the actual spend.
      const usage = await Promise.resolve(result.usage).catch(() => null);
      if (served && usage) {
        await safeSettle(
          correctTokenUsage(servingModelId, estimatedTokens, {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
          }),
        );
      }
    }
    yield { delta: "", finishReason: "stop" };
  }

  return {
    provider: serving.provider as AiProviderName,
    model: serving.model,
    stream: chunks(),
  };
}

/**
 * Pinned-model streaming path.
 *
 * Like the non-streaming pinned path, the model must be in the free-tier
 * catalog and under its modelled quota before a provider call. Real usage is
 * corrected after the stream settles, matching the profile path.
 */
async function streamWithProviderFallback(
  request: AiCompletionRequest,
  options?: { onFallback?: () => void },
): Promise<AiStreamResponse> {
  const providers = getProviderCandidates(request.provider);

  if (providers.length === 0) {
    throw new Error(
      `The selected AI provider "${request.provider}" is not configured.`,
    );
  }

  const estimatedTokens =
    request.estimatedTokens ?? estimateRequestTokens(request);
  const { system, messages } = buildMessages(request);
  let fallbackReported = false;

  for (const providerName of providers) {
    const models = getModelCandidates(request, providerName);

    for (const model of models) {
      const modelId = getRegistryModelId(providerName, model);
      await assertPinnedModelAllowed(modelId, estimatedTokens);

      let served = false;
      // The fallback wrapper is what makes streaming work: `streamText` is
      // synchronous and performs the provider call lazily, so only a wrapper
      // that resolves the candidate inside `doStream` can observe and
      // recover from a provider failure.
      const fallbackModel = createFallbackLanguageModel({
        modelIds: [modelId],
        maxAttempts: 1,
        getTimeoutMs: ({ provider }) => PROVIDER_TIMEOUTS[normalizeProviderName(provider)] ?? 25_000,
        estimatedTokens,
        onModelSelected: () => {
          served = true;
        },
        onAttemptFailed: () => {
          if (!fallbackReported) {
            fallbackReported = true;
            options?.onFallback?.();
          }
        },
      });

      let streamFailure: { error: unknown } | undefined;
      const result = streamText({
        model: fallbackModel,
        system,
        messages,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        abortSignal: request.abortSignal,
        onError: ({ error }) => { streamFailure = { error }; },
      });

      async function* chunks(): AsyncGenerator<AiStreamChunk> {
        try {
          for await (const chunk of result.textStream) {
            if (chunk) {
              yield { delta: chunk, finishReason: null };
            }
          }
          request.abortSignal?.throwIfAborted();
          if (streamFailure) throw streamFailure.error;
        } finally {
          // The wrapper charged the preflight estimate when the model was
          // selected. Correct it with the real spend once the stream ends —
          // but never when no model actually served, or the correction would
          // subtract an estimate that was never charged.
          const usage = await Promise.resolve(result.usage).catch(() => null);
          if (served && usage) {
            await safeSettle(
              correctTokenUsage(modelId, estimatedTokens, {
                inputTokens: usage.inputTokens ?? 0,
                outputTokens: usage.outputTokens ?? 0,
              }),
            );
          }
        }
        yield { delta: "", finishReason: "stop" };
      }

      return {
        provider: providerName,
        model,
        stream: chunks(),
      };
    }
  }

  throw new Error("The selected AI model failed.");
}
