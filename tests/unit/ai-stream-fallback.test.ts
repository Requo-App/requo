import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelV3, LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";

const mocks = vi.hoisted(() => ({
  languageModel: vi.fn(), select: vi.fn(), correct: vi.fn(), recordUsage: vi.fn(), recordTokens: vi.fn(),
  quotaState: vi.fn(),
}));
vi.mock("@/lib/ai/registry", () => ({
  registry: { languageModel: mocks.languageModel }, groq: {}, openrouter: {},
  google: null, cloudflare: null, nvidia: null,
  isAiConfigured: () => true,
}));
vi.mock("@/lib/ai/capacity-selector", () => ({
  selectModels: mocks.select, CHAT_MAX_ATTEMPTS: 2, NON_CHAT_MAX_ATTEMPTS: 2,
  correctTokenUsage: mocks.correct, recordModelUsage: mocks.recordUsage,
  recordModelTokenUsage: mocks.recordTokens, isModelDead: async () => false,
  getModelQuotaState: mocks.quotaState,
  markModelDead: vi.fn(), markModelExhausted: vi.fn(),
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
  model: "", messages: [{ role: "user", content: "Hi" }], temperature: 0.2,
  maxOutputTokens: 100, estimatedTokens: 10,
};
const callOptions: LanguageModelV3CallOptions = { prompt: [] };
async function consume(chunks: AsyncIterable<AiStreamChunk>) {
  const seen: AiStreamChunk[] = [];
  for await (const chunk of chunks) seen.push(chunk);
  return seen;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockResolvedValue(["groq:first", "openrouter:second"]);
  mocks.quotaState.mockResolvedValue("available");
});
afterEach(() => { vi.restoreAllMocks(); });

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
  });

  it("throws a reported midstream error while retaining partial text and settling usage", async () => {
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
    expect(mocks.correct).toHaveBeenCalledWith("groq:first", 10, { inputTokens: 4, outputTokens: 2 });
  });

  it("emits stop and corrects token usage after a successful fallback", async () => {
    mocks.languageModel.mockImplementation((id: string) => model(async () => {
      if (id === "groq:first") throw new Error("first failed");
      return success();
    }));
    const result = await streamWithFallback(request);
    expect(await consume(result.stream)).toEqual([
      { delta: "Hello", finishReason: null }, { delta: "", finishReason: "stop" },
    ]);
    expect(mocks.correct).toHaveBeenCalledWith("openrouter:second", 10, { inputTokens: 4, outputTokens: 2 });
  });

  it("propagates errors on the pinned provider path", async () => {
    mocks.languageModel.mockReturnValue(model(async () => { throw new Error("pinned failed"); }));
    const result = await streamWithFallback({ ...request, provider: "groq", model: "openai/gpt-oss-120b" });
    await expect(consume(result.stream)).rejects.toThrow("pinned failed");
  });

  it("refuses a pinned model outside the free-tier catalog before calling a provider", async () => {
    const result = streamWithFallback({
      ...request, provider: "groq", model: "llama-3.3-70b-versatile",
    });
    await expect(result).rejects.toThrow("not in the free-tier catalog");
    expect(mocks.languageModel).not.toHaveBeenCalled();
  });

  it("refuses a pinned model at its free-tier quota before calling a provider", async () => {
    mocks.quotaState.mockResolvedValue("exhausted");
    const result = streamWithFallback({
      ...request, provider: "groq", model: "openai/gpt-oss-120b",
    });
    await expect(result).rejects.toThrow("free-tier quota");
    expect(mocks.languageModel).not.toHaveBeenCalled();
  });
});

describe("per-candidate timeouts", () => {
  it("uses independent provider budgets when the first attempt times out", async () => {
    const controllers: AbortController[] = [];
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const controller = new AbortController(); controllers.push(controller); return controller.signal;
    });
    const signals: AbortSignal[] = [];
    mocks.languageModel.mockImplementation((id: string) => model(async (options) => {
      signals.push(options.abortSignal!);
      if (id === "groq:first") {
        controllers[0].abort(new DOMException("timeout", "TimeoutError"));
        options.abortSignal!.throwIfAborted();
      }
      expect(options.abortSignal!.aborted).toBe(false);
      return success();
    }));
    const result = await streamWithFallback(request);
    expect((await consume(result.stream)).at(-1)?.finishReason).toBe("stop");
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([15_000, 30_000]);
    expect(signals[0]).not.toBe(signals[1]);
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
