import "server-only";

import { getCorrelationId } from "./correlation";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const MAX_DEPTH = 5;
const MAX_ARRAY_LENGTH = 50;
const MAX_STRING_LENGTH = 2_000;
const REDACTED = "[redacted]";

/**
 * Secret-bearing keys. Matching is normalized (case, `_`, `-`) and exact
 * except for `*password` / `*secret`, so token counts such as `inputTokens`
 * and idempotency keys stay readable.
 */
const SENSITIVE_KEYS = new Set([
  "authorization",
  "apikey",
  "accesstoken",
  "clientsecret",
  "cookie",
  "credential",
  "credentials",
  "idtoken",
  "password",
  "privatekey",
  "refreshtoken",
  "secret",
  "sessiontoken",
  "setcookie",
  "token",
  "tokenhash",
  "webhooksecret",
]);

function normalizeKey(key: string): string {
  return key.replace(/[-_]/g, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);

  return (
    SENSITIVE_KEYS.has(normalized) ||
    normalized.endsWith("password") ||
    normalized.endsWith("secret")
  );
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };

    if (process.env.NODE_ENV !== "production" && error.stack) {
      serialized.stack = error.stack;
    }

    return serialized;
  }

  return { message: String(error) };
}

function redactValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}…`;
    }

    return value;
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= MAX_DEPTH) {
    return "[truncated]";
  }

  if (seen.has(value)) {
    return "[circular]";
  }

  seen.add(value);

  let redacted: unknown;

  if (Array.isArray(value)) {
    redacted = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => redactValue(entry, depth + 1, seen));
  } else {
    const output: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      output[key] = isSensitiveKey(key)
        ? REDACTED
        : redactValue(entry, depth + 1, seen);
    }

    redacted = output;
  }

  seen.delete(value);

  return redacted;
}

function emit(level: LogLevel, line: string): void {
  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  if (level === "debug") {
    if (process.env.NODE_ENV !== "production") {
      console.debug(line);
    }
    return;
  }

  console.info(line);
}

/**
 * Emit one structured JSON line. The correlation ID comes from the current
 * async boundary unless the caller supplies one explicitly (useful in Inngest
 * hooks that run outside the wrapped handler).
 */
export function log(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  const { correlationId: explicitCorrelationId, ...rest } = fields;
  const redacted = redactValue(rest, 0, new WeakSet()) as LogFields;
  const entry: LogFields = {
    ...redacted,
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "requo",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    correlationId:
      typeof explicitCorrelationId === "string"
        ? explicitCorrelationId
        : (getCorrelationId() ?? null),
  };

  let line: string;

  try {
    line = JSON.stringify(entry);
  } catch {
    line = JSON.stringify({
      timestamp: entry.timestamp,
      level,
      event,
      service: "requo",
      error: "log_serialization_failed",
    });
  }

  emit(level, line);
}

export function logDebug(event: string, fields?: LogFields): void {
  log("debug", event, fields);
}

export function logInfo(event: string, fields?: LogFields): void {
  log("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields): void {
  log("warn", event, fields);
}

export function logError(
  event: string,
  error: unknown,
  fields?: LogFields,
): void {
  log("error", event, { ...fields, error: serializeError(error) });
}
