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

/** Normalized chat message shape sent to every provider. */
export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Normalized request shape passed to the router.
 *
 * Each AI surface declares the kind of work via `routingProfile`; `qualityTier`
 * is retained for legacy callers and maps onto a profile (cheap → short_text,
 * balanced/best → quote_draft).
 */
export type AiCompletionRequest = {
  messages: AiChatMessage[];
  temperature: number;
  maxOutputTokens: number;
  qualityTier?: AiQualityTier;
  /** Preferred: explicit routing profile for this kind of work. */
  routingProfile?: AiRoutingProfile;
  /** Preflight token estimate (input + output) for capacity selection. */
  estimatedTokens?: number;
  /**
   * End-to-end budget for this request, including fallback attempts. The
   * router applies its own default when omitted. Per-candidate provider
   * timeouts always sit inside this budget.
   */
  deadlineMs?: number;
  /** Caller cancellation for streaming requests, shared by all fallback attempts. */
  abortSignal?: AbortSignal;
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
