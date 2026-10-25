import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { prefixedId } from "@/lib/ids";

export const CORRELATION_ID_HEADER = "x-correlation-id";

const REQUEST_ID_HEADERS = [CORRELATION_ID_HEADER, "x-request-id"] as const;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

type CorrelationStore = {
  correlationId: string;
};

const storage = new AsyncLocalStorage<CorrelationStore>();

/** Generate an opaque correlation ID for a new boundary. */
export function newCorrelationId(prefix = "req"): string {
  return prefixedId(prefix, 24);
}

/**
 * Incoming IDs are opaque log keys, never authorization. Restrict the shape
 * so a client cannot inject line breaks or arbitrary text into logs.
 */
export function isValidCorrelationId(value: string): boolean {
  return CORRELATION_ID_PATTERN.test(value);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function runWithCorrelationId<T>(
  correlationId: string,
  fn: () => T,
): T {
  return storage.run({ correlationId }, fn);
}

/**
 * Reuse the current correlation ID, or start a new scope when the caller is
 * outside a boundary (for example, an email sent from a server action).
 */
export function ensureCorrelationId<T>(prefix: string, fn: () => T): T {
  return storage.getStore()
    ? fn()
    : runWithCorrelationId(newCorrelationId(prefix), fn);
}

/**
 * Prefer a proxy/provider correlation header when it is well formed; otherwise
 * mint one for this request. `x-request-id` is accepted as an alias because
 * platforms commonly forward it.
 */
export function resolveRequestCorrelationId(request: Request): string {
  for (const header of REQUEST_ID_HEADERS) {
    const value = request.headers.get(header)?.trim();

    if (value && isValidCorrelationId(value)) {
      return value;
    }
  }

  return newCorrelationId();
}
