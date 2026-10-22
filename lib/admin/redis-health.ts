/**
 * Redis REST health probe shared by the admin and CLI health checks.
 *
 * Upstash and serverless-redis-http (SRH) both accept commands in the request
 * body. SRH does not implement commands through URL paths, so the probe must
 * POST `["ping"]` rather than call `/ping`.
 */

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 1000;
// A timed-out ping is ambiguous, but retrying every 5s until the normal
// attempt limit would stall the health check for ~30s. Allow one retry for a
// transient timeout; connection and 5xx failures still use every attempt.
const MAX_TIMEOUT_ATTEMPTS = 2;

export type RedisPingOptions = {
  attempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
};

/** Sends one body-command ping and resolves only on a `PONG` result. */
export async function pingRedisRest(
  url: string,
  token: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["ping"]),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      result?: unknown;
      error?: unknown;
    };
    if (payload.error) throw new Error(String(payload.error));
    if (payload.result !== "PONG") {
      throw new Error("Unexpected ping response");
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Retry only failures that can mean "the local proxy is still starting".
 * Timeouts, connection failures, and 5xx responses are transient;
 * authentication and protocol errors are not.
 */
export function isRetryableRedisPingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    error instanceof TypeError ||
    /^HTTP 5\d{2}$/.test(error.message)
  );
}

/**
 * Pings a Redis REST endpoint, retrying transient failures so a cold-starting
 * SRH container does not produce a false warning. Timeouts get one retry;
 * connection and 5xx failures get the full attempt budget.
 */
export async function pingRedisRestWithRetry(
  url: string,
  token: string,
  options: RedisPingOptions = {},
): Promise<void> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? DEFAULT_ATTEMPTS));
  const retryDelayMs = Math.max(
    0,
    Math.floor(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS),
  );
  let timeoutAttempts = 0;

  for (let attempt = 1; ; attempt++) {
    try {
      await pingRedisRest(url, token, options.timeoutMs);
      return;
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      if (timedOut) timeoutAttempts += 1;

      if (
        attempt >= attempts ||
        !isRetryableRedisPingError(error) ||
        (timedOut && timeoutAttempts >= MAX_TIMEOUT_ATTEMPTS)
      ) {
        throw error;
      }
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
}
