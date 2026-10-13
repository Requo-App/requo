import "server-only";

import type { AiProviderName } from "@/lib/ai/model-options";
import { getModelCatalog } from "@/lib/ai/catalog";

/** Conservative deployment defaults. Provider dashboards remain authoritative. */
const DEFAULT_TPM: Record<AiProviderName, number> = {
  groq: 8_000,
  cerebras: 30_000,
  gemini: 250_000,
  mistral: 500_000,
  cloudflare: 10_000,
  nvidia: 20_000,
  openrouter: 20_000,
};

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function getProviderTpm(provider: AiProviderName): number {
  // Prefer the unified catalog (env-overridable per provider), fall back to
  // the legacy defaults above when the catalog has no entry.
  try {
    const entries = getModelCatalog().filter((e) =>
      e.modelId.startsWith(`${provider === "gemini" ? "google" : provider}:`),
    );
    if (entries.length > 0) {
      const max = Math.max(...entries.map((e) => e.limits.tpm));
      return envNumber(`AI_TPM_${provider.toUpperCase()}`, max);
    }
  } catch {
    // Catalog unavailable (e.g. in a minimal test env) — use defaults.
  }
  return envNumber(`AI_TPM_${provider.toUpperCase()}`, DEFAULT_TPM[provider]);
}

/** Cheap, deterministic estimate suitable for preflight routing. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateMessageTokens(
  messages: Array<{ content: string }>,
): number {
  return messages.reduce((total, message) => total + estimateTokens(message.content), 0);
}

/**
 * Measured prompt overhead: rendered system prompt plus serialised tool
 * schemas. Computed once per surface so selection sees a number in the right
 * order of magnitude (the old flat 250 understated the Assistant by
 * thousands of tokens).
 */
export function measurePromptOverhead(
  systemPrompt: string,
  tools: Record<string, unknown>,
): number {
  let schemaChars = 0;
  for (const tool of Object.values(tools)) {
    try {
      schemaChars += JSON.stringify(tool).length;
    } catch {
      // Unserialisable tool shape — ignore its contribution.
    }
  }
  return estimateTokens(systemPrompt) + Math.ceil(schemaChars / 4);
}

/**
 * Include protocol, system-prompt, and tool-schema overhead.
 *
 * `overheadTokens` is explicit: callers pass the measured figure from
 * `measurePromptOverhead`. The default preserves the old behaviour for
 * callers that have not been migrated yet.
 */
export function estimateChatRequestTokens(
  messages: Array<{ content: string }>,
  outputTokens: number,
  overheadTokens = 250,
): number {
  return (
    Math.ceil(estimateMessageTokens(messages) * 1.25) +
    overheadTokens +
    outputTokens
  );
}

/**
 * Keep the opening request and latest turns, with a small extractive summary
 * of omitted messages. This avoids another model call while retaining useful
 * continuity for long-running chats.
 *
 * The token check is authoritative: trimming happens whenever the token
 * budget is exceeded, even when the message count is under `keepMessages`.
 * (The old `|| messages.length <= keepMessages` short-circuit let a handful
 * of large tool results sail past a 6,000-token budget.)
 */
export function compactMessages<T extends { role: string; content: string }>(
  messages: T[],
  maxTokens: number,
  keepMessages = 16,
): T[] {
  if (estimateMessageTokens(messages) <= maxTokens) {
    return messages;
  }

  const head = messages.slice(0, 1);
  const tail = messages.slice(-Math.max(keepMessages - head.length, 1));
  const omitted = messages.slice(head.length, messages.length - tail.length);
  const summaryText = omitted
    .map((message) => `${message.role}: ${message.content.replace(/\s+/g, " ").slice(0, 140)}`)
    .join(" | ")
    .slice(0, 900);

  const summary = {
    ...head[0],
    role: "assistant",
    content: `Earlier context summary: ${summaryText}`,
  } as T;

  const compacted = [head[0], summary, ...tail];
  while (compacted.length > 2 && estimateMessageTokens(compacted) > maxTokens) {
    compacted.splice(2, 1);
  }
  return compacted;
}

/**
 * Per-surface budgets as an input / output / overhead triple.
 *
 * NOTE: assistant input (6K) + output (2K) is exactly Groq's entire free
 * per-minute token allowance — one Assistant turn can consume a whole Groq
 * minute, which is why Groq sits late in the assistant chain.
 */
export const CHAT_TOKEN_BUDGETS = {
  agent: { input: 3_000, output: 600, overhead: 1_200 },
  assistant: { input: 6_000, output: 2000, overhead: 2_800 },
} as const;
