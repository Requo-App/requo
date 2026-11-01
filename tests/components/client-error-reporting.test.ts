import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  getClient: vi.fn(() => null),
  init: vi.fn(),
}));

vi.mock("@sentry/browser", () => sentry);

describe("reportClientError", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@sentry.example.com/1");
    sentry.init.mockClear();
    sentry.captureException.mockClear();
    sentry.getClient.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("captures with the reference id and strips request/breadcrumb tokens", async () => {
    const { reportClientError } = await import("@/lib/observability/client");

    await reportClientError(new Error("boom"), {
      scope: "dashboard-error",
      referenceId: "digest-1",
    });

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [capturedError, context] = sentry.captureException.mock.calls[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect(context.tags).toEqual({
      scope: "dashboard-error",
      reference_id: "digest-1",
    });

    const options = sentry.init.mock.calls[0][0];
    const event = {
      breadcrumbs: [{ message: "GET /quote/secret-token" }],
      request: { url: "https://requo.app/quote/secret-token" },
    };

    expect(options.beforeSend(event)).toEqual({ breadcrumbs: [] });
  });

  it("only logs when no DSN is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    const { reportClientError } = await import("@/lib/observability/client");

    await reportClientError(new Error("boom"), { scope: "region-error" });

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
