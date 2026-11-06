import "server-only";

import { parseDeploymentMode } from "@/lib/deployment-mode";
import type { ModelEntry } from "@/lib/ai/catalog";

// ---------------------------------------------------------------------------
// Self-hosted custom provider
//
// Self-hosted operators can point Requo at any OpenAI-compatible endpoint
// (OpenAI, Ollama, vLLM, LiteLLM, Together, Fireworks, and similar) without
// adding a provider SDK or a paid model to the Cloud catalog. The provider is
// deliberately unavailable in Cloud mode so the managed service keeps its
// free-tier-first routing policy.
//
// The custom model is prepended to every chat/completion routing profile in
// `routing-profiles.ts`. The existing capacity selector, cooldowns, fallback
// chain, and invocation logging then apply to it like any other candidate.
// Extraction stays on Gemini because the importer sends multimodal document
// parts; embeddings stay on Gemini as well.
// ---------------------------------------------------------------------------

const DEFAULT_CONTEXT_WINDOW = 131_072;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;
const DEFAULT_QUALITY = 9;
/**
 * Conservative local request ceiling. Override with AI_RPM_CUSTOM; setting it
 * to 0 removes the modelled request cap (the provider may still enforce one).
 */
const DEFAULT_RPM = 60;

function readString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readInteger(name: string, fallback: number): number {
  const raw = readString(name);
  if (!raw) return fallback;

  const value = Number(raw);
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = readString(name)?.toLowerCase();
  if (!raw) return fallback;

  return !["0", "false", "no", "off"].includes(raw);
}

/** Whether a self-hosted custom OpenAI-compatible endpoint is configured. */
export function isCustomAiConfigured(): boolean {
  if (parseDeploymentMode(process.env.REQUO_DEPLOYMENT_MODE) !== "self-hosted") {
    return false;
  }

  return Boolean(readString("AI_CUSTOM_BASE_URL") && readString("AI_CUSTOM_MODEL"));
}

export type CustomProviderConfig = {
  baseURL: string;
  apiKey?: string;
};

/** Registry connection details for the custom provider. */
export function getCustomProviderConfig(): CustomProviderConfig | null {
  if (!isCustomAiConfigured()) return null;

  const baseURL = readString("AI_CUSTOM_BASE_URL");
  const apiKey = readString("AI_CUSTOM_API_KEY");
  if (!baseURL) return null;

  return {
    baseURL,
    ...(apiKey ? { apiKey } : {}),
  };
}

/** Catalog/registry identifier for the configured custom model. */
export function getCustomModelId(): `${string}:${string}` | null {
  if (!isCustomAiConfigured()) return null;

  const model = readString("AI_CUSTOM_MODEL");
  return model ? (`custom:${model}` as `${string}:${string}`) : null;
}

/**
 * Build the catalog entry for the custom model.
 *
 * Quality and tool capability are configuration, not guesses: a model below a
 * profile's `minQuality`, or one that cannot call tools, is filtered out by
 * the capacity selector and falls back to the remaining providers.
 */
export function getCustomModelEntry(): ModelEntry | null {
  const modelId = getCustomModelId();
  if (!modelId) return null;

  const maxOutputTokens = Math.max(
    1,
    readInteger("AI_CUSTOM_MAX_OUTPUT_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS),
  );
  const contextWindow = Math.max(
    maxOutputTokens,
    readInteger("AI_CUSTOM_CONTEXT_WINDOW", DEFAULT_CONTEXT_WINDOW),
  );
  const quality = Math.min(
    10,
    Math.max(1, readInteger("AI_CUSTOM_QUALITY", DEFAULT_QUALITY)),
  );

  return {
    modelId,
    quality,
    contextWindow,
    maxOutputTokens,
    toolCapable: readBoolean("AI_CUSTOM_TOOLS", true),
    // The router does not require structured output today. Keep the honest
    // default rather than claiming a capability the endpoint may not support.
    structuredOutput: false,
    limits: { rpm: DEFAULT_RPM, rpd: 0, tpm: 0, tpd: 0 },
    sharedWithProvider: [],
    dayResets: "utc-midnight",
    costCentsPerMillion: {
      input: Math.max(0, readInteger("AI_CUSTOM_COST_INPUT", 0)),
      output: Math.max(0, readInteger("AI_CUSTOM_COST_OUTPUT", 0)),
    },
  };
}
