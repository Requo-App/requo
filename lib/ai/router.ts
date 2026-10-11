import "server-only";

import { generateText, streamText } from "ai";

import { registry, groq, cerebras, google, openrouter, mistral, cloudflare, nvidia } from "@/lib/ai/registry";
import {
  AiProviderError,
  getSanitizedErrorInfo,
  isModelNotFoundError,
  isOversizedError,
} from "@/lib/ai/errors";
import { getModelsForProvider } from "@/lib/ai/model-options";
import {
  NON_CHAT_MAX_ATTEMPTS,
  correctTokenUsage,
  markModelDead,
  recordModelTokenUsageDetailed,
  recordModelUsage,
  markModelExhausted,
  selectModels,
} from "@/lib/ai/capacity-selector";
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
  cerebras: 20_000,
  gemini: 20_000,
  mistral: 25_000,
  cloudflare: 25_000,
  nvidia: 30_000,
  openrouter: 30_000,
};

/** Ordered list of provider names that are configured. */
function getConfiguredProviderNames(): AiProviderName[] {
  const names: AiProviderName[] = [];
  if (groq) names.push("groq");
  if (cerebras) names.push("cerebras");
  if (google) names.push("gemini");
  if (mistral) names.push("mistral");
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
    throw new Error(
      "No AI providers are configured. Add at least one API key to enable the assistant.",
    );
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
        await safeSettle(
          recordModelTokenUsageDetailed(modelId, {
            inputTokens,
            outputTokens,
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
      lastError = error;
      const errorInfo = getSanitizedErrorInfo(error);
      const reason = `status=${errorInfo.statusCode ?? "N/A"} ${errorInfo.message}`.slice(0, 200);
      trail.push({ modelId, reason });

      console.warn(
        `[ai-router] Failed (advancing): model="${modelId}" status=${errorInfo.statusCode ?? "N/A"} retryable=${errorInfo.retryable} message="${errorInfo.message}"`,
      );

      if (isModelNotFoundError(error)) {
        await safeSettle(markModelDead(modelId));
        // Dead identifiers cost no attempt.
        continue;
      }
      attemptsUsed += 1;
      await safeSettle(markModelExhausted(modelId, error));

      if (isOversizedError(error)) {
        const failedContext = contextWindowOf(modelId);
        remaining = [
          ...remaining.filter((id) => contextWindowOf(id) > failedContext),
          ...remaining.filter((id) => contextWindowOf(id) <= failedContext),
        ];
      }

      if (error instanceof AiProviderError && error.retryAfterMs) {
        const waitMs = Math.min(error.retryAfterMs, MAX_RETRY_AFTER_MS);
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
 * Legacy provider-specific fallback (used when a specific provider is pinned).
 * Advances on every failure (including non-retryable) — only exhaustion fails.
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

  let lastError: unknown;
  const { system, messages } = buildMessages(request);

  for (const providerName of providers) {
    const models = getModelCandidates(request, providerName);
    const timeout = PROVIDER_TIMEOUTS[providerName];

    for (const model of models) {
      const modelId = getRegistryModelId(providerName, model);

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
        lastError = error;
        const errorInfo = getSanitizedErrorInfo(error);

        console.warn(
          `[ai-router] Failed (advancing): provider="${providerName}" model="${model}" status=${errorInfo.statusCode ?? "N/A"} retryable=${errorInfo.retryable}`,
        );

        if (isModelNotFoundError(error)) {
          await safeSettle(markModelDead(modelId));
          continue;
        }
        await safeSettle(markModelExhausted(modelId, error));
      }
    }
  }

  if (lastError instanceof AiProviderError) throw lastError;
  throw new Error(lastError instanceof Error ? lastError.message : "All AI providers failed.");
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
    throw new Error(
      "No AI providers are configured. Add at least one API key to enable the assistant.",
    );
  }

  let lastError: unknown;
  let attemptCount = 0;
  const { system, messages } = buildMessages(request);

  for (const modelId of modelIds) {
    const [providerPrefix, ...modelParts] = modelId.split(":");
    const providerName = (providerPrefix === "google" ? "gemini" : providerPrefix) as AiProviderName;
    const model = modelParts.join(":");
    const timeout = PROVIDER_TIMEOUTS[providerName] ?? 25_000;

    try {
      const result = streamText({
        model: registry.languageModel(modelId),
        system,
        messages,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        abortSignal: AbortSignal.timeout(timeout),
      });

      const textStream = result.textStream;

      await recordModelUsage(modelId);
      console.info(`[ai-router] Stream started: model="${modelId}"`);

      async function* chunks(): AsyncGenerator<AiStreamChunk> {
        for await (const chunk of textStream) {
          if (chunk) {
            yield { delta: chunk, finishReason: null };
          }
        }
        yield { delta: "", finishReason: "stop" };
      }

      return {
        provider: providerName,
        model,
        stream: chunks(),
      };
    } catch (error) {
      lastError = error;
      attemptCount += 1;
      const errorInfo = getSanitizedErrorInfo(error);

      console.warn(
        `[ai-router] Stream failed (advancing): model="${modelId}" status=${errorInfo.statusCode ?? "N/A"} retryable=${errorInfo.retryable}`,
      );

      if (isModelNotFoundError(error)) {
        await safeSettle(markModelDead(modelId));
        continue;
      }
      await safeSettle(markModelExhausted(modelId, error));

      if (attemptCount === 1 && options?.onFallback) {
        options.onFallback();
      }

      if (error instanceof AiProviderError && error.retryAfterMs) {
        const waitMs = Math.min(error.retryAfterMs, MAX_RETRY_AFTER_MS);
        await sleep(waitMs);
      }
    }
  }

  if (lastError instanceof AiProviderError) throw lastError;
  throw new Error(lastError instanceof Error ? lastError.message : "All AI providers failed.");
}

/**
 * Legacy provider-specific streaming fallback (pinned path).
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

  let lastError: unknown;
  let attemptCount = 0;
  const { system, messages } = buildMessages(request);

  for (const providerName of providers) {
    const models = getModelCandidates(request, providerName);
    const timeout = PROVIDER_TIMEOUTS[providerName];

    for (const model of models) {
      const modelId = getRegistryModelId(providerName, model);

      try {
        const result = streamText({
          model: registry.languageModel(modelId),
          system,
          messages,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          abortSignal: AbortSignal.timeout(timeout),
        });

        const textStream = result.textStream;

        await recordModelUsage(modelId);
        console.info(
          `[ai-router] Stream started: provider="${providerName}" model="${model}"`,
        );

        async function* chunks(): AsyncGenerator<AiStreamChunk> {
          for await (const chunk of textStream) {
            if (chunk) {
              yield { delta: chunk, finishReason: null };
            }
          }
          yield { delta: "", finishReason: "stop" };
        }

        return {
          provider: providerName,
          model,
          stream: chunks(),
        };
      } catch (error) {
        lastError = error;
        attemptCount += 1;
        const errorInfo = getSanitizedErrorInfo(error);

        console.warn(
          `[ai-router] Stream failed (advancing): provider="${providerName}" model="${model}" status=${errorInfo.statusCode ?? "N/A"} retryable=${errorInfo.retryable}`,
        );

        await safeSettle(markModelExhausted(modelId, error));

        if (attemptCount === 1 && options?.onFallback) {
          options.onFallback();
        }
      }
    }
  }

  if (lastError instanceof AiProviderError) throw lastError;
  throw new Error(lastError instanceof Error ? lastError.message : "All AI providers failed.");
}
