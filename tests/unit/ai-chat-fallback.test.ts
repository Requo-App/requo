import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectModels: vi.fn(),
  createFallbackLanguageModel: vi.fn(() => ({})),
  configured: { groq: false },
}));

vi.mock("@/lib/ai/router", () => ({
  selectModels: mocks.selectModels,
  providerTimeoutMs: () => 15_000,
}));

vi.mock("@/lib/ai/capacity-selector", () => ({
  CHAT_MAX_ATTEMPTS: 5,
}));

vi.mock("@/lib/ai/fallback-model", () => ({
  createFallbackLanguageModel: mocks.createFallbackLanguageModel,
}));

vi.mock("@/lib/env", () => ({
  get isGroqConfigured() {
    return mocks.configured.groq;
  },
  isGeminiConfigured: false,
  isOpenRouterConfigured: false,
  isCloudflareAiConfigured: false,
  isNvidiaNimConfigured: false,
}));

import { resolveChatFallbackModel } from "@/lib/ai/chat-fallback";
import {
  NO_CAPACITY_MESSAGE,
  NO_PROVIDER_MESSAGE,
} from "@/lib/ai/routing-errors";

beforeEach(() => {
  mocks.selectModels.mockReset();
  mocks.createFallbackLanguageModel.mockClear();
  mocks.configured.groq = true;
});

describe("resolveChatFallbackModel", () => {
  it("uses the shared capacity diagnostic when no model is selectable", async () => {
    mocks.selectModels.mockResolvedValue([]);

    await expect(
      resolveChatFallbackModel({
        profile: "assistant_chat",
        estimatedTokens: 100,
      }),
    ).rejects.toThrow(NO_CAPACITY_MESSAGE);
  });

  it("uses the shared missing-provider diagnostic when nothing is configured", async () => {
    mocks.configured.groq = false;
    mocks.selectModels.mockResolvedValue([]);

    await expect(
      resolveChatFallbackModel({
        profile: "assistant_chat",
        estimatedTokens: 100,
      }),
    ).rejects.toThrow(NO_PROVIDER_MESSAGE);
  });
});
