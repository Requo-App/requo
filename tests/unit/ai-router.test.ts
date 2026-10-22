import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LanguageModelV3,
  LanguageModelV3GenerateResult,
} from "@ai-sdk/provider";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
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

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  streamText: mocks.streamText,
  // The fallback wrapper applies middleware; the test does not exercise it.
  wrapLanguageModel: ({ model }: { model: LanguageModelV3 }) => model,
}));

vi.mock("@/lib/ai/registry", () => ({
  registry: { languageModel: mocks.languageModel },
}));

vi.mock("@/lib/ai/capacity-selector", () => ({
  selectModels: mocks.select,
  CHAT_MAX_ATTEMPTS: 5,
  NON_CHAT_MAX_ATTEMPTS: 2,
  isModelDead: async () => false,
  markModelDead: mocks.markDead,
  markModelExhausted: mocks.markExhausted,
  recordModelFailure: mocks.recordFailure,
  recordModelSuccess: mocks.recordSuccess,
  reserveModelCapacity: mocks.reserve,
}));

import { generateWithFallback } from "@/lib/ai/router";
import { AiProviderError } from "@/lib/ai/errors";
import type { AiCompletionRequest } from "@/lib/ai/types";

const RESULT_USAGE = {
  inputTokens: {
    total: 4,
    noCache: 4,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 2, text: 2, reasoning: undefined },
};

function model(
  doGenerate: LanguageModelV3["doGenerate"],
): LanguageModelV3 {
  return {
    specificationVersion: "v3",
    provider: "test",
    modelId: "test",
    supportedUrls: {},
    doGenerate,
    doStream: vi.fn(),
  };
}

function generated(usage = RESULT_USAGE): LanguageModelV3GenerateResult {
  return {
    content: [{ type: "text", text: "Hello" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage,
    warnings: [],
  };
}

const request: AiCompletionRequest = {
  messages: [{ role: "user", content: "Hi" }],
  temperature: 0.2,
  maxOutputTokens: 100,
  routingProfile: "short_text",
  estimatedTokens: 100,
};

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
  mocks.reserve.mockImplementation(
    async (modelId: string, estimatedTokens: number) => ({
      modelId,
      estimatedTokens,
      settle: mocks.settle,
      releaseTokens: mocks.releaseTokens,
      rollback: mocks.rollback,
    }),
  );
  // Stand in for the SDK: run the model once and surface its usage/text.
  mocks.generateText.mockImplementation(
    async ({ model: languageModel }: { model: LanguageModelV3 }) => {
      const result = await languageModel.doGenerate({ prompt: [] });
      const text =
        result.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("") ?? "";
      // The real SDK normalises provider usage into flat token counts.
      return {
        text,
        usage: {
          inputTokens: result.usage.inputTokens?.total ?? 0,
          outputTokens: result.usage.outputTokens?.total ?? 0,
        },
        raw: result,
      };
    },
  );
});

describe("generateWithFallback", () => {
  it("reserves capacity and falls back to the next candidate", async () => {
    mocks.languageModel.mockImplementation((id: string) =>
      model(async () => {
        if (id === "groq:first") {
          throw Object.assign(new Error("rate limit exceeded"), {
            status: 429,
          });
        }
        return generated();
      }),
    );

    const result = await generateWithFallback(request);

    expect(result).toMatchObject({
      provider: "openrouter",
      model: "second",
      text: "Hello",
      usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
    });
    expect(mocks.reserve).toHaveBeenNthCalledWith(1, "groq:first", 100);
    expect(mocks.reserve).toHaveBeenNthCalledWith(2, "openrouter:second", 100);
    expect(mocks.settle).toHaveBeenCalledWith({ inputTokens: 4, outputTokens: 2 });
    expect(mocks.recordFailure).toHaveBeenCalledWith("groq:first", "rate_limit");
    expect(mocks.markExhausted).toHaveBeenCalledWith(
      "groq:first",
      expect.any(Error),
      { turnAborted: false },
    );
  });

  it("throws a provider error carrying the last attempted provider", async () => {
    const failure = Object.assign(new Error("service unavailable"), {
      status: 503,
    });
    mocks.languageModel.mockReturnValue(
      model(async () => {
        throw failure;
      }),
    );

    await expect(generateWithFallback(request)).rejects.toMatchObject({
      name: "AiProviderError",
      provider: "openrouter",
      statusCode: 503,
      message: "service unavailable",
    });
    await expect(generateWithFallback(request)).rejects.toBeInstanceOf(
      AiProviderError,
    );
  });

  it("does not retry the same candidate inside the SDK", async () => {
    mocks.languageModel.mockReturnValue(model(async () => generated()));

    await generateWithFallback(request);

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
  });
});
