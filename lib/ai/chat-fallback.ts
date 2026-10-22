import "server-only";

import { CHAT_MAX_ATTEMPTS } from "@/lib/ai/capacity-selector";
import {
  createFallbackLanguageModel,
  type FallbackAttemptTrailEntry,
} from "@/lib/ai/fallback-model";
import { providerTimeoutMs, selectModels } from "@/lib/ai/router";
import { noModelsAvailableError } from "@/lib/ai/routing-errors";
import type { AiRoutingProfile } from "@/lib/ai/routing-profiles";

/**
 * Model resolution with fallback for the AI chat orchestrators.
 *
 * Both chat surfaces run the same sequence: select candidate models for
 * their routing profile, fail fast when none fit, and serve the turn through
 * the fallback wrapper. The wrapper reserves provider quota per step and
 * settles it against the provider's reported usage, so the orchestrators do
 * not correct counters afterwards. Profiles, budgets, tools, prompts, and
 * persistence stay in the orchestrators — only the identical mechanics live
 * here.
 */

/**
 * Budget for one model step, covering every fallback attempt inside it.
 * A step is one `streamText` model call; a five-step tool turn still gets a
 * fresh budget per step. Four provider timeouts (15–30 s each) fit inside it.
 */
const CHAT_STEP_DEADLINE_MS = 90_000;

export type ChatServingModel = {
  modelId: string;
  provider: string;
  model: string;
};

export type ChatFallbackResolution = {
  fallbackModel: ReturnType<typeof createFallbackLanguageModel>;
  /** Live serving identity; fields mutate as fallback advances steps. */
  serving: ChatServingModel;
  attemptTrail: FallbackAttemptTrailEntry[];
};

export async function resolveChatFallbackModel(input: {
  profile: AiRoutingProfile;
  estimatedTokens: number;
}): Promise<ChatFallbackResolution> {
  const selectedModels = await selectModels({
    profile: input.profile,
    estimatedTokens: input.estimatedTokens,
  });

  if (selectedModels.length === 0) {
    throw noModelsAvailableError(input.profile);
  }

  const firstId = selectedModels[0];
  const firstColon = firstId.indexOf(":");
  const serving: ChatServingModel = {
    modelId: firstId,
    provider: firstColon >= 0 ? firstId.slice(0, firstColon) : firstId,
    model: firstColon >= 0 ? firstId.slice(firstColon + 1) : firstId,
  };
  const attemptTrail: FallbackAttemptTrailEntry[] = [];

  const fallbackModel = createFallbackLanguageModel({
    modelIds: selectedModels,
    maxAttempts: CHAT_MAX_ATTEMPTS,
    estimatedTokens: input.estimatedTokens,
    deadlineMs: CHAT_STEP_DEADLINE_MS,
    getTimeoutMs: ({ provider }) => providerTimeoutMs(provider),
    onModelSelected: (selected) => {
      serving.modelId = selected.modelId;
      serving.provider = selected.provider;
      serving.model = selected.model;
    },
    onAttemptFailed: (selected, error) => {
      attemptTrail.push({
        modelId: selected.modelId,
        reason:
          error instanceof Error ? error.message.slice(0, 200) : "unknown error",
      });
    },
  });

  return { fallbackModel, serving, attemptTrail };
}
