import "server-only";

/**
 * Routing profiles — one per kind of work.
 *
 * Each surface declares which kind of work it is doing; the provider order
 * for each kind is data, so changing a chain is an edit to a table rather
 * than to control flow. Every identifier here must also exist in
 * `lib/ai/catalog.ts` — the catalog is the paid-usage allowlist.
 */

export type AiRoutingProfile =
  | "assistant_chat" // owner Assistant: 12 tool schemas, long history
  | "agent_chat" // public customer Agent: 5 tool schemas, short turns
  | "quote_draft" // 4K output, large grounded prompt, accuracy-critical
  | "quote_improvement"
  | "short_text" // follow-up suggestions, analytics summaries, digests
  | "extraction"; // importer, multimodal

export type RoutingProfileDefinition = {
  /** Whether the chain may only contain tool-capable entries. */
  needsTools: boolean;
  /** Minimum quality score. */
  minQuality: number;
  /** Explicit provider/model order — data, not control flow. */
  order: Array<`${string}:${string}`>;
  /** Providers excluded outright (never offered a request they must refuse). */
  excludedProviders: string[];
  /** Human-readable reasoning for the order. */
  reasoning: string;
};

/**
 * Twelve tool schemas plus a long system prompt is ~2.5-3K tokens of fixed
 * overhead per step across up to five steps. Only high-TPM providers survive
 * that; Groq's 8K TPM puts it late in the chain, not first. OpenRouter is
 * held in the reserve tier (50 RPD account-wide) and Cloudflare's neuron
 * pool is the last non-reserve option.
 */
const ASSISTANT_CHAT_ORDER = [
  "google:gemini-3.8-flash",
  "google:gemini-3.6-flash",
  "groq:openai/gpt-oss-120b",
  "google:gemini-3.1-flash-lite",
  "google:gemini-3.5-flash-lite",
  "groq:qwen/qwen3.8-27b",
  "groq:openai/gpt-oss-20b",
  "cloudflare:@cf/openai/gpt-oss-120b",
  "cloudflare:@cf/openai/gpt-oss-20b",
  "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter:nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter:nvidia/nemotron-3.5-lightning:free",
] as Array<`${string}:${string}`>;

/**
 * Five tools and a short system prompt fit 8K TPM, and Groq is the fastest —
 * the right trade for an anonymous public surface. Gemini follows for turns
 * that outgrow Groq's shared minute.
 */
const AGENT_CHAT_ORDER = [
  "groq:openai/gpt-oss-20b",
  "groq:openai/gpt-oss-120b",
  "google:gemini-3.6-flash",
  "google:gemini-3.8-flash",
  "google:gemini-3.1-flash-lite",
  "google:gemini-3.5-flash-lite",
  "groq:qwen/qwen3.8-27b",
  "cloudflare:@cf/openai/gpt-oss-20b",
  "cloudflare:@cf/openai/gpt-oss-120b",
  "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter:nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter:nvidia/nemotron-3.5-lightning:free",
] as Array<`${string}:${string}`>;

/**
 * A 4,000-token output plus a knowledge-grounded prompt cannot fit Groq's 8K
 * TPM, so Groq is excluded entirely. The 1M-context OpenRouter entries are
 * the escape hatch for the largest grounded prompts; Cloudflare and NVIDIA
 * are last because their TPM pools are small.
 */
const QUOTE_ORDER = [
  "google:gemini-3.8-flash",
  "google:gemini-3.6-flash",
  "google:gemini-3.1-flash-lite",
  "google:gemini-3.5-flash-lite",
  "openrouter:nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter:nvidia/nemotron-3.5-lightning:free",
  "openrouter:google/gemma-4-31b-it:free",
  "cloudflare:@cf/openai/gpt-oss-120b",
  "cloudflare:@cf/openai/gpt-oss-20b",
  "nvidia:openai/gpt-oss-20b",
] as Array<`${string}:${string}`>;

/**
 * 150-300 output tokens. Deliberately starts on Cloudflare's small models
 * and keeps the high-TPM chat providers free for chat and quotes.
 */
const SHORT_TEXT_ORDER = [
  "cloudflare:@cf/openai/gpt-oss-20b",
  "cloudflare:@cf/zai-org/glm-4.7-flash",
  "groq:openai/gpt-oss-20b",
  "groq:qwen/qwen3.8-27b",
  "cloudflare:@cf/qwen/qwen3-30b-a3b-fp8",
  "nvidia:openai/gpt-oss-20b",
  "google:gemini-3.1-flash-lite",
  "google:gemini-3.5-flash-lite",
  "openrouter:google/gemma-4-31b-it:free",
  "openrouter:nvidia/nemotron-3.5-lightning:free",
] as Array<`${string}:${string}`>;

/**
 * The importer calls Gemini directly (multimodal document parts), so its
 * chain is Gemini-only. The first identifier is the preferred extractor.
 */
const EXTRACTION_ORDER = [
  "google:gemini-3.8-flash",
  "google:gemini-3.6-flash",
  "google:gemini-3.1-flash-lite",
  "google:gemini-3.5-flash-lite",
] as Array<`${string}:${string}`>;

export const ROUTING_PROFILES: Record<
  AiRoutingProfile,
  RoutingProfileDefinition
> = {
  assistant_chat: {
    needsTools: true,
    minQuality: 7,
    order: ASSISTANT_CHAT_ORDER,
    excludedProviders: ["nvidia"],
    reasoning:
      "Chat with 12 tool schemas served by the most generous tool-capable free allowance first.",
  },
  agent_chat: {
    needsTools: true,
    minQuality: 7,
    order: AGENT_CHAT_ORDER,
    excludedProviders: ["nvidia"],
    reasoning:
      "Public agent ordered by speed within what fits short turns.",
  },
  quote_draft: {
    needsTools: false,
    minQuality: 7,
    order: QUOTE_ORDER,
    excludedProviders: ["groq"],
    reasoning:
      "4K draft plus grounding cannot fit Groq 8K TPM; 1M-context escape hatch kept.",
  },
  quote_improvement: {
    needsTools: false,
    minQuality: 7,
    order: QUOTE_ORDER,
    excludedProviders: ["groq"],
    reasoning: "Refining a draft is no more fragile than creating one.",
  },
  short_text: {
    needsTools: false,
    minQuality: 5,
    order: SHORT_TEXT_ORDER,
    excludedProviders: [],
    reasoning: "Short background work on small models; keeps chat allowance free.",
  },
  extraction: {
    needsTools: false,
    minQuality: 7,
    order: EXTRACTION_ORDER,
    excludedProviders: [],
    reasoning: "Multimodal document reading via Gemini.",
  },
};

/** Map legacy AI task types onto routing profiles. */
export function profileForTaskType(
  taskType: string,
): AiRoutingProfile {
  switch (taskType) {
    case "assistant_message":
      return "assistant_chat";
    case "agent_conversation":
      return "agent_chat";
    case "quote_draft":
      return "quote_draft";
    case "quote_improvement":
      return "quote_improvement";
    default:
      return "short_text";
  }
}
