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

  describe.each([
    ["Error", (message: string) => new Error(message)],
    ["non-Error", (message: string) => message],
  ])("%s messages", (_label, throwable) => {
    it.each(["\n", "\r\n", "\r"])(
      "keeps only the first line and redacts credentials and emails (%j)",
      (newline) => {
        const message =
          "Failed for alice+test@example.com and bob@example.org: Bearer abc.def-123_~+/= and bearer second-token";

        expect(
          serializeError(throwable(`${message}${newline}private request body`)),
        ).toEqual(
          expect.objectContaining({
            message:
              "Failed for [redacted] and [redacted]: Bearer [redacted] and bearer [redacted]",
          }),
        );
      },
    );

    it("caps the scrubbed message at 500 characters", () => {
      expect(serializeError(throwable("x".repeat(501))).message).toBe(
        "x".repeat(500),
      );
    });
  });

  it.each(["development", "production"])(
    "preserves error names and sanitizes stack output in %s",
    (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      const error = new TypeError(
        "failed\nprivate request body\n    at Bearer private-frame-token",
      );
      const serialized = serializeError(error);

      expect(serialized).toMatchObject({
        name: "TypeError",
        message: "failed",
      });

      if (environment === "production") {
        expect(serialized).not.toHaveProperty("stack");
      } else {
        expect(serialized.stack).toContain("TypeError: failed");
        expect(serialized.stack).toMatch(/\n\s+at\s/);
        expect(serialized.stack).not.toContain("private request body");
        expect(serialized.stack).not.toContain("private-frame-token");
      }
    },
  );

  it("scrubs credentials from retained stack frames", () => {
    vi.stubEnv("NODE_ENV", "development");
    const error = new TypeError("failed");
    error.stack = "TypeError: failed\n    at send (Bearer frame-token)";

    const serialized = serializeError(error);

    expect(serialized.stack).toContain("TypeError: failed");
    expect(serialized.stack).toContain("\n    at send");
    expect(serialized.stack).not.toContain("frame-token");
  });

  it("does not log multiline error text through a development stack", () => {
    vi.stubEnv("NODE_ENV", "development");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logError("job.failed", new TypeError("failed\nprivate request body"));

    expect(capture(error)[0]).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          name: "TypeError",
          message: "failed",
        }),
      }),
    );
    expect(JSON.stringify(capture(error)[0])).not.toContain(
      "private request body",
    );
  });

  it("preserves environment and correlation IDs when serialization fails", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    runWithCorrelationId("ambient", () => {
      logInfo("payload.failed", { value: BigInt(1) });
      logInfo("payload.failed", { value: BigInt(1), correlationId: "explicit" });
    });
    logInfo("payload.failed", { value: BigInt(1) });

    expect(capture(info)).toEqual(
      ["ambient", "explicit", null].map((correlationId) => ({
        timestamp: expect.any(String),
        level: "info",
        event: "payload.failed",
        service: "requo",
        environment: "preview",
        correlationId,
        error: "log_serialization_failed",
      })),
    );
  });
});
