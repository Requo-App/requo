import "server-only";

// ---------------------------------------------------------------------------
// AI Provider Error Utilities
//
// Centralizes error classification so routing can decide whether to advance
// to the next provider or stop.
//
// Retryable (advance to next provider):
//   408 timeout, 409 conflict/capacity, 413 TPM overflow on Groq,
//   429 rate limit, 500, 502, 503, 504 server errors,
//   network timeouts, connection errors, model temporarily unavailable,
//   capacity/quota messages even when the status code is ambiguous,
//   404 / model-not-found (dead catalog identifier — skipped without
//   consuming an attempt; see fallback-model.ts).
//
// Oversized (shrink-or-escalate, NOT plain rotation):
//   context-length and request-too-large messages. The same payload fails
//   identically on the next model, so these route to a higher-context
//   candidate or compaction rather than a blind retry.
//
// Non-retryable by status alone no longer ends a turn: the non-streaming
// path advances through its chain on any failure and only an exhausted
// candidate list is a failure.
// ---------------------------------------------------------------------------

import type { AiProviderName } from "@/lib/ai/types";

const RETRYABLE_STATUS_CODES = new Set([
  408, // timeout
  409, // conflict/capacity
  413, // payload too large (Groq returns this for TPM overflows on large prompts)
  429, // rate limit
  500, // server error
  502, // bad gateway
  503, // service unavailable
  504, // gateway timeout
]);

const NETWORK_ERROR_PATTERNS = [
  "econnrefused",
  "econnreset",
  "etimedout",
  "enotfound",
  "epipe",
  "fetch failed",
  "network error",
  "socket hang up",
  "aborterror",
  "the operation was aborted",
  "signal timed out",
];

/**
 * Message fragments that indicate a retryable capacity/quota problem even
 * when the status code is missing or ambiguous.
 *
 * NOTE: context-length / request-too-large fragments are deliberately NOT
 * here — they are oversized payloads (see OVERSIZED_MESSAGE_PATTERNS) and
 * must route to shrink-or-escalate, not plain rotation.
 *
 * NOTE: unsupported-property rejections (`reasoning_content`,
 * `is unsupported`) are deliberately NOT here either. They are prompt-shape
 * problems, not capacity problems, so classifying them as retryable put a
 * healthy model on a capacity cooldown. The prompt is kept portable by
 * `stripReasoningMiddleware` in `lib/ai/fallback-model.ts`; if one still
 * lands it advances as a non-retryable error without poisoning the counters.
 */
const RETRYABLE_MESSAGE_PATTERNS = [
  "rate_limit_exceeded",
  "rate limit exceeded",
  "rate limit",
  "rate-limit",
  "too many requests",
  "quota exceeded",
  "quota_exceeded",
  "tokens per minute",
  "tpm",
  "capacity",
  "overloaded",
  "service unavailable",
  "model_overloaded",
];

/**
 * The same payload fails identically on the next model — route to a
 * higher-context candidate or compaction, not a plain rotation.
 */
const OVERSIZED_MESSAGE_PATTERNS = [
  "request too large",
  "too many tokens",
  "context length",
  "context_length",
  "maximum context",
  "max_tokens_exceeded",
  "input too long",
  "prompt too long",
  "exceeds the maximum",
  "context window",
];

/** Authentication / authorisation failures scope to the provider, not a model. */
const AUTH_MESSAGE_PATTERNS = [
  "invalid api key",
  "incorrect api key",
  "unauthorized",
  "permission denied",
  "authentication",
  "not authorized",
  "forbidden",
  "api key",
  "access denied",
];

/** Provider safety refusals: another provider may answer the same prompt. */
const CONTENT_BLOCKED_MESSAGE_PATTERNS = [
  "safety",
  "content policy",
  "content_policy",
  "content filter",
  "moderation",
  "harmful",
  "responsible ai",
  "recitation",
  "prohibited",
  "blocked by",
];

/** Request-shape failures that are not capacity problems. */
const REQUEST_INVALID_MESSAGE_PATTERNS = [
  "unsupported",
  "not supported",
  "invalid argument",
  "invalid request",
  "bad request",
  "malformed",
  "schema",
  "reasoning_content",
  "unknown field",
  "unexpected field",
];

/** A model identifier the provider no longer serves (404 / not-found). */
const MODEL_NOT_FOUND_PATTERNS = [
  "model_not_found",
  "model not found",
  "model does not exist",
  "no such model",
  "unknown model",
  "invalid model",
  "model_not_available",
  "not a valid model",
  "does not exist",
];

/**
 * Structured error thrown when a provider fails.
 * Carries the provider name, HTTP status (if any), and whether the error
 * is retryable so the router can act on it without re-inspecting.
 */
export class AiProviderError extends Error {
  constructor(
    public readonly provider: AiProviderName,
    public readonly statusCode: number | null,
    public readonly retryable: boolean,
    public readonly retryAfterMs: number | null,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

// ---------------------------------------------------------------------------
// Extraction helpers — each SDK stores status / retry-after differently
// ---------------------------------------------------------------------------

function extractStatusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  // Groq SDK uses `status`, OpenRouter SDK uses `statusCode`
  for (const key of ["status", "statusCode", "httpCode", "code"] as const) {
    if (key in error) {
      const value = (error as Record<string, unknown>)[key];

      if (typeof value === "number" && value >= 100 && value < 600) {
        return value;
      }
    }
  }

  // Gemini wraps errors in an `error` object sometimes
  if ("error" in error) {
    const inner = (error as { error: unknown }).error;

    return extractStatusCode(inner);
  }

  return null;
}

function extractRetryAfterMs(error: unknown, maxMs = 5_000): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  // Some SDKs expose response headers
  const headers =
    "headers" in error
      ? (error as { headers: unknown }).headers
      : "response" in error &&
          typeof (error as { response: unknown }).response === "object" &&
          (error as { response: { headers?: unknown } }).response !== null
        ? (error as { response: { headers: unknown } }).response.headers
        : null;

  if (!headers) {
    return null;
  }

  let retryAfter: string | null = null;

  if (typeof headers === "object" && headers !== null) {
    if ("get" in headers && typeof (headers as { get: unknown }).get === "function") {
      retryAfter = (headers as { get: (key: string) => string | null }).get("retry-after");
    } else if ("retry-after" in headers) {
      const raw = (headers as Record<string, unknown>)["retry-after"];
      retryAfter = typeof raw === "string" ? raw : null;
    }
  }

  if (!retryAfter) {
    return null;
  }

  // retry-after can be seconds (integer) or an HTTP-date
  const seconds = Number(retryAfter);

  if (!Number.isNaN(seconds) && seconds > 0) {
    return Math.min(seconds * 1_000, maxMs);
  }

  // Try parsing as date
  const date = new Date(retryAfter);

  if (!Number.isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return delayMs > 0 ? Math.min(delayMs, maxMs) : null;
  }

  return null;
}

function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function collectErrorText(error: unknown): string {
  const direct =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  let nested = "";

  if (typeof error === "object" && error !== null) {
    const errWithError = error as { error?: { message?: unknown } };

    if (typeof errWithError.error?.message === "string") {
      nested = errWithError.error.message;
    }

    const errWithBody = error as { body?: unknown; responseBody?: unknown; data?: { message?: unknown } };

    if (typeof errWithBody.body === "string") {
      nested += ` ${errWithBody.body}`;
    }

    // Vercel AI SDK errors include responseBody and data.message
    if (typeof errWithBody.responseBody === "string") {
      nested += ` ${errWithBody.responseBody}`;
    }

    if (typeof errWithBody.data?.message === "string") {
      nested += ` ${errWithBody.data.message}`;
    }
  }

  return `${direct} ${nested}`.toLowerCase();
}

/**
 * Detects retryable capacity/rate-limit errors by message content.
 * Used as a safety net when a provider returns a non-standard status code
 * (e.g., Groq sometimes wraps TPM overflows in a 400/413 with a JSON body).
 */
function isRetryableMessage(error: unknown): boolean {
  const haystack = collectErrorText(error);

  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => haystack.includes(pattern));
}

/** A model identifier the provider no longer serves — skip without cost. */
export function isModelNotFoundError(error: unknown): boolean {
  const status = extractStatusCode(error);
  if (status === 404) return true;
  const haystack = collectErrorText(error);
  return MODEL_NOT_FOUND_PATTERNS.some((pattern) => haystack.includes(pattern));
}

/** Payload too large for the model's context — needs shrink-or-escalate. */
export function isOversizedError(error: unknown): boolean {
  const haystack = collectErrorText(error);
  return OVERSIZED_MESSAGE_PATTERNS.some((pattern) => haystack.includes(pattern));
}

const DAY_SCOPE_PATTERNS = [
  "daily",
  "per day",
  "per-day",
  "rpd",
  "tpd",
  "day quota",
  "daily quota",
  "quota per day",
  "requests per day",
  "tokens per day",
  "monthly",
  "per month",
  "neurons",
  "neuron",
];

/**
 * Scope the exhaustion cooldown to the limit that tripped: a refusal naming
 * a daily quota cools down until the day boundary, a per-minute limit cools
 * down for a minute only.
 */
export function classifyExhaustionScope(
  error: unknown,
): "day" | "minute" {
  const haystack = collectErrorText(error);
  if (DAY_SCOPE_PATTERNS.some((pattern) => haystack.includes(pattern))) {
    return "day";
  }
  return "minute";
}

/** Caller cancellation or a turn deadline. Never a reason to fall back. */
export function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const name = (error as { name?: unknown }).name;
  if (name === "AbortError" || name === "TimeoutError") return true;
  const haystack = collectErrorText(error);
  return (
    haystack.includes("aborterror") ||
    haystack.includes("the operation was aborted") ||
    haystack.includes("request was aborted") ||
    haystack.includes("signal is aborted")
  );
}

/**
 * One routing decision per failure. Kept in one place so the streaming and
 * non-streaming paths, the importer, and embeddings cannot drift into
 * different retry/cooldown policies.
 *
 * `advance` answers "may another candidate serve this request?"; `retryable`
 * answers "is this a transient capacity/server condition?"; `cooldown` answers
 * "which scope should the selector avoid, and for how long?"; and
 * `keepTokenEstimate` says whether the failed attempt probably consumed
 * tokens (a timeout may have been processed; a 429 was refused before
 * generation).
 */
export type AiFailureKind =
  | "cancelled"
  | "model_not_found"
  | "oversized"
  | "auth"
  | "rate_limit"
  | "quota"
  | "timeout"
  | "network"
  | "server"
  | "request_invalid"
  | "content_blocked"
  | "unknown";

export type AiFailureCooldown = "none" | "minute" | "day" | "provider";

export type AiFailureClassification = {
  kind: AiFailureKind;
  statusCode: number | null;
  message: string;
  retryable: boolean;
  /** Whether the router should try the next candidate. */
  advance: boolean;
  /** Whether the failed dispatch consumes one attempt from the budget. */
  countsAttempt: boolean;
  /** Stale catalog identifiers are evicted for hours without an attempt. */
  markModelDead: boolean;
  cooldown: AiFailureCooldown;
  /** Keep the token reservation when the provider may already have spent it. */
  keepTokenEstimate: boolean;
};

function classifyByMessage(
  error: unknown,
  statusCode: number | null,
): AiFailureClassification["kind"] {
  const haystack = collectErrorText(error);

  // Statuses that name a non-capacity cause outrank loose message patterns:
  // a 404 body that mentions "api key" is still a stale model identifier, and
  // a 429 body that says "daily" is still a quota refusal (checked below).
  if (statusCode === 404) return "model_not_found";
  if (statusCode === 401 || statusCode === 403) return "auth";
  if (statusCode === 451) return "content_blocked";

  if (isModelNotFoundError(error)) return "model_not_found";
  if (isOversizedError(error)) return "oversized";
  if (
    CONTENT_BLOCKED_MESSAGE_PATTERNS.some((pattern) =>
      haystack.includes(pattern),
    )
  ) {
    return "content_blocked";
  }
  if (DAY_SCOPE_PATTERNS.some((pattern) => haystack.includes(pattern))) {
    return "quota";
  }
  if (isRetryableMessage(error)) {
    return "rate_limit";
  }
  // Auth after the capacity patterns: an "api key" phrase in a quota body
  // must not hide the limit the provider actually rejected. Explicit 401/403
  // statuses were already handled above.
  if (AUTH_MESSAGE_PATTERNS.some((pattern) => haystack.includes(pattern))) {
    return "auth";
  }
  if (
    REQUEST_INVALID_MESSAGE_PATTERNS.some((pattern) =>
      haystack.includes(pattern),
    )
  ) {
    return "request_invalid";
  }

  if (statusCode !== null) {
    if (statusCode === 408) return "timeout";
    if (statusCode === 429) return "rate_limit";
    if (statusCode === 413) return "rate_limit";
    if (statusCode === 400 || statusCode === 422) return "request_invalid";
    if (statusCode >= 500) return "server";
  }

  if (isNetworkError(error)) return "network";
  return "unknown";
}

function classificationFor(
  kind: AiFailureKind,
  error: unknown,
  statusCode: number | null,
): AiFailureClassification {
  const base = {
    kind,
    statusCode,
    message: error instanceof Error ? error.message : String(error),
  };

  switch (kind) {
    case "cancelled":
      return {
        ...base,
        retryable: false,
        advance: false,
        countsAttempt: false,
        markModelDead: false,
        cooldown: "none",
        keepTokenEstimate: true,
      };
    case "model_not_found":
      return {
        ...base,
        retryable: false,
        advance: true,
        countsAttempt: false,
        markModelDead: true,
        cooldown: "none",
        keepTokenEstimate: false,
      };
    case "oversized":
      return {
        ...base,
        retryable: false,
        advance: true,
        countsAttempt: true,
        markModelDead: false,
        cooldown: "none",
        keepTokenEstimate: false,
      };
    case "auth":
      return {
        ...base,
        retryable: false,
        advance: true,
        countsAttempt: true,
        markModelDead: false,
        cooldown: "provider",
        keepTokenEstimate: false,
      };
    case "rate_limit":
    case "quota":
      return {
        ...base,
        retryable: true,
        advance: true,
        countsAttempt: true,
        markModelDead: false,
        cooldown:
          kind === "quota" || classifyExhaustionScope(error) === "day"
            ? "day"
            : "minute",
        keepTokenEstimate: false,
      };
    case "timeout":
    case "network":
      return {
        ...base,
        retryable: true,
        advance: true,
        countsAttempt: true,
        markModelDead: false,
        cooldown: "minute",
        keepTokenEstimate: true,
      };
    case "server":
      return {
        ...base,
        retryable: true,
        advance: true,
        countsAttempt: true,
        markModelDead: false,
        cooldown: "minute",
        keepTokenEstimate: true,
      };
    case "request_invalid":
    case "content_blocked":
      return {
        ...base,
        retryable: false,
        advance: true,
        countsAttempt: true,
        markModelDead: false,
        cooldown: "none",
        keepTokenEstimate: false,
      };
    case "unknown":
    default:
      return {
        ...base,
        retryable: true,
        advance: true,
        countsAttempt: true,
        markModelDead: false,
        cooldown: "minute",
        keepTokenEstimate: true,
      };
  }
}

/**
 * Classify a raw provider failure for routing, cooldown, and accounting.
 *
 * `turnAborted` distinguishes caller cancellation (stop the chain) from a
 * per-candidate timeout (advance to the next candidate). Both surface as an
 * `AbortError`/`TimeoutError`, so the caller that owns the turn signal has to
 * supply the context. Omitted means "unknown": treat it as cancellation and
 * do not poison a model's cooldown on an abort.
 */
export function classifyProviderFailure(
  error: unknown,
  options?: { turnAborted?: boolean },
): AiFailureClassification {
  if (isAbortError(error)) {
    return classificationFor(
      options?.turnAborted === false ? "timeout" : "cancelled",
      error,
      extractStatusCode(error),
    );
  }

  const statusCode = extractStatusCode(error);
  const kind = classifyByMessage(error, statusCode);
  return classificationFor(kind, error, statusCode);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determine whether an error is a transient capacity/server condition.
 *
 * Routing no longer uses this to decide whether to advance: the fallback
 * wrapper calls `classifyProviderFailure`, because a non-retryable bad request
 * can still succeed on a different provider. This predicate remains for
 * same-provider retry logic and telemetry.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AiProviderError) {
    return error.retryable;
  }

  return classifyProviderFailure(error).retryable;
}

/**
 * Whether an error carries *positive evidence* of a transient condition, as
 * opposed to `isRetryableError`'s deliberate fail-safe default.
 *
 * `isRetryableError` reports unclassifiable errors as retryable so the router
 * advances to the next provider — a rotation is cheap and the alternative is
 * giving up. A same-model backoff retry is different: retrying an error we
 * cannot classify only adds latency, so it requires evidence. Network
 * failures, rate-limit/capacity messages, an explicit `retry-after`, and
 * known transient status codes all qualify.
 */
export function isTransientProviderError(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  if (isRetryableMessage(error)) return true;
  if (extractRetryAfterMs(error) !== null) return true;

  const status = extractStatusCode(error);

  return status !== null && RETRYABLE_STATUS_CODES.has(status);
}

/**
 * Wrap a raw SDK error into a structured `AiProviderError`.
 * The router uses this to carry provider context through the fallback chain.
 */
export function wrapProviderError(
  provider: AiProviderName,
  error: unknown,
): AiProviderError {
  const statusCode = extractStatusCode(error);
  const retryable =
    isNetworkError(error) ||
    isRetryableMessage(error) ||
    (statusCode !== null ? RETRYABLE_STATUS_CODES.has(statusCode) : true);
  const retryAfterMs = extractRetryAfterMs(error);
  const message =
    error instanceof Error ? error.message : "Unknown provider error";

  return new AiProviderError(
    provider,
    statusCode,
    retryable,
    retryAfterMs,
    message,
    error,
  );
}

/**
 * Build a sanitized error summary safe for logging.
 * Never includes API keys or full prompt contents.
 */
export function getSanitizedErrorInfo(error: unknown): {
  message: string;
  statusCode: number | null;
  retryable: boolean;
} {
  if (error instanceof AiProviderError) {
    return {
      message: error.message,
      statusCode: error.statusCode,
      retryable: error.retryable,
    };
  }

  return {
    message: error instanceof Error ? error.message : "Unknown error",
    statusCode: extractStatusCode(error),
    retryable: isRetryableError(error),
  };
}
