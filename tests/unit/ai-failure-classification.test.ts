import { describe, expect, it } from "vitest";

import {
  classifyProviderFailure,
  isAbortError,
} from "@/lib/ai/errors";

/**
 * One failure policy for streaming, non-streaming, the importer, and
 * embeddings. These cases pin the routing decision, the attempt budget, and
 * the cooldown scope so those paths cannot drift apart.
 */
describe("provider failure classification", () => {
  it("advances on a rate limit and cools down for a minute", () => {
    const result = classifyProviderFailure(
      Object.assign(new Error("Rate limit exceeded"), { status: 429 }),
    );

    expect(result).toMatchObject({
      kind: "rate_limit",
      statusCode: 429,
      retryable: true,
      advance: true,
      countsAttempt: true,
      cooldown: "minute",
      keepTokenEstimate: false,
    });
  });

  it("scopes a daily quota refusal to the day boundary", () => {
    const result = classifyProviderFailure(
      new Error("You exceeded your daily quota for this model"),
    );

    expect(result).toMatchObject({
      kind: "quota",
      advance: true,
      countsAttempt: true,
      cooldown: "day",
      keepTokenEstimate: false,
    });
  });

  it("scopes an auth failure to the whole provider", () => {
    const result = classifyProviderFailure(
      Object.assign(new Error("Invalid API key"), { status: 401 }),
    );

    expect(result).toMatchObject({
      kind: "auth",
      advance: true,
      countsAttempt: true,
      cooldown: "provider",
      keepTokenEstimate: false,
    });
  });

  it("skips a stale model identifier without spending an attempt", () => {
    const result = classifyProviderFailure(
      Object.assign(new Error("model_not_found"), { status: 404 }),
    );

    expect(result).toMatchObject({
      kind: "model_not_found",
      advance: true,
      countsAttempt: false,
      markModelDead: true,
      cooldown: "none",
      keepTokenEstimate: false,
    });
  });

  it("escalates an oversized payload without cooling the model", () => {
    const result = classifyProviderFailure(
      new Error("This request is too large for the model context window"),
    );

    expect(result).toMatchObject({
      kind: "oversized",
      advance: true,
      countsAttempt: true,
      cooldown: "none",
      keepTokenEstimate: false,
    });
  });

  it("treats a per-candidate timeout as retryable on the next candidate", () => {
    const error = Object.assign(new Error("The operation was aborted"), {
      name: "TimeoutError",
    });

    expect(isAbortError(error)).toBe(true);
    expect(
      classifyProviderFailure(error, { turnAborted: false }),
    ).toMatchObject({
      kind: "timeout",
      retryable: true,
      advance: true,
      countsAttempt: true,
      cooldown: "minute",
      keepTokenEstimate: true,
    });
  });

  it("stops the chain when the turn itself was aborted", () => {
    const error = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });

    expect(classifyProviderFailure(error, { turnAborted: true })).toMatchObject({
      kind: "cancelled",
      retryable: false,
      advance: false,
      countsAttempt: false,
      cooldown: "none",
      keepTokenEstimate: true,
    });
  });

  it("treats an unclassified abort as cancellation by default", () => {
    const error = Object.assign(new Error("aborted"), { name: "AbortError" });

    expect(classifyProviderFailure(error)).toMatchObject({
      kind: "cancelled",
      advance: false,
    });
  });

  it("advances past a request-shape rejection without a cooldown", () => {
    const result = classifyProviderFailure(
      new Error("unsupported property: reasoning_content"),
    );

    expect(result).toMatchObject({
      kind: "request_invalid",
      advance: true,
      countsAttempt: true,
      cooldown: "none",
      keepTokenEstimate: false,
    });
  });

  it("advances past a provider safety refusal", () => {
    const result = classifyProviderFailure(
      new Error("The prompt was blocked by the content policy"),
    );

    expect(result).toMatchObject({
      kind: "content_blocked",
      advance: true,
      countsAttempt: true,
      cooldown: "none",
      keepTokenEstimate: false,
    });
  });

  it("keeps the estimate after a server error that may have spent tokens", () => {
    const result = classifyProviderFailure(
      Object.assign(new Error("upstream failed"), { status: 503 }),
    );

    expect(result).toMatchObject({
      kind: "server",
      advance: true,
      cooldown: "minute",
      keepTokenEstimate: true,
    });
  });

  it("reads a 404 as a stale model even when the body mentions an API key", () => {
    const result = classifyProviderFailure(
      Object.assign(
        new Error("No endpoints found for the request; check the API key"),
        { status: 404 },
      ),
    );

    expect(result).toMatchObject({
      kind: "model_not_found",
      markModelDead: true,
      cooldown: "none",
    });
  });

  it("keeps a 429 with a daily-quota body scoped to the day", () => {
    const result = classifyProviderFailure(
      Object.assign(
        new Error("Rate limit exceeded: daily quota for this model"),
        { status: 429 },
      ),
    );

    expect(result).toMatchObject({
      kind: "quota",
      cooldown: "day",
      advance: true,
    });
  });
});
