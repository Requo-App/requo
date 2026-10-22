"use client";

import type { UIMessage } from "ai";

import { collapseAttachmentBlocksForDisplay } from "@/components/shared/chat/attachment-text";

export type AssistantHistoryRow = {
  id: string;
  role: string;
  content: string;
  toolName?: string | null;
  toolCallId?: string | null;
};

/**
 * Map persisted rows (user / assistant / tool) to UI messages.
 * Tool rows become `dynamic-tool` parts so structured results (cards,
 * confirmations) rehydrate after a reload exactly as they streamed.
 *
 * Empty user/assistant rows (from before the empty-content guard) are skipped
 * so a past silent turn never renders as a blank bubble.
 */
export function historyToUIMessages(rows: AssistantHistoryRow[]): UIMessage[] {
  const messages: UIMessage[] = [];

  for (const row of rows) {
    if (
      (row.role === "user" || row.role === "assistant") &&
      !row.content.trim()
    ) {
      continue;
    }
    if (row.role === "tool") {
      let output: unknown = row.content;
      try {
        output = JSON.parse(row.content);
      } catch {
        // Keep raw text when the payload is not JSON.
      }
      messages.push({
        id: row.id,
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: row.toolName ?? "tool",
            toolCallId: row.toolCallId ?? row.id,
            state: "output-available",
            input: {},
            output,
          },
        ],
      } as unknown as UIMessage);
    } else if (row.role === "user" || row.role === "assistant") {
      // Persisted user turns may carry `[Attached file: …]` blocks — collapse
      // them to a one-line summary so a reload never paints raw file text.
      const display =
        row.role === "user"
          ? collapseAttachmentBlocksForDisplay(row.content)
          : row.content;
      messages.push({
        id: row.id,
        role: row.role,
        parts: [{ type: "text", text: display }],
      } as UIMessage);
    }
  }

  return messages;
}
