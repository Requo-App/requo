import "server-only";

import { getModelCatalog } from "@/lib/ai/catalog";
import {
  ROUTING_PROFILES,
  type AiRoutingProfile,
} from "@/lib/ai/routing-profiles";
import {
  isCloudflareAiConfigured,
  isGeminiConfigured,
  isGroqConfigured,
  isNvidiaNimConfigured,
  isOpenRouterConfigured,
} from "@/lib/env";

/**
 * Routing failure diagnostics shared by the router, the chat fallback, and
 * the chat error mapper.
 *
 * "No candidates" has three different causes, and only one is fixed by
 * waiting: no provider configured, every configured quota used up, or a
 * routing profile that cannot use any of the configured providers. Keeping
 * the diagnosis here means the chat surfaces report the same distinction as
 * the non-streaming router.
 */

export const NO_PROVIDER_MESSAGE =
  "AI features are unavailable because no AI provider is configured. Contact the site owner to enable AI features.";

export const NO_CAPACITY_MESSAGE =
  "AI features are temporarily unavailable because every configured free-tier quota is exhausted or cooling down. Please try again after the quota resets.";

export const NO_ELIGIBLE_MODEL_MESSAGE =
  "AI features are temporarily unavailable for this request because no configured free-tier model meets its requirements. Try a different workflow or contact the site owner.";

const PROVIDER_CONFIGURED: Record<string, () => boolean> = {
  groq: () => isGroqConfigured,
  google: () => isGeminiConfigured,
  openrouter: () => isOpenRouterConfigured,
  cloudflare: () => isCloudflareAiConfigured,
  nvidia: () => isNvidiaNimConfigured,
};

export function isProviderConfigured(provider: string): boolean {
  return PROVIDER_CONFIGURED[provider]?.() ?? false;
}

/**
 * Whether the profile could use at least one configured catalog model if
 * every quota were empty. This separates "wait for a reset" from "waiting
 * will never help" without inspecting live counters.
 */
export function hasEligibleConfiguredModel(
  profile: AiRoutingProfile,
): boolean {
  const definition = ROUTING_PROFILES[profile];
  if (!definition) return false;

  const byId = new Map(
    getModelCatalog().map((entry) => [entry.modelId, entry]),
  );

  // Check the profile's explicit order, not the whole catalog: a configured
  // provider may have models that are absent from this workflow's chain.
  return definition.order.some((modelId) => {
    const entry = byId.get(modelId);
    if (!entry) return false;
    const provider = entry.modelId.split(":")[0] ?? "";
    if (!isProviderConfigured(provider)) return false;
    if (definition.needsTools && !entry.toolCapable) return false;
    if (entry.quality < definition.minQuality) return false;
    if (definition.excludedProviders.includes(provider)) return false;
    return true;
  });
}

export function noModelsAvailableError(profile?: AiRoutingProfile): Error {
  const anyConfigured = Object.keys(PROVIDER_CONFIGURED).some((provider) =>
    isProviderConfigured(provider),
  );

  if (!anyConfigured) {
    return new Error(NO_PROVIDER_MESSAGE);
  }

  if (profile && !hasEligibleConfiguredModel(profile)) {
    return new Error(NO_ELIGIBLE_MODEL_MESSAGE);
  }

  return new Error(NO_CAPACITY_MESSAGE);
}

/** Whether a thrown message is one of the routing diagnostics above. */
export function isNoModelsAvailableMessage(message: string): boolean {
  return (
    message.startsWith(NO_PROVIDER_MESSAGE) ||
    message.startsWith(NO_CAPACITY_MESSAGE) ||
    message.startsWith(NO_ELIGIBLE_MODEL_MESSAGE) ||
    message.includes("No suitable AI model")
  );
}
