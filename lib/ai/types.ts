import "server-only";

import type {
  AiProviderName,
  AiQualityTier,
} from "@/lib/ai/model-options";

export type { AiProviderName, AiQualityTier } from "@/lib/ai/model-options";

// ---------------------------------------------------------------------------
// Task types — quote generation and agent conversation tasks.
// ---------------------------------------------------------------------------

export const aiTaskTypes = ["quote_draft", "quote_improvement", "agent_conversation", "assistant_message", "follow_up_message"] as const;

export type AiTaskType = (typeof aiTaskTypes)[number];

// ---------------------------------------------------------------------------
// AI Types — shared type definitions for the AI layer
//
// These types are used by the router, pipeline, surface service, and
// consuming features. The Vercel AI SDK handles provider communication;
// these types normalize the interface for internal app logic.
// ---------------------------------------------------------------------------

import type { AiRoutingProfile } from "@/lib/ai/routing-profiles";

export type { AiRoutingProfile } from "@/lib/ai/routing-profiles";

/**
 * Each AI surface declares which kind of work it is doing, so routing is a
 * property of the surface rather than a number guessed at the call site.
 * `qualityTier` is retained for backward compatibility and maps onto a
 * profile (cheap → short_text, balanced/best → quote_draft).
 */
/** Normalized chat message shape sent to every provider. */
export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Normalized request shape passed to each provider. */
export type AiCompletionRequest = {
  provider?: AiProviderName;
  model: string;
  messages: AiChatMessage[];
  temperature: number;
  maxOutputTokens: number;
  qualityTier?: AiQualityTier;
  /** Preferred: explicit routing profile for this kind of work. */
  routingProfile?: AiRoutingProfile;
  /** Preflight token estimate (input + output) for capacity selection. */
  estimatedTokens?: number;
};

/** Normalized response returned by every provider. */
export type AiCompletionResponse = {
  provider: AiProviderName;
  model: string;
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
};

/** Normalized streaming chunk from any provider. */
export type AiStreamChunk = {
  delta: string;
  finishReason?: string | null;
};

/** Async iterable of stream chunks, plus metadata about the provider. */
export type AiStreamResponse = {
  provider: AiProviderName;
  model: string;
  stream: AsyncIterable<AiStreamChunk>;
};

/**
 * @deprecated Legacy provider interface — no longer used by the router.
 * The Vercel AI SDK registry handles provider management directly.
 * Retained for backward compatibility with test utilities.
 */
export type AiProvider = {
  name: AiProviderName;
  isConfigured: () => boolean;
  generateCompletion: (
    request: AiCompletionRequest,
  ) => Promise<AiCompletionResponse>;
  generateStream: (
    request: AiCompletionRequest,
  ) => Promise<AiStreamResponse>;
};
