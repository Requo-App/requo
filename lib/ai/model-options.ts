import { getModelCatalog } from "@/lib/ai/catalog";

export const aiProviderNames = [
  "groq",
  "gemini",
  "cloudflare",
  "nvidia",
  "openrouter",
] as const;

export type AiProviderName = (typeof aiProviderNames)[number];

/**
 * Legacy quality tiers. The routing-profile system (`lib/ai/routing-profiles`)
 * replaces the minimum-quality lever, which was inert (every entry scored 7+,
 * so "cheap" and "balanced" selected an identical pool). Retained for backward
 * compatibility with pinned-model callers; new code passes `routingProfile`.
 */
export const aiQualityTiers = ["balanced", "cheap", "best"] as const;

export type AiQualityTier = (typeof aiQualityTiers)[number];

export const autoAiModelOptionValue = "auto";

/**
 * Provider/model options derived from the unified catalog
 * (`lib/ai/catalog.ts`) — the single source of truth. Previously three lists
 * described models and disagreed (options list, capacity table, cost table).
 *
 * Provider rate limits (free tier) now live in the catalog; see that module
 * for the researched ceilings and environment overrides.
 */
function modelsForProvider(provider: AiProviderName): string[] {
  const prefix = provider === "gemini" ? "google" : provider;
  try {
    return getModelCatalog()
      .filter((e) => e.modelId.startsWith(`${prefix}:`))
      .sort((a, b) => b.quality - a.quality)
      .map((e) => e.modelId.slice(prefix.length + 1));
  } catch {
    return [];
  }
}

function buildProviderModels(): Record<AiProviderName, Record<AiQualityTier, string[]>> {
  const out = {} as Record<AiProviderName, Record<AiQualityTier, string[]>>;
  for (const provider of aiProviderNames) {
    const models = modelsForProvider(provider);
    out[provider] = {
      balanced: [...models],
      cheap: [...models],
      best: [...models],
    };
  }
  return out;
}

export const aiProviderModels: Record<
  AiProviderName,
  Record<AiQualityTier, string[]>
> = buildProviderModels();

export type AiModelSelection = {
  provider: AiProviderName;
  model: string;
};

export type AiModelOption = AiModelSelection & {
  label: string;
  value: string;
};

export function getModelsForProvider(
  provider: AiProviderName,
  tier: AiQualityTier = "balanced",
): string[] {
  // Re-derive from the catalog so pinned-model callers always see live IDs.
  const live = modelsForProvider(provider);
  if (live.length > 0) return live;
  return aiProviderModels[provider][tier] ?? aiProviderModels[provider].balanced;
}

export function createAiModelOptionValue(selection: AiModelSelection) {
  return `${selection.provider}|${selection.model}`;
}

export function parseAiModelOptionValue(
  value: string | null | undefined,
): AiModelSelection | null {
  if (!value || value === autoAiModelOptionValue) {
    return null;
  }

  const dividerIndex = value.indexOf("|");

  if (dividerIndex <= 0) {
    return null;
  }

  const provider = value.slice(0, dividerIndex);
  const model = value.slice(dividerIndex + 1);

  if (!isAiProviderName(provider) || !isKnownAiProviderModel(provider, model)) {
    return null;
  }

  return { provider, model };
}

export function getAllAiModelOptions(): AiModelOption[] {
  return aiProviderNames.flatMap((provider) => {
    const seen = new Set<string>();

    return aiQualityTiers.flatMap((tier) =>
      getModelsForProvider(provider, tier)
        .filter((model) => {
          if (seen.has(model)) {
            return false;
          }

          seen.add(model);
          return true;
        })
        .map((model) => ({
          provider,
          model,
          label: `${formatAiProviderName(provider)} / ${model}`,
          value: createAiModelOptionValue({ provider, model }),
        })),
    );
  });
}

export function formatAiProviderName(provider: AiProviderName) {
  switch (provider) {
    case "groq":
      return "Groq";
    case "gemini":
      return "Gemini";
    case "cloudflare":
      return "Cloudflare";
    case "nvidia":
      return "NVIDIA NIM";
    case "openrouter":
      return "OpenRouter";
  }
}

function isAiProviderName(value: string): value is AiProviderName {
  return (aiProviderNames as readonly string[]).includes(value);
}

function isKnownAiProviderModel(provider: AiProviderName, model: string) {
  return aiQualityTiers.some((tier) =>
    getModelsForProvider(provider, tier).includes(model),
  );
}
