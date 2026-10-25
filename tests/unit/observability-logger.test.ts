import { afterEach, describe, expect, it, vi } from "vitest";

import { runWithCorrelationId } from "@/lib/observability/correlation";
import {
  logDebug,
  logError,
  logInfo,
  logWarn,
  serializeError,
} from "@/lib/observability/logger";

function capture(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(
    ([line]) => JSON.parse(String(line)) as Record<string, unknown>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("structured logger", () => {
  it("emits one JSON line with level, event, service, and timestamp", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logInfo("email.sent", { provider: "resend", messageId: "m1" });

    expect(info).toHaveBeenCalledTimes(1);
    const [entry] = capture(info);

    expect(entry).toEqual(
      expect.objectContaining({
        level: "info",
        event: "email.sent",
        service: "requo",
        provider: "resend",
        messageId: "m1",
        correlationId: null,
      }),
    );
    expect(Date.parse(String(entry.timestamp))).not.toBeNaN();
  });

  it("attaches the ambient correlation ID and lets an explicit one win", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    runWithCorrelationId("run-1", () => {
      logInfo("job.step", { step: "one" });
      logInfo("job.step", { step: "two", correlationId: "explicit" });
    });

    const [ambient, explicit] = capture(info);
    expect(ambient.correlationId).toBe("run-1");
    expect(explicit.correlationId).toBe("explicit");
  });

  it("redacts secrets at any depth but keeps token counts and keys", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logInfo("auth.attempt", {
      authorization: "Bearer secret",
      apiKey: "key",
      webhookSecret: "whsec",
      nested: {
        password: "hunter2",
        client_secret: "shh",
        user: { refreshToken: "rt", inputTokens: 42 },
      },
      idempotencyKey: "idem-1",
      tokenCount: 12,
    });

    const [entry] = capture(info);

    expect(entry).toEqual(
      expect.objectContaining({
        authorization: "[redacted]",
        apiKey: "[redacted]",
        webhookSecret: "[redacted]",
        idempotencyKey: "idem-1",
        tokenCount: 12,
        nested: {
          password: "[redacted]",
          client_secret: "[redacted]",
          user: { refreshToken: "[redacted]", inputTokens: 42 },
        },
      }),
    );
  });

  it("serializes errors, dates, and circular references without throwing", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;

    logInfo("debug.payload", {
      when: new Date("2026-01-02T03:04:05.000Z"),
      error: new Error("boom"),
      circular,
    });

    const [entry] = capture(info);

    expect(entry.when).toBe("2026-01-02T03:04:05.000Z");
    expect(entry.error).toEqual(
      expect.objectContaining({ name: "Error", message: "boom" }),
    );
    expect(entry.circular).toEqual({ name: "loop", self: "[circular]" });
  });

  it("truncates oversized strings and arrays", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logInfo("bulk.payload", {
      text: "a".repeat(2_050),
      rows: Array.from({ length: 60 }, (_, idx) => idx),
    });

    const [entry] = capture(info);

    expect(entry.text).toBe(`${"a".repeat(2_000)}…`);
    expect(entry.rows).toHaveLength(50);
  });

  it("routes levels to the matching console method", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    logInfo("i");
    logWarn("w");
    logError("e", new Error("failed"));
    logDebug("d");

    expect(capture(info)[0]).toEqual(
      expect.objectContaining({ level: "info", event: "i" }),
    );
    expect(capture(warn)[0]).toEqual(
      expect.objectContaining({ level: "warn", event: "w" }),
    );
    expect(capture(error)[0]).toEqual(
      expect.objectContaining({
        level: "error",
        event: "e",
        error: expect.objectContaining({ message: "failed" }),
      }),
    );
    expect(capture(debug)[0]).toEqual(
      expect.objectContaining({ level: "debug", event: "d" }),
    );
  });

  it("drops debug lines in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    logDebug("noisy");

    expect(debug).not.toHaveBeenCalled();
  });

  it("serializes non-Error throwables", () => {
    expect(serializeError("nope")).toEqual({ message: "nope" });
    expect(serializeError(404)).toEqual({ message: "404" });
  });
});
