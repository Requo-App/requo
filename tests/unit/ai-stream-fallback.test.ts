import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelV3, LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";

const mocks = vi.hoisted(() => ({
  languageModel: vi.fn(),
  select: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  releaseTokens: vi.fn(),
  rollback: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  markExhausted: vi.fn(),
  markDead: vi.fn(),
}));
vi.mock("@/lib/ai/registry", () => ({
  registry: { languageModel: mocks.languageModel }, groq: {}, openrouter: {},
  google: null, cloudflare: null, nvidia: null,
  isAiConfigured: () => true,
}));
vi.mock("@/lib/ai/capacity-selector", () => ({
  selectModels: mocks.select, CHAT_MAX_ATTEMPTS: 2, NON_CHAT_MAX_ATTEMPTS: 2,
  isModelDead: async () => false, markModelDead: mocks.markDead,
  markModelExhausted: mocks.markExhausted,
  recordModelFailure: mocks.recordFailure,
  recordModelSuccess: mocks.recordSuccess,
  reserveModelCapacity: mocks.reserve,
}));

import { streamWithFallback } from "@/lib/ai/router";
import { createFallbackLanguageModel } from "@/lib/ai/fallback-model";
import type { AiCompletionRequest, AiStreamChunk } from "@/lib/ai/types";

const finish: LanguageModelV3StreamPart = {
  type: "finish", finishReason: { unified: "stop", raw: "stop" },
  usage: {
    inputTokens: { total: 4, noCache: 4, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 2, text: 2, reasoning: undefined },
  },
};
function stream(...parts: LanguageModelV3StreamPart[]) {
  return { stream: new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) { parts.forEach((part) => controller.enqueue(part)); controller.close(); },
  }) };
}
function model(doStream: LanguageModelV3["doStream"]): LanguageModelV3 {
  return {
    specificationVersion: "v3", provider: "test", modelId: "test", supportedUrls: {},
    doGenerate: vi.fn(), doStream,
  };
}
function success() {
  return stream(
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: "Hello" },
    { type: "text-end", id: "text-1" }, finish,
  );
}
const request: AiCompletionRequest = {
  messages: [{ role: "user", content: "Hi" }], temperature: 0.2,
  maxOutputTokens: 100, estimatedTokens: 10,
};
const callOptions: LanguageModelV3CallOptions = { prompt: [] };
async function consume(chunks: AsyncIterable<AiStreamChunk>) {
  const seen: AiStreamChunk[] = [];
  for await (const chunk of chunks) seen.push(chunk);
  return seen;
}
async function drain(stream: ReadableStream<LanguageModelV3StreamPart>) {
  const parts: LanguageModelV3StreamPart[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return parts;
    parts.push(value);
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockResolvedValue(["groq:first", "openrouter:second"]);
  mocks.settle.mockResolvedValue(undefined);
  mocks.releaseTokens.mockResolvedValue(undefined);
  mocks.rollback.mockResolvedValue(undefined);
  mocks.recordSuccess.mockResolvedValue(undefined);
  mocks.recordFailure.mockResolvedValue(undefined);
  mocks.markExhausted.mockResolvedValue(undefined);
  mocks.markDead.mockResolvedValue(undefined);
  mocks.reserve.mockImplementation(async (modelId: string, estimatedTokens: number) => ({
    modelId,
    estimatedTokens,
    settle: mocks.settle,
    releaseTokens: mocks.releaseTokens,
    rollback: mocks.rollback,
  }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("stream failure propagation", () => {
  it("throws when every fallback candidate fails and never yields stop", async () => {
    const failure = new Error("providers unavailable");
    mocks.languageModel.mockReturnValue(model(async () => { throw failure; }));
    const result = await streamWithFallback(request);
    const chunks: AiStreamChunk[] = [];
    await expect((async () => {
      for await (const chunk of result.stream) chunks.push(chunk);
    })()).rejects.toThrow("providers unavailable");
    expect(chunks.some((chunk) => chunk.finishReason === "stop")).toBe(false);
    // The SDK must not re-walk the candidate chain: one dispatch per
    // candidate, not one chain per SDK retry.
    expect(mocks.languageModel).toHaveBeenCalledTimes(2);
  });

  it("throws a reported midstream error while retaining partial text and the conservative hold", async () => {
    const failure = new Error("stream broke");
    mocks.languageModel.mockReturnValue(model(async () => stream(
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "Partial" },
      { type: "error", error: failure },
      { type: "text-end", id: "text-1" }, finish,
    )));
    const result = await streamWithFallback(request);
    const chunks: AiStreamChunk[] = [];
    await expect((async () => {
      for await (const chunk of result.stream) chunks.push(chunk);
    })()).rejects.toThrow("stream broke");
    expect(chunks).toEqual([{ delta: "Partial", finishReason: null }]);
    // Usage is unknown after an in-band error: keep the estimate rather than
    // pretending the provider spent nothing.
    expect(mocks.settle).toHaveBeenCalledWith();
    expect(mocks.recordFailure).toHaveBeenCalledWith("groq:first", "unknown");
    expect(mocks.recordSuccess).not.toHaveBeenCalled();
  });

  it("stops preferring a candidate after its stream fails mid-flight", async () => {
    let firstCalls = 0;
    let secondCalls = 0;
    mocks.languageModel.mockImplementation((id: string) => model(async () => {
      if (id === "groq:first") {
        firstCalls += 1;
        if (firstCalls === 1) throw new Error("first failed");
        return success();
      }
      secondCalls += 1;
      if (secondCalls === 1) return success();
      return stream(
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "Partial" },
        { type: "error", error: new Error("mid-stream failure") },
        { type: "text-end", id: "text-1" },
        finish,
      );
    }));
    const fallback = createFallbackLanguageModel({
      modelIds: ["groq:first", "openrouter:second"],
      maxAttempts: 2,
      getTimeoutMs: () => 1_000,
    });

    // Step 1: groq fails immediately, so openrouter becomes preferred.
    await drain((await fallback.doStream(callOptions)).stream);
    // Step 2: the preferred openrouter stream fails mid-flight.
    await drain((await fallback.doStream(callOptions)).stream);
    // Step 3: preference was cleared, so groq gets the first attempt again.
    await drain((await fallback.doStream(callOptions)).stream);

    expect(mocks.languageModel.mock.calls.map(([id]) => id).slice(-2)).toEqual([
      "openrouter:second",
      "groq:first",
    ]);
  });

  it("records a mid-stream per-candidate timeout as a failure, not a cancellation", async () => {
    let openrouterCalls = 0;
    const timeoutStream = () => {
      let sent = false;
      return {
        // Error on the second pull so the failure happens mid-stream, after
        // the head part has already been delivered to the consumer.
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          pull(controller) {
            if (!sent) {
              sent = true;
              controller.enqueue({
                type: "text-delta",
                id: "text-1",
                delta: "Partial",
              });
              return;
            }
            controller.error(
              Object.assign(new Error("The operation was aborted"), {
                name: "TimeoutError",
              }),
            );
          },
        }),
      };
    };
    mocks.languageModel.mockImplementation((id: string) =>
      model(async () => {
        if (id === "groq:first") {
          throw Object.assign(new Error("Rate limit exceeded"), { status: 429 });
        }
        openrouterCalls += 1;
        return openrouterCalls === 2 ? timeoutStream() : success();
      }),
    );
    const fallback = createFallbackLanguageModel({
      modelIds: ["groq:first", "openrouter:second"],
      maxAttempts: 2,
    });

    // Step 1: groq is rate limited, so openrouter becomes the preferred model.
    await drain((await fallback.doStream(callOptions)).stream);
    // Step 2: openrouter's provider budget fires mid-stream.
    await expect(
      drain((await fallback.doStream(callOptions)).stream),
    ).rejects.toThrow("aborted");
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      "openrouter:second",
      "timeout",
    );
    expect(mocks.recordFailure).not.toHaveBeenCalledWith(
      "openrouter:second",
      "cancelled",
    );
    // Step 3: the failure cleared the preference, so groq is tried first again.
    await drain((await fallback.doStream(callOptions)).stream);

    expect(mocks.languageModel.mock.calls.map(([id]) => id).slice(-2)).toEqual([
      "groq:first",
      "openrouter:second",
    ]);
  });

  it("skips the rest of a provider after its credential is rejected", async () => {
    mocks.select.mockResolvedValue([
      "groq:first",
      "groq:second",
      "openrouter:third",
    ]);
    mocks.languageModel.mockImplementation((id: string) =>
      model(async () => {
        if (id === "groq:first") {
          throw Object.assign(new Error("Invalid API key"), { status: 401 });
        }
        if (id === "groq:second") throw new Error("must not be attempted");
        return success();
      }),
    );
    const fallback = createFallbackLanguageModel({
      modelIds: ["groq:first", "groq:second", "openrouter:third"],
      maxAttempts: 3,
    });

    await drain((await fallback.doStream(callOptions)).stream);

    // The second groq model shares the bad key: it is skipped without
    // spending the attempt budget, and the chain reaches openrouter.
    expect(mocks.languageModel.mock.calls.map(([id]) => id)).toEqual([
      "groq:first",
      "openrouter:third",
    ]);
  });

  it("reports a capacity refusal instead of silently skipping the candidate", async () => {
    mocks.reserve.mockImplementationOnce(async () => null);
    mocks.languageModel.mockReturnValue(model(async () => success()));
    const attempts: string[] = [];
    const fallback = createFallbackLanguageModel({
      modelIds: ["groq:first", "openrouter:second"],
      maxAttempts: 2,
      onAttemptFailed: (selected) => attempts.push(selected.modelId),
    });

    await drain((await fallback.doStream(callOptions)).stream);

    expect(attempts).toEqual(["groq:first"]);
    expect(mocks.languageModel).toHaveBeenCalledOnce();
    expect(mocks.languageModel).toHaveBeenCalledWith("openrouter:second");
  });

  it("emits stop and settles real usage after a successful fallback", async () => {
    mocks.languageModel.mockImplementation((id: string) => model(async () => {
      if (id === "groq:first") throw new Error("first failed");
      return success();
    }));
    const result = await streamWithFallback(request);
    expect(await consume(result.stream)).toEqual([
      { delta: "Hello", finishReason: null }, { delta: "", finishReason: "stop" },
    ]);
    expect(mocks.settle).toHaveBeenCalledWith({ inputTokens: 4, outputTokens: 2 });
    expect(mocks.recordSuccess).toHaveBeenCalledWith("openrouter:second", expect.any(Number));
    expect(mocks.markExhausted).toHaveBeenCalledWith(
      "groq:first",
      expect.any(Error),
      { turnAborted: false },
    );
  });

});

describe("per-candidate timeouts", () => {
  it.each(["dispatch", "head"])("uses independent provider budgets when the first %s times out", async (stage) => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    mocks.languageModel.mockImplementation((id: string) => model(async (options) => {
      signals.push(options.abortSignal!);
      if (id === "groq:first") {
        if (stage === "dispatch") {
          await new Promise<void>((_, reject) => {
            options.abortSignal!.addEventListener("abort", () => reject(options.abortSignal!.reason), { once: true });
          });
        } else {
          return { stream: new ReadableStream<LanguageModelV3StreamPart>({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              options.abortSignal!.addEventListener("abort", () => controller.error(options.abortSignal!.reason), { once: true });
            },
          }) };
        }
      }
      return success();
    }));
    const fallback = createFallbackLanguageModel({
      modelIds: ["groq:first", "openrouter:second"],
      getTimeoutMs: ({ provider }) => provider === "groq" ? 15_000 : 30_000,
    });
    const pending = fallback.doStream(callOptions);
    await vi.advanceTimersByTimeAsync(15_000);
    await drain((await pending).stream);
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(signals[1].aborted).toBe(false);
  });

  it.each(["head", "clean end"])("clears the provider timer after a non-error %s while retaining the step deadline", async (kind) => {
    vi.useFakeTimers();
    // Control the uncancellable step deadline separately from provider timers.
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    let signal: AbortSignal | undefined;
    let source: ReadableStreamDefaultController<LanguageModelV3StreamPart> | undefined;
    mocks.languageModel.mockReturnValue(model(async (options) => {
      signal = options.abortSignal;
      return { stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          source = controller;
          signal!.addEventListener("abort", () => controller.error(signal!.reason), { once: true });
          controller.enqueue({ type: "stream-start", warnings: [] });
          if (kind === "clean end") controller.close();
          else controller.enqueue({ type: "text-start", id: "text-1" });
        },
      }) };
    }));
    const fallback = createFallbackLanguageModel({
      modelIds: ["groq:first"], deadlineMs: 90_000, getTimeoutMs: () => 15_000,
    });
    const result = await fallback.doStream(callOptions);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(signal!.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(timeout.mock.calls).toEqual([[90_000]]);

    if (kind === "clean end") {
      expect(await drain(result.stream)).toEqual([{ type: "stream-start", warnings: [] }]);
    } else {
      // Streaming still progresses after the provider timeout budget elapses.
      source!.enqueue({ type: "text-delta", id: "text-1", delta: "Still streaming" });
      const consumed = drain(result.stream);
      deadline.abort(new DOMException("Step deadline", "TimeoutError"));
      await expect(consumed).rejects.toThrow("Step deadline");
      expect(signal!.aborted).toBe(true);
      expect(mocks.recordFailure).not.toHaveBeenCalled();
    }
  });

  it.each(["dispatch", "read", "error head"])("clears the provider timer after a %s failure", async (kind) => {
    vi.useFakeTimers();
    const failure = new Error("provider failed");
    let signal: AbortSignal | undefined;
    mocks.languageModel.mockReturnValue(model(async (options) => {
      signal = options.abortSignal;
      if (kind === "dispatch") throw failure;
      if (kind === "error head") return stream({ type: "error", error: failure });
      return { stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) { controller.error(failure); },
      }) };
    }));
    const fallback = createFallbackLanguageModel({
      modelIds: ["groq:first"], getTimeoutMs: () => 15_000,
    });
    await expect(fallback.doStream(callOptions)).rejects.toThrow("provider failed");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(signal!.aborted).toBe(false);
  });

  it.each([false, true])("clears the generation timer on completion (failure: %s)", async (fails) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const provider = model(async () => success());
    provider.doGenerate = vi.fn<LanguageModelV3["doGenerate"]>(async (options) => {
      signal = options.abortSignal;
      if (fails) throw new Error("generation failed");
      return { content: [], finishReason: { unified: "stop", raw: "stop" }, usage: finish.usage, warnings: [] };
    });
    mocks.languageModel.mockReturnValue(provider);
    const fallback = createFallbackLanguageModel({
      modelIds: ["groq:first"], getTimeoutMs: () => 15_000,
    });
    if (fails) await expect(fallback.doGenerate(callOptions)).rejects.toThrow("generation failed");
    else await fallback.doGenerate(callOptions);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(signal!.aborted).toBe(false);
  });

  it("combines caller cancellation with the attempt timeout and stops fallback", async () => {
    const caller = new AbortController();
    mocks.languageModel.mockReturnValue(model(async (options) => {
      expect(options.abortSignal).not.toBe(caller.signal);
      caller.abort(new Error("visitor cancelled"));
      expect(options.abortSignal!.aborted).toBe(true);
      options.abortSignal!.throwIfAborted();
      return success();
    }));
    const fallback = createFallbackLanguageModel({
      modelIds: ["groq:first", "openrouter:second"], getTimeoutMs: () => 1000,
    });
    await expect(fallback.doStream({ ...callOptions, abortSignal: caller.signal })).rejects.toThrow("visitor cancelled");
    expect(mocks.languageModel).toHaveBeenCalledOnce();
  });

  it("passes router caller cancellation to the provider", async () => {
    const caller = new AbortController();
    mocks.languageModel.mockReturnValue(model(async (options) => {
      caller.abort(new Error("cancelled through router"));
      options.abortSignal!.throwIfAborted();
      return success();
    }));
    const result = await streamWithFallback({ ...request, abortSignal: caller.signal });
    await expect(consume(result.stream)).rejects.toThrow();
    expect(mocks.languageModel).toHaveBeenCalledOnce();
  });
});
