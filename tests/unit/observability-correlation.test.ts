import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CORRELATION_ID_HEADER,
  ensureCorrelationId,
  getCorrelationId,
  isValidCorrelationId,
  newCorrelationId,
  resolveRequestCorrelationId,
  runWithCorrelationId,
} from "@/lib/observability/correlation";
import { InngestObservabilityMiddleware } from "@/lib/observability/inngest";
import { withRequestCorrelation } from "@/lib/observability/request";

function correlationLogs(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
    .filter((entry) => entry.correlationId !== undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("correlation IDs", () => {
  it("accepts opaque log keys and rejects control characters", () => {
    expect(isValidCorrelationId("req_abc123")).toBe(true);
    expect(isValidCorrelationId("trace:123.abc-def")).toBe(true);

    expect(isValidCorrelationId("req abc")).toBe(false);
    expect(isValidCorrelationId("req\n123")).toBe(false);
    expect(isValidCorrelationId("x".repeat(129))).toBe(false);
  });

  it("mints a prefixed ID that passes validation", () => {
    expect(isValidCorrelationId(newCorrelationId())).toBe(true);
    expect(newCorrelationId("cron")).toMatch(/^cron_/);
  });

  it("prefers an incoming correlation header and falls back to x-request-id", () => {
    const preferred = new Request("https://requo.test/api", {
      headers: {
        [CORRELATION_ID_HEADER]: "from-proxy",
        "x-request-id": "from-platform",
      },
    });
    expect(resolveRequestCorrelationId(preferred)).toBe("from-proxy");

    const alias = new Request("https://requo.test/api", {
      headers: { "x-request-id": "from-platform" },
    });
    expect(resolveRequestCorrelationId(alias)).toBe("from-platform");
  });

  it("ignores an unsafe incoming header and generates a fresh ID", () => {
    const request = new Request("https://requo.test/api", {
      headers: { [CORRELATION_ID_HEADER]: "bad value" },
    });

    const resolved = resolveRequestCorrelationId(request);

    expect(resolved).not.toBe("bad value");
    expect(isValidCorrelationId(resolved)).toBe(true);
  });

  it("propagates through async work and isolates nested scopes", async () => {
    const seen: Array<string | undefined> = [];

    await runWithCorrelationId("outer", async () => {
      await Promise.resolve();
      seen.push(getCorrelationId());

      await runWithCorrelationId("inner", async () => {
        await Promise.resolve();
        seen.push(getCorrelationId());
      });

      seen.push(getCorrelationId());
    });

    expect(seen).toEqual(["outer", "inner", "outer"]);
  });

  it("keeps an existing ID when ensuring, and mints one outside a scope", async () => {
    await runWithCorrelationId("existing", () => {
      expect(ensureCorrelationId("email", getCorrelationId)).toBe("existing");
    });

    const minted = ensureCorrelationId("email", getCorrelationId);

    expect(minted).toMatch(/^email_/);
    expect(getCorrelationId()).toBeUndefined();
  });
});

describe("withRequestCorrelation", () => {
  it("adds the incoming ID to the response and structured logs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const request = new Request("https://requo.test/api/cron/cleanup", {
      method: "POST",
      headers: { [CORRELATION_ID_HEADER]: "caller-supplied" },
    });

    const response = await withRequestCorrelation(
      request,
      "cleanup",
      () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
      { scheduler: "vercel-cron" },
    );

    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe(
      "caller-supplied",
    );
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true });

    const logs = correlationLogs(info);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "cleanup.started",
          correlationId: "caller-supplied",
          scheduler: "vercel-cron",
          method: "POST",
        }),
        expect.objectContaining({
          event: "cleanup.completed",
          correlationId: "caller-supplied",
          status: 202,
        }),
      ]),
    );
  });

  it("preserves handler headers and owns the correlation header", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const request = new Request("https://requo.test/api/chat", {
      headers: { [CORRELATION_ID_HEADER]: "boundary-id" },
    });

    const response = await withRequestCorrelation(request, "chat", () => {
      const result = new Response("stream", { status: 200 });
      result.headers.set("x-session-id", "s1");
      result.headers.set(CORRELATION_ID_HEADER, "handler-value");
      return result;
    });

    expect(response.headers.get("x-session-id")).toBe("s1");
    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe("boundary-id");
  });

  it("adds the header to a redirect response with immutable headers", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const request = new Request("https://requo.test/api/redirect", {
      headers: { [CORRELATION_ID_HEADER]: "redirect-id" },
    });

    const response = await withRequestCorrelation(request, "redirect", () =>
      Response.redirect("https://requo.test/next", 303),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://requo.test/next");
    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe("redirect-id");
  });

  it("logs the failure and rethrows", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new Request("https://requo.test/api/webhook", {
      method: "POST",
      headers: { [CORRELATION_ID_HEADER]: "hook-1" },
    });

    await expect(
      withRequestCorrelation(request, "webhook", () => {
        throw new Error("provider down");
      }),
    ).rejects.toThrow("provider down");

    const logs = correlationLogs(error);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "webhook.failed",
          level: "error",
          correlationId: "hook-1",
          error: expect.objectContaining({ message: "provider down" }),
        }),
      ]),
    );
  });
});

describe("Inngest observability middleware", () => {
  it("runs the function handler inside the run correlation scope", async () => {
    const middleware = new InngestObservabilityMiddleware({ client: {} as never });
    let observed: string | undefined;

    await middleware.wrapFunctionHandler({
      ctx: { runId: "run/123" } as never,
      fn: {} as never,
      next: async () => {
        await Promise.resolve();
        observed = getCorrelationId();
        return "done";
      },
    });

    expect(observed).toBe("inngest_run_123");
  });
});
