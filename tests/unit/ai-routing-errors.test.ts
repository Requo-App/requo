import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: {
    groq: false,
    gemini: false,
    openrouter: false,
    cloudflare: false,
    nvidia: false,
  },
}));

vi.mock("@/lib/env", () => ({
  get isGroqConfigured() {
    return mocks.configured.groq;
  },
  get isGeminiConfigured() {
    return mocks.configured.gemini;
  },
  get isOpenRouterConfigured() {
    return mocks.configured.openrouter;
  },
  get isCloudflareAiConfigured() {
    return mocks.configured.cloudflare;
  },
  get isNvidiaNimConfigured() {
    return mocks.configured.nvidia;
  },
}));

import {
  NO_CAPACITY_MESSAGE,
  NO_ELIGIBLE_MODEL_MESSAGE,
  NO_PROVIDER_MESSAGE,
  hasEligibleConfiguredModel,
  isNoModelsAvailableMessage,
  noModelsAvailableError,
} from "@/lib/ai/routing-errors";

const providerFlags = Object.keys(mocks.configured) as Array<
  keyof typeof mocks.configured
>;

beforeEach(() => {
  for (const provider of providerFlags) {
    mocks.configured[provider] = false;
  }
});

describe("noModelsAvailableError", () => {
  it("reports missing provider configuration", () => {
    expect(noModelsAvailableError("assistant_chat").message).toBe(
      NO_PROVIDER_MESSAGE,
    );
  });

  it("reports exhausted capacity when an eligible provider is configured", () => {
    mocks.configured.groq = true;

    expect(hasEligibleConfiguredModel("assistant_chat")).toBe(true);
    expect(noModelsAvailableError("assistant_chat").message).toBe(
      NO_CAPACITY_MESSAGE,
    );
  });

  it("reports an ineligible profile instead of blaming exhausted quotas", () => {
    mocks.configured.groq = true;

    expect(hasEligibleConfiguredModel("quote_draft")).toBe(false);
    expect(noModelsAvailableError("quote_draft").message).toBe(
      NO_ELIGIBLE_MODEL_MESSAGE,
    );
  });

  it("treats a provider that fails the profile's tool requirement as ineligible", () => {
    mocks.configured.nvidia = true;

    expect(hasEligibleConfiguredModel("assistant_chat")).toBe(false);
    expect(noModelsAvailableError("assistant_chat").message).toBe(
      NO_ELIGIBLE_MODEL_MESSAGE,
    );
  });

  it("does not count a configured provider that is absent from the profile chain", () => {
    mocks.configured.groq = true;

    expect(hasEligibleConfiguredModel("extraction")).toBe(false);
    expect(noModelsAvailableError("extraction").message).toBe(
      NO_ELIGIBLE_MODEL_MESSAGE,
    );
  });
});

describe("isNoModelsAvailableMessage", () => {
  it("recognizes every routing diagnostic and the legacy chat message", () => {
    expect(isNoModelsAvailableMessage(NO_PROVIDER_MESSAGE)).toBe(true);
    expect(isNoModelsAvailableMessage(NO_CAPACITY_MESSAGE)).toBe(true);
    expect(isNoModelsAvailableMessage(NO_ELIGIBLE_MODEL_MESSAGE)).toBe(true);
    expect(isNoModelsAvailableMessage("No suitable AI model available")).toBe(
      true,
    );
    expect(isNoModelsAvailableMessage("providers unavailable")).toBe(false);
  });
});
