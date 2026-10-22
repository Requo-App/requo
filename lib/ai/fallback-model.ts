import "server-only";

import { wrapLanguageModel } from "ai";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from "@ai-sdk/provider";

import { registry } from "@/lib/ai/registry";
import { stripReasoningMiddleware } from "@/lib/ai/strip-reasoning-middleware";
import {
  isModelDead,
  markModelDead,
  markModelExhausted,
  recordModelTokenUsage,
  recordModelUsage,
} from "@/lib/ai/capacity-selector";
import { getCatalogEntry } from "@/lib/ai/catalog";
import {
  getSanitizedErrorInfo,
  isModelNotFoundError,
  isOversizedError,
  isRetryableError,
} from "@/lib/ai/errors";

// ---------------------------------------------------------------------------
// Fallback Language Model — cross-model resilience that preserves streaming
//
// AI SDK 6 has no cross-model fallback primitive, and `await result.warnings`
// is not usable as a readiness probe: it buffers the entire generation.
// This wrapper is the only seam that keeps streaming: `streamText` calls
// `doStream` once per step, so each step independently walks the ordered
// candidate list from `selectModels`.
//
// Contract:
// - Immediate failures (throw before any chunk, e.g. 429/401/400 from the
//   provider's failed-response handler) are caught and retried on the next
//   candidate.
// - A head `{type: "error"}` part means nothing reached the client yet, so it
//   is also treated as an immediate failure and retried. Mid-stream errors
//   (after real parts) are piped through — the client already has partial
//   output and a retry would duplicate it.
// - Non-retryable errors still advance to the next *provider*: a 400 one
//   provider rejects (e.g. Google's empty-part rejection) often succeeds
//   elsewhere. Attempts are bounded by `maxAttempts`.
// - A "model does not exist" failure (404 / model-not-found) is skipped
//   WITHOUT consuming an attempt: the candidate is logged, evicted with a
//   cooldown measured in hours, and the loop continues. Stale catalog entries
//   therefore cost nothing at runtime.
// - Oversized payloads (context-length / request-too-large) route to
//   shrink-or-escalate: remaining candidates are preferred by larger context
//   window rather than retried unchanged.
// - Every candidate is wrapped in `stripReasoningMiddleware`. Because any
//   candidate can serve any step, the prompt must stay portable: `streamText`
//   replays earlier steps' reasoning parts into later prompts, and the
//   OpenAI-compatible shape serializes those as `reasoning_content`, which
//   some OpenAI-compatible providers reject with a 400.
// - On success the serving model is attributed via `recordModelUsage` and
//   `recordModelTokenUsage`, and reported through `onModelSelected` so the
//   orchestrator can persist and log the model that actually served the step.
// ---------------------------------------------------------------------------

export type FallbackAttemptTrailEntry = {
  modelId: string;
  reason: string;
};

export type FallbackModelSelected = {
  modelId: `${string}:${string}`;
  provider: string;
  model: string;
};

export type FallbackModelOptions = {
  modelIds: `${string}:${string}`[];
  /**
   * Explicit attempt budget, passed from each orchestrator so how many
   * providers a turn will try is visible rather than inherited from a
   * default. Defaults to 5 for chat-shaped work.
   */
  maxAttempts?: number;
  /** Preflight token estimate, attributed to the model that serves. */
  estimatedTokens?: number;
  /** A fresh provider timeout is created for each candidate attempt. */
  getTimeoutMs?: (selected: FallbackModelSelected) => number;
  onModelSelected?: (selected: FallbackModelSelected) => void;
  onAttemptFailed?: (selected: FallbackModelSelected, error: unknown) => void;
};

function parseModelId(modelId: `${string}:${string}` | string): FallbackModelSelected {
  const colonIndex = modelId.indexOf(":");
  if (colonIndex < 0) {
    return {
      modelId: modelId as `${string}:${string}`,
      provider: modelId,
      model: modelId,
    };
  }
  return {
    modelId: modelId as `${string}:${string}`,
    provider: modelId.slice(0, colonIndex),
    model: modelId.slice(colonIndex + 1),
  };
}

function candidatesFor(
  modelIds: `${string}:${string}`[],
  maxAttempts: number,
  preferredModelId?: `${string}:${string}`,
): `${string}:${string}`[] {
  // maxAttempts bounds non-dead attempts; dead identifiers are filtered at
  // request time (they cost nothing) so the slice is only a soft cap. Return
  // a fresh list every call: the loop drains it with `shift()`, and the same
  // wrapper serves every step of a turn — returning the live `modelIds`
  // reference would leave later steps with an empty candidate list and fail
  // the turn with "All fallback models failed."
  if (maxAttempts <= 0) return [];
  if (!preferredModelId || !modelIds.includes(preferredModelId)) {
    return [...modelIds];
  }
  return [
    preferredModelId,
    ...modelIds.filter((modelId) => modelId !== preferredModelId),
  ];
}

function contextWindowOf(modelId: string): number {
  try {
    return getCatalogEntry(modelId)?.contextWindow ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Resolve a candidate into a call-ready model.
 *
 * The reasoning strip is applied here rather than in the registry so it
 * covers every candidate a turn may reach: a step that a reasoning-capable
 * provider served can be followed by a step served by one that rejects
 * `reasoning_content`, and the replayed prompt has to satisfy both.
 */
function candidateModel(candidate: `${string}:${string}`): LanguageModelV3 {
  return wrapLanguageModel({
    model: registry.languageModel(candidate),
    middleware: stripReasoningMiddleware,
  });
}

/** Prefer larger-context candidates after an oversized failure. */
function reorderForOversized(
  remaining: Array<`${string}:${string}`>,
  failedContext: number,
): Array<`${string}:${string}`> {
  return [...remaining].sort((a, b) => {
    const aLarger = contextWindowOf(a) > failedContext ? 0 : 1;
    const bLarger = contextWindowOf(b) > failedContext ? 0 : 1;
    if (aLarger !== bLarger) return aLarger - bLarger;
    return contextWindowOf(b) - contextWindowOf(a);
  });
}

async function attributeSuccess(
  modelId: string,
  estimatedTokens: number | undefined,
  selected: FallbackModelSelected,
  onModelSelected: FallbackModelOptions["onModelSelected"],
): Promise<void> {
  try {
    await recordModelUsage(modelId);
  } catch (error) {
    console.warn("[ai-fallback] Failed to record model usage:", error);
  }
  if (estimatedTokens !== undefined && estimatedTokens > 0) {
    try {
      await recordModelTokenUsage(modelId, estimatedTokens);
    } catch (error) {
      console.warn("[ai-fallback] Failed to record token usage:", error);
    }
  }
  onModelSelected?.(selected);
}

async function noteAttemptFailed(
  modelId: string,
  selected: FallbackModelSelected,
  error: unknown,
  onAttemptFailed: FallbackModelOptions["onAttemptFailed"],
): Promise<"dead" | "oversized" | "exhausted" | "other"> {
  const info = getSanitizedErrorInfo(error);
  console.warn(
    `[ai-fallback] Attempt failed: model="${modelId}" status=${info.statusCode ?? "N/A"} retryable=${info.retryable} message="${info.message}"`,
  );
  onAttemptFailed?.(selected, error);
  if (isModelNotFoundError(error)) {
    try {
      await markModelDead(modelId);
    } catch (markError) {
      console.warn("[ai-fallback] Failed to mark model dead:", markError);
    }
    return "dead";
  }
  if (isOversizedError(error)) {
    // Payload problem, not capacity — do not burn a minute cooldown.
    return "oversized";
  }
  if (isRetryableError(error)) {
    try {
      await markModelExhausted(modelId, error);
    } catch (markError) {
      console.warn("[ai-fallback] Failed to mark model exhausted:", markError);
    }
    return "exhausted";
  }
  // Non-retryable errors still advance (they often succeed elsewhere), but
  // without poisoning the capacity counters.
  return "other";
}

/**
 * Peek the head of a model stream. Buffers through the first non-`stream-start`
 * part (one part of buffering, streaming is otherwise preserved). When that
 * head is `{type: "error"}` nothing reached the client yet, so the caller
 * should treat it as an immediate failure and fall back.
 */
async function peekHead(
  result: LanguageModelV3StreamResult,
): Promise<{
  buffered: LanguageModelV3StreamPart[];
  head: LanguageModelV3StreamPart | undefined;
  reader: ReadableStreamDefaultReader<LanguageModelV3StreamPart>;
  doneEarly: boolean;
}> {
  const reader = result.stream.getReader();
  const buffered: LanguageModelV3StreamPart[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return { buffered, head: undefined, reader, doneEarly: true };
      }
      buffered.push(value);
      if (value.type !== "stream-start") {
        return { buffered, head: value, reader, doneEarly: false };
      }
    }
  } catch (error) {
    // A read throw before any content is an immediate failure. Release the
    // lock before propagating so the next candidate starts clean.
    try {
      reader.releaseLock();
    } catch {
      // Ignore — the stream is already errored.
    }
    throw error;
  }
}

function reemitWithHead(
  buffered: LanguageModelV3StreamPart[],
  reader: ReadableStreamDefaultReader<LanguageModelV3StreamPart>,
): ReadableStream<LanguageModelV3StreamPart> {
  return new ReadableStream<LanguageModelV3StreamPart>({
    async start(controller) {
      try {
        for (const part of buffered) {
          controller.enqueue(part);
        }
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Ignore — the reader may already be released on error paths.
        }
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } catch {
        // Ignore — cancelling an already-closed reader is a no-op.
      }
    },
  });
}

export function createFallbackLanguageModel(
  opts: FallbackModelOptions,
): LanguageModelV3 {
  const { modelIds, onModelSelected, onAttemptFailed } = opts;
  const maxAttempts = opts.maxAttempts ?? 5;
  const estimatedTokens = opts.estimatedTokens;
  // `streamText` calls the same model once per tool step. Once a fallback
  // candidate has served a step successfully, try it first for the remaining
  // steps in that turn instead of repeatedly burning the attempt budget on
  // providers that already failed moments earlier.
  let preferredModelId: `${string}:${string}` | undefined;

  function attemptOptions(
    options: LanguageModelV3CallOptions,
    selected: FallbackModelSelected,
  ): LanguageModelV3CallOptions {
    if (!opts.getTimeoutMs) return options;
    const timeoutSignal = AbortSignal.timeout(opts.getTimeoutMs(selected));
    return {
      ...options,
      abortSignal: options.abortSignal
        ? AbortSignal.any([options.abortSignal, timeoutSignal])
        : timeoutSignal,
    };
  }

  if (modelIds.length === 0) {
    throw new Error("createFallbackLanguageModel requires at least one modelId");
  }

  return {
    specificationVersion: "v3",
    provider: "fallback",
    modelId: modelIds[0],
    supportedUrls: {},

    async doGenerate(
      options: LanguageModelV3CallOptions,
    ): Promise<LanguageModelV3GenerateResult> {
      let remaining = candidatesFor(modelIds, maxAttempts, preferredModelId);
      let lastError: unknown = null;
      let attemptsUsed = 0;

      while (remaining.length > 0 && attemptsUsed < maxAttempts) {
        options.abortSignal?.throwIfAborted();
        const candidate = remaining.shift() as `${string}:${string}`;
        const selected = parseModelId(candidate);
        try {
          if (await isModelDead(candidate)) {
            console.warn(
              `[ai-fallback] Skipping dead model (no attempt consumed): model="${candidate}"`,
            );
            onAttemptFailed?.(selected, new Error("model_not_found (cached dead)"));
            continue;
          }
        } catch {
          // Dead-check failure must never block a turn.
        }
        try {
          const model = candidateModel(candidate);
          const result = await model.doGenerate(attemptOptions(options, selected));
          await attributeSuccess(
            candidate,
            estimatedTokens,
            selected,
            onModelSelected,
          );
          preferredModelId = candidate;
          return result;
        } catch (error) {
          options.abortSignal?.throwIfAborted();
          lastError = error;
          const kind = await noteAttemptFailed(
            candidate,
            selected,
            error,
            onAttemptFailed,
          );
          if (kind === "dead") {
            // Stale identifier costs nothing — do not consume the budget.
            continue;
          }
          attemptsUsed += 1;
          if (kind === "oversized") {
            remaining = reorderForOversized(
              remaining,
              contextWindowOf(candidate),
            );
          }
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error("All fallback models failed.");
    },

    async doStream(
      options: LanguageModelV3CallOptions,
    ): Promise<LanguageModelV3StreamResult> {
      let remaining = candidatesFor(modelIds, maxAttempts, preferredModelId);
      let lastError: unknown = null;
      let attemptsUsed = 0;

      while (remaining.length > 0 && attemptsUsed < maxAttempts) {
        options.abortSignal?.throwIfAborted();
        const candidate = remaining.shift() as `${string}:${string}`;
        const selected = parseModelId(candidate);
        try {
          if (await isModelDead(candidate)) {
            console.warn(
              `[ai-fallback] Skipping dead model (no attempt consumed): model="${candidate}"`,
            );
            onAttemptFailed?.(selected, new Error("model_not_found (cached dead)"));
            continue;
          }
        } catch {
          // Dead-check failure must never block a turn.
        }
        try {
          const model = candidateModel(candidate);
          const result = await model.doStream(attemptOptions(options, selected));
          const { buffered, head, reader, doneEarly } =
            await peekHead(result);

          if (head && head.type === "error") {
            const streamError = (head as { error?: unknown }).error ?? head;
            try {
              await reader.cancel();
            } catch {
              // Ignore — the stream is already errored.
            }
            throw streamError;
          }

          // Empty-but-clean streams (done before any content) are returned
          // as-is: the orchestrator treats zero-text turns as failures and
          // skips persisting them. Falling back here would hide that signal.
          const stream = doneEarly
            ? new ReadableStream<LanguageModelV3StreamPart>({
                start(controller) {
                  for (const part of buffered) controller.enqueue(part);
                  controller.close();
                },
              })
            : reemitWithHead(buffered, reader);

          await attributeSuccess(
            candidate,
            estimatedTokens,
            selected,
            onModelSelected,
          );
          preferredModelId = candidate;
          return {
            stream,
            ...(result.request ? { request: result.request } : {}),
            ...(result.response ? { response: result.response } : {}),
          };
        } catch (error) {
          options.abortSignal?.throwIfAborted();
          lastError = error;
          const kind = await noteAttemptFailed(
            candidate,
            selected,
            error,
            onAttemptFailed,
          );
          if (kind === "dead") {
            continue;
          }
          attemptsUsed += 1;
          if (kind === "oversized") {
            remaining = reorderForOversized(
              remaining,
              contextWindowOf(candidate),
            );
          }
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error("All fallback models failed.");
    },
  };
}
