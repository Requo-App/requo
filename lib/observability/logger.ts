import "server-only";

import { getCorrelationId } from "./correlation";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const MAX_DEPTH = 5;
const MAX_ARRAY_LENGTH = 50;
const MAX_STRING_LENGTH = 2_000;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 8_000;
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

function scrubErrorMessage(message: string): string {
  const firstLine = message.split(/[\r\n]/, 1)[0] ?? "";

  return firstLine
    .replace(/\b(Bearer\s+)\S+/gi, `$1${REDACTED}`)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED)
    .slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

/**
 * Rebuild the stack from the scrubbed message and V8 frame lines only.
 * `error.stack` starts with the raw message and may retain later lines of a
 * multiline message, so copying it would reintroduce the text that
 * `scrubErrorMessage` removes. Strip that raw header before selecting frames,
 * otherwise a message line shaped like `    at …` is retained as a frame.
 */
function scrubStack(error: Error): string {
  const header = `${error.name}: ${scrubErrorMessage(error.message)}`;
  const rawStack = error.stack ?? "";
  const rawHeader = error.message
    ? `${error.name}: ${error.message}`
    : error.name;
  const frameText = rawStack.startsWith(rawHeader)
    ? rawStack.slice(rawHeader.length)
    : "";
  const frames = frameText
    .split(/\r?\n/)
    .filter((line) => /^\s+at\s/.test(line))
    .map((line) => scrubErrorMessage(line));

  return [header, ...frames].join("\n").slice(0, MAX_STACK_LENGTH);
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: scrubErrorMessage(error.message),
    };

    if (process.env.NODE_ENV !== "production" && error.stack) {
      serialized.stack = scrubStack(error);
    }

    return serialized;
  }

  return { message: scrubErrorMessage(String(error)) };
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
      environment: entry.environment,
      correlationId: entry.correlationId,
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
