import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDelete: vi.fn(),
  recordUsage: vi.fn(),
  recordTokens: vi.fn(),
  markExhausted: vi.fn(),
}));

vi.mock("ai", () => ({
  embed: mocks.embed,
  embedMany: mocks.embedMany,
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => ({
    embeddingModel: () => ({}),
  }),
}));
vi.mock("@/lib/ai/cache-layer", () => ({
  cacheLayer: {
    get: mocks.cacheGet,
    set: mocks.cacheSet,
    delete: mocks.cacheDelete,
  },
}));
vi.mock("@/lib/ai/capacity-selector", () => ({
  recordModelUsage: mocks.recordUsage,
  recordModelTokenUsageDetailed: mocks.recordTokens,
  markModelExhausted: mocks.markExhausted,
}));
vi.mock("@/lib/env", () => ({
  env: { GEMINI_API_KEY: "synthetic-test-key" },
  isGeminiConfigured: true,
}));

import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_ID } from "@/lib/ai/embedding-constants";
import { generateEmbedding, generateEmbeddings } from "@/lib/ai/embeddings";

function vector(seed = 0.1): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => seed);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.cacheDelete.mockResolvedValue(undefined);
  mocks.recordUsage.mockResolvedValue(undefined);
  mocks.recordTokens.mockResolvedValue(undefined);
  mocks.markExhausted.mockResolvedValue(undefined);
});

describe("embedding capacity accounting", () => {
  it("records a single embedding call and its token usage", async () => {
    mocks.embed.mockResolvedValue({ embedding: vector(), usage: { tokens: 17 } });

    const result = await generateEmbedding("hello", { maxAttempts: 1 });

    expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(mocks.recordUsage).toHaveBeenCalledWith(EMBEDDING_MODEL_ID);
    expect(mocks.recordTokens).toHaveBeenCalledWith(EMBEDDING_MODEL_ID, {
      inputTokens: 17,
      outputTokens: 0,
    });
  });

  it("does not record a cache hit as provider usage", async () => {
    const cached = vector(0.2);
    mocks.cacheGet.mockResolvedValue(cached);

    const result = await generateEmbedding("hello");

    expect(result).toBe(cached);
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.recordUsage).not.toHaveBeenCalled();
    expect(mocks.recordTokens).not.toHaveBeenCalled();
  });

  it("records a batch call once with the aggregate token count", async () => {
    const first = vector(0.3);
    const second = vector(0.4);
    mocks.embedMany.mockResolvedValue({
      embeddings: [first, second],
      usage: { tokens: 31 },
    });

    const result = await generateEmbeddings(["one", "two"], { maxAttempts: 1 });

    expect(result).toEqual([first, second]);
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledWith(EMBEDDING_MODEL_ID);
    expect(mocks.recordTokens).toHaveBeenCalledWith(EMBEDDING_MODEL_ID, {
      inputTokens: 31,
      outputTokens: 0,
    });
  });

  it("cools the embedding model when the provider fails", async () => {
    mocks.embed.mockRejectedValue(new Error("rate limited"));

    const result = await generateEmbedding("hello", { maxAttempts: 1 });

    expect(result).toBeNull();
    expect(mocks.markExhausted).toHaveBeenCalledWith(
      EMBEDDING_MODEL_ID,
      expect.any(Error),
    );
  });
});
