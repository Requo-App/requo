import "server-only";

import { wrapLanguageModel } from "ai";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";

import { registry } from "@/lib/ai/registry";
import { stripReasoningMiddleware } from "@/lib/ai/strip-reasoning-middleware";
import {
  isModelDead,
  markModelDead,
  markModelExhausted,
  recordModelFailure,
  recordModelSuccess,
  reserveModelCapacity,
  type ModelCapacityReservation,
} from "@/lib/ai/capacity-selector";
import { getCatalogEntry } from "@/lib/ai/catalog";
import {
  classifyProviderFailure,
  getSanitizedErrorInfo,
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
// - Every dispatch reserves its request and token capacity atomically before
//   the provider call. A success settles to real usage; a refused request
//   releases the token hold while keeping the request counted; a timeout keeps
//   the conservative estimate. The serving model is reported through
//   `onModelSelected` so the orchestrator can persist and log it.
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
  /** Preflight token estimate, reserved before each dispatch. */
  estimatedTokens?: number;
  /** A fresh provider timeout is created for each candidate attempt. */
  getTimeoutMs?: (selected: FallbackModelSelected) => number;
  /**
   * End-to-end budget for one model step, including stream consumption.
   * The router supplies its own turn signal for its streaming path; the chat
   * wrapper uses this to bound each tool step.
   */
  deadlineMs?: number;
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

type AttemptOutcome = {
  advance: boolean;
  countsAttempt: boolean;
  oversized: boolean;
  dead: boolean;
  /**
   * The failure was an account-wide auth rejection. Every model behind that
   * credential will fail the same way, so the chain skips the rest of them.
   */
  providerCooled: boolean;
};

async function safeBookkeeping(value: Promise<unknown>): Promise<void> {
  try {
    await value;
  } catch (error) {
    console.warn("[ai-fallback] Capacity bookkeeping failed:", error);
  }
}

function usageFromProvider(
  usage: LanguageModelV3Usage | undefined,
): { inputTokens: number; outputTokens: number } | undefined {
  if (!usage) return undefined;
  const input = usage.inputTokens?.total;
  const output = usage.outputTokens?.total;
  if (typeof input !== "number" && typeof output !== "number") {
    return undefined;
  }
  return {
    inputTokens: typeof input === "number" ? Math.max(0, input) : 0,
    outputTokens: typeof output === "number" ? Math.max(0, output) : 0,
  };
}

async function noteAttemptFailed(
  modelId: `${string}:${string}`,
  selected: FallbackModelSelected,
  error: unknown,
  reservation: ModelCapacityReservation,
  onAttemptFailed: FallbackModelOptions["onAttemptFailed"],
  turnAborted: boolean,
): Promise<AttemptOutcome> {
  const info = getSanitizedErrorInfo(error);
  const classification = classifyProviderFailure(error, { turnAborted });
  console.warn(
    `[ai-fallback] Attempt failed: model="${modelId}" kind=${classification.kind} status=${info.statusCode ?? "N/A"} retryable=${info.retryable} message="${info.message}"`,
  );
  onAttemptFailed?.(selected, error);

  if (classification.kind !== "cancelled") {
    void recordModelFailure(modelId, classification.kind).catch(() => {});
  }

  try {
    if (classification.markModelDead) {
      await markModelDead(modelId);
      await reservation.rollback();
    } else if (classification.keepTokenEstimate) {
      // The provider may already have processed the request (timeout, 5xx,
      // network loss): keep the conservative token hold.
      await reservation.settle();
    } else {
      // Explicit refusal before generation: the request still counts, but the
      // token hold is released for another attempt.
      await reservation.releaseTokens();
    }
  } catch (markError) {
    console.warn("[ai-fallback] Failed to settle reservation:", markError);
  }

  if (classification.cooldown !== "none") {
    try {
      await markModelExhausted(modelId, error, { turnAborted });
    } catch (markError) {
      console.warn("[ai-fallback] Failed to mark model exhausted:", markError);
    }
  }

  return {
    advance: classification.advance,
    countsAttempt: classification.countsAttempt,
    oversized: classification.kind === "oversized",
    dead: classification.markModelDead,
    providerCooled: classification.cooldown === "provider",
  };
}

/**
 * Observe the provider stream so the reservation settles against real usage,
 * not the estimate. The stream itself is passed through unchanged: tool-call,
 * text, reasoning, and error parts keep their order.
 */
function observeReservationStream(
  stream: ReadableStream<LanguageModelV3StreamPart>,
  modelId: `${string}:${string}`,
  reservation: ModelCapacityReservation,
  startedAt: number,
  onStreamFailure: (() => void) | undefined,
  isTurnAborted: () => boolean,
): ReadableStream<LanguageModelV3StreamPart> {
  const reader = stream.getReader();
  let finished = false;
  let settled = false;
  let failureNoted = false;

  const settleOnce = async (
    usage?: { inputTokens: number; outputTokens: number },
  ) => {
    if (settled) return;
    settled = true;
    await safeBookkeeping(
      usage ? reservation.settle(usage) : reservation.settle(),
    );
  };

  const noteFailure = (error: unknown, turnAborted: boolean) => {
    if (failureNoted) return;
    failureNoted = true;
    // A mid-stream timeout is a provider failure; the turn's own abort is not.
    const kind = classifyProviderFailure(error, { turnAborted }).kind;
    if (kind === "cancelled") return;
    onStreamFailure?.();
    void recordModelFailure(modelId, kind).catch(() => {});
  };

  const releaseReader = () => {
    try {
      reader.releaseLock();
    } catch {
      // Ignore — the reader may already be released on error paths.
    }
  };

  // Pull-based passthrough: the observer only reads when the consumer asks for
  // the next part, so a slow consumer applies backpressure to the provider
  // stream instead of the observer draining it eagerly.
  return new ReadableStream<LanguageModelV3StreamPart>({
    async pull(controller) {
      if (finished) return;

      try {
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          // A stream that closes without a finish part has unknown usage.
          // Keeping the estimate is the conservative choice.
          await settleOnce();
          releaseReader();
          controller.close();
          return;
        }

        if (value.type === "finish") {
          await settleOnce(usageFromProvider(value.usage));
          if (!failureNoted) {
            void recordModelSuccess(modelId, Date.now() - startedAt).catch(
              () => {},
            );
          }
        } else if (value.type === "error") {
          await settleOnce();
          noteFailure(value.error, isTurnAborted());
        }

        controller.enqueue(value);
      } catch (error) {
        // A consumer cancel closes this stream first; the failing enqueue is
        // not a provider failure and must not be recorded as one.
        const wasCancelled = finished;
        finished = true;
        await settleOnce();
        if (!wasCancelled) noteFailure(error, isTurnAborted());
        try {
          controller.error(error);
        } catch {
          // Ignore — the consumer may already have cancelled the stream.
        }
        releaseReader();
      }
    },
    async cancel(reason) {
      finished = true;
      // Caller walked away mid-stream: the request still counts, and the
      // provider may already have spent the token hold. Keep the estimate.
      await settleOnce();
      try {
        await reader.cancel(reason);
      } catch {
        // Ignore — cancelling an already-closed reader is a no-op.
      }
      releaseReader();
    },
  });
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

  function turnSignalFor(
    options: LanguageModelV3CallOptions,
  ): AbortSignal | undefined {
    if (!opts.deadlineMs || opts.deadlineMs <= 0) {
      return options.abortSignal;
    }
    const deadline = AbortSignal.timeout(opts.deadlineMs);
    return options.abortSignal
      ? AbortSignal.any([options.abortSignal, deadline])
      : deadline;
  }

  function attemptOptions(
    options: LanguageModelV3CallOptions,
    selected: FallbackModelSelected,
    turnSignal: AbortSignal | undefined,
  ): LanguageModelV3CallOptions {
    const timeoutSignal = opts.getTimeoutMs
      ? AbortSignal.timeout(opts.getTimeoutMs(selected))
      : undefined;
    const signals = [turnSignal, timeoutSignal].filter(
      (signal): signal is AbortSignal => Boolean(signal),
    );
    if (signals.length === 0) return options;
    return {
      ...options,
      abortSignal:
        signals.length === 1 ? signals[0] : AbortSignal.any(signals),
    };
  }

  async function reserveCandidate(
    candidate: `${string}:${string}`,
  ): Promise<ModelCapacityReservation | null> {
    try {
      return await reserveModelCapacity(candidate, estimatedTokens ?? 0);
    } catch (error) {
      console.warn("[ai-fallback] Capacity reservation failed:", error);
      return null;
    }
  }

  // Providers whose credentials failed earlier in this wrapper's lifetime.
  // The router's Redis cooldown already filters chain construction, but a
  // chain that was built before the failure (and every later tool step that
  // reuses it) would otherwise spend all remaining attempts on the same bad
  // key. Skipping is free: it consumes no attempt budget.
  const coolingProviders = new Set<string>();

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
      const turnSignal = turnSignalFor(options);
      let remaining = candidatesFor(modelIds, maxAttempts, preferredModelId);
      let lastError: unknown = null;
      let attemptsUsed = 0;

      while (remaining.length > 0 && attemptsUsed < maxAttempts) {
        turnSignal?.throwIfAborted();
        const candidate = remaining.shift() as `${string}:${string}`;
        const selected = parseModelId(candidate);
        if (coolingProviders.has(selected.provider)) {
          console.warn(
            `[ai-fallback] Skipping model on a cooling provider (no attempt consumed): model="${candidate}"`,
          );
          onAttemptFailed?.(selected, new Error("provider auth cooldown"));
          continue;
        }
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

        const reservation = await reserveCandidate(candidate);
        if (!reservation) {
          const refusal = new Error(
            `No capacity available for ${candidate} (reserved by another request).`,
          );
          lastError = refusal;
          // The turn is served by a later candidate, but the attempt trail
          // should record why this one was skipped.
          onAttemptFailed?.(selected, refusal);
          continue;
        }

        const startedAt = Date.now();
        try {
          const model = candidateModel(candidate);
          const result = await model.doGenerate(
            attemptOptions(options, selected, turnSignal),
          );
          await safeBookkeeping(
            reservation.settle(usageFromProvider(result.usage)),
          );
          void recordModelSuccess(candidate, Date.now() - startedAt).catch(
            () => {},
          );
          onModelSelected?.(selected);
          preferredModelId = candidate;
          return result;
        } catch (error) {
          if (turnSignal?.aborted) {
            // Caller cancellation or the turn deadline: stop the chain. The
            // request was dispatched, so keep the conservative token hold.
            await safeBookkeeping(reservation.settle());
            throw error;
          }
          lastError = error;
          const outcome = await noteAttemptFailed(
            candidate,
            selected,
            error,
            reservation,
            onAttemptFailed,
            turnSignal?.aborted ?? false,
          );
          if (!outcome.advance) throw error;
          if (outcome.dead) {
            // Stale identifier costs nothing — do not consume the budget.
            continue;
          }
          if (outcome.providerCooled) {
            coolingProviders.add(selected.provider);
            remaining = remaining.filter(
              (id) => parseModelId(id).provider !== selected.provider,
            );
          }
          if (outcome.countsAttempt) attemptsUsed += 1;
          if (outcome.oversized) {
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
      const turnSignal = turnSignalFor(options);
      let remaining = candidatesFor(modelIds, maxAttempts, preferredModelId);
      let lastError: unknown = null;
      let attemptsUsed = 0;

      while (remaining.length > 0 && attemptsUsed < maxAttempts) {
        turnSignal?.throwIfAborted();
        const candidate = remaining.shift() as `${string}:${string}`;
        const selected = parseModelId(candidate);
        if (coolingProviders.has(selected.provider)) {
          console.warn(
            `[ai-fallback] Skipping model on a cooling provider (no attempt consumed): model="${candidate}"`,
          );
          onAttemptFailed?.(selected, new Error("provider auth cooldown"));
          continue;
        }
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

        const reservation = await reserveCandidate(candidate);
        if (!reservation) {
          const refusal = new Error(
            `No capacity available for ${candidate} (reserved by another request).`,
          );
          lastError = refusal;
          // The turn is served by a later candidate, but the attempt trail
          // should record why this one was skipped.
          onAttemptFailed?.(selected, refusal);
          continue;
        }

        const startedAt = Date.now();
        try {
          const model = candidateModel(candidate);
          const result = await model.doStream(
            attemptOptions(options, selected, turnSignal),
          );
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

          // Empty-but-clean streams are passed through unchanged; the
          // reservation settles against the estimate because no usage part
          // exists, and the orchestrator still decides whether zero text is a
          // failed turn.
          const baseStream = doneEarly
            ? new ReadableStream<LanguageModelV3StreamPart>({
                start(controller) {
                  for (const part of buffered) controller.enqueue(part);
                  controller.close();
                },
              })
            : reemitWithHead(buffered, reader);
          const stream = observeReservationStream(
            baseStream,
            candidate,
            reservation,
            startedAt,
            () => {
              // A mid-stream error cannot be retried without duplicating
              // output, but the next step of the same turn should not try
              // this candidate first again.
              if (preferredModelId === candidate) preferredModelId = undefined;
            },
            () => turnSignal?.aborted === true,
          );

          onModelSelected?.(selected);
          preferredModelId = candidate;
          return {
            stream,
            ...(result.request ? { request: result.request } : {}),
            ...(result.response ? { response: result.response } : {}),
          };
        } catch (error) {
          if (turnSignal?.aborted) {
            // Caller cancellation or the turn deadline: stop the chain. The
            // request was dispatched, so keep the conservative token hold.
            await safeBookkeeping(reservation.settle());
            throw error;
          }
          lastError = error;
          const outcome = await noteAttemptFailed(
            candidate,
            selected,
            error,
            reservation,
            onAttemptFailed,
            turnSignal?.aborted ?? false,
          );
          if (!outcome.advance) throw error;
          if (outcome.dead) continue;
          if (outcome.providerCooled) {
            coolingProviders.add(selected.provider);
            remaining = remaining.filter(
              (id) => parseModelId(id).provider !== selected.provider,
            );
          }
          if (outcome.countsAttempt) attemptsUsed += 1;
          if (outcome.oversized) {
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
