import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHAT_MAX_ATTEMPTS } from "@/lib/ai/capacity-selector";

const {
  selectModelsMock,
  createFallbackLanguageModelMock,
  correctTokenUsageMock,
} = vi.hoisted(() => ({
  selectModelsMock: vi.fn(),
  createFallbackLanguageModelMock: vi.fn(),
  correctTokenUsageMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/ai/router", () => ({
  selectModels: selectModelsMock,
}));

vi.mock("@/lib/ai/fallback-model", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@/lib/ai/fallback-model")>();
  return { ...mod, createFallbackLanguageModel: createFallbackLanguageModelMock };
});

vi.mock("@/lib/ai/capacity-selector", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@/lib/ai/capacity-selector")>();
  return { ...mod, correctTokenUsage: correctTokenUsageMock };
});

import { resolveChatFallbackModel } from "@/lib/ai/chat-fallback";
import type { createFallbackLanguageModel as createFallbackLanguageModelType } from "@/lib/ai/fallback-model";

type FallbackOpts = Parameters<typeof createFallbackLanguageModelType>[0];

function stubModel() {
  // Opaque stand-in: the helper threads it through without inspecting it.
  return {} as ReturnType<typeof createFallbackLanguageModelType>;
}

describe("resolveChatFallbackModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectModelsMock.mockResolvedValue(["groq:model-a", "cerebras:model-b"]);
    createFallbackLanguageModelMock.mockReturnValue(stubModel());
  });

  it("selects models for the given profile and estimate", async () => {
    await resolveChatFallbackModel({
      profile: "agent_chat",
      estimatedTokens: 1234,
    });

    expect(selectModelsMock).toHaveBeenCalledWith({
      profile: "agent_chat",
      estimatedTokens: 1234,
    });
  });

  it("fails fast when no model fits", async () => {
    selectModelsMock.mockResolvedValue([]);

    await expect(
      resolveChatFallbackModel({
        profile: "assistant_chat",
        estimatedTokens: 100,
      }),
    ).rejects.toThrow("No suitable AI model available");
    expect(createFallbackLanguageModelMock).not.toHaveBeenCalled();
  });

  it("serves the first candidate until fallback advances", async () => {
    const resolution = await resolveChatFallbackModel({
      profile: "assistant_chat",
      estimatedTokens: 500,
    });

    expect(resolution.serving).toEqual({
      modelId: "groq:model-a",
      provider: "groq",
      model: "model-a",
    });
    expect(resolution.attemptTrail).toEqual([]);
    expect(resolution.fallbackModel).toBe(
      createFallbackLanguageModelMock.mock.results[0]?.value,
    );

    const opts: FallbackOpts =
      createFallbackLanguageModelMock.mock.calls[0]?.[0];
    expect(opts.modelIds).toEqual(["groq:model-a", "cerebras:model-b"]);
    expect(opts.maxAttempts).toBe(CHAT_MAX_ATTEMPTS);
    expect(opts.estimatedTokens).toBe(500);
  });

  it("tracks serving-model switches and failed attempts", async () => {
    const resolution = await resolveChatFallbackModel({
      profile: "agent_chat",
      estimatedTokens: 500,
    });
    const opts: FallbackOpts =
      createFallbackLanguageModelMock.mock.calls[0]?.[0];

    opts.onModelSelected?.({
      modelId: "cerebras:model-b",
      provider: "cerebras",
      model: "model-b",
    });
    expect(resolution.serving).toEqual({
      modelId: "cerebras:model-b",
      provider: "cerebras",
      model: "model-b",
    });

    opts.onAttemptFailed?.(
      { modelId: "groq:model-a", provider: "groq", model: "model-a" },
      new Error("x".repeat(300)),
    );
    expect(resolution.attemptTrail).toEqual([
      { modelId: "groq:model-a", reason: "x".repeat(200) },
    ]);

    opts.onAttemptFailed?.(
      { modelId: "groq:model-a", provider: "groq", model: "model-a" },
      "boom",
    );
    expect(resolution.attemptTrail[1]).toEqual({
      modelId: "groq:model-a",
      reason: "unknown error",
    });
  });

  it("corrects usage against the serving model without failing the turn", async () => {
    correctTokenUsageMock.mockRejectedValueOnce(new Error("db down"));
    const resolution = await resolveChatFallbackModel({
      profile: "agent_chat",
      estimatedTokens: 500,
    });

    expect(() => resolution.correctUsage(10, 20)).not.toThrow();
    expect(correctTokenUsageMock).toHaveBeenCalledWith(
      "groq:model-a",
      500,
      { inputTokens: 10, outputTokens: 20 },
    );
  });
});
