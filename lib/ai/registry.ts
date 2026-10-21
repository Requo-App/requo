import "server-only";

import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createProviderRegistry } from "ai";

import {
  env,
  isGroqConfigured,
  isGeminiConfigured,
  isOpenRouterConfigured,
  isCloudflareAiConfigured,
  isNvidiaNimConfigured,
} from "@/lib/env";

// ---------------------------------------------------------------------------
// AI Provider Registry — Vercel AI SDK
//
// Central provider management following the official Vercel AI SDK pattern.
// All providers are registered here and accessed via string IDs:
//   registry.languageModel("groq:model-name")
//
// Providers are free-tier-first and wired in this order:
//   Groq → Gemini → Cloudflare Workers AI → NVIDIA NIM → OpenRouter
//
// NVIDIA NIM is a deliberate production exception: its hosted endpoints are
// documented for prototyping/development, but Requo production routing was
// explicitly configured to include them. See `lib/ai/catalog.ts` and
// `docs/setup/ai-provider-limits.md`.
//
// `lib/ai/catalog.ts` is the paid-usage allowlist. The router refuses a
// pinned provider/model that is absent from it, so adding a provider here
// without a catalog entry cannot route traffic to a paid model.
// ---------------------------------------------------------------------------

// ── Provider instances (only created if configured) ───────────────────────

const groq = isGroqConfigured
  ? createGroq({ apiKey: env.GROQ_API_KEY })
  : null;

const google = isGeminiConfigured
  ? createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY })
  : null;

const openrouter = isOpenRouterConfigured
  ? createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
  : null;

const cloudflare = isCloudflareAiConfigured
  ? createOpenAICompatible({
      name: "cloudflare",
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      },
    })
  : null;

const nvidia = isNvidiaNimConfigured
  ? createOpenAICompatible({
      name: "nvidia",
      baseURL: "https://integrate.api.nvidia.com/v1",
      headers: {
        Authorization: `Bearer ${env.NVIDIA_NIM_API_KEY}`,
      },
    })
  : null;

// ── Registry setup ────────────────────────────────────────────────────────

/**
 * Build the registry with only configured providers.
 * Access models via: registry.languageModel("groq:openai/gpt-oss-120b")
 */
function buildRegistry() {
  const providers: Record<
    string,
    | ReturnType<typeof createGroq>
    | ReturnType<typeof createGoogleGenerativeAI>
    | ReturnType<typeof createOpenRouter>
    | ReturnType<typeof createOpenAICompatible>
  > = {};

  if (groq) providers.groq = groq;
  if (google) providers.google = google;
  if (openrouter) providers.openrouter = openrouter;
  if (cloudflare) providers.cloudflare = cloudflare;
  if (nvidia) providers.nvidia = nvidia;

  return createProviderRegistry(providers);
}

export const registry = buildRegistry();

// ── Provider availability checks ──────────────────────────────────────────

export { groq, google, openrouter, cloudflare, nvidia };

/** Returns true if at least one AI provider is configured. */
export function isAiConfigured(): boolean {
  return (
    isGroqConfigured ||
    isGeminiConfigured ||
    isOpenRouterConfigured ||
    isCloudflareAiConfigured ||
    isNvidiaNimConfigured
  );
}
