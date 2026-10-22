import "server-only";

import { CHAT_MAX_ATTEMPTS, correctTokenUsage } from "@/lib/ai/capacity-selector";
import {
  createFallbackLanguageModel,
  type FallbackAttemptTrailEntry,
} from "@/lib/ai/fallback-model";
import { selectModels } from "@/lib/ai/router";
import { noModelsAvailableError } from "@/lib/ai/routing-errors";
import type { AiRoutingProfile } from "@/lib/ai/routing-profiles";

/**
 * Model resolution with fallback for the AI chat orchestrators.
 *
 * Both chat surfaces run the same sequence: select candidate models for
 * their routing profile, fail fast when none fit, serve the turn through
 * the fallback wrapper, and correct usage counters afterwards. Profiles,
 * budgets, tools, prompts, and persistence stay in the orchestrators —
 * only the identical mechanics live here.
 */

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
  correctUsage: (inputTokens: number, outputTokens: number) => void;
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

  return {
    fallbackModel,
    serving,
    attemptTrail,
    correctUsage: (inputTokens, outputTokens) => {
      void correctTokenUsage(serving.modelId, input.estimatedTokens, {
        inputTokens,
        outputTokens,
      }).catch(() => {});
    },
  };
}
