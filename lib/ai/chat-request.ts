import { z } from "zod";

import {
  ChatAttachmentError,
  decodeChatFilePart,
  type RawChatAttachment,
} from "@/lib/ai/chat-attachments";

/**
 * Shared UI-chat request parsing for the AI chat routes
 * (`app/api/ai/agent/chat`, `app/api/ai/assistant/chat`).
 *
 * Only genuinely identical logic lives here: message-shape validation,
 * turn text extraction, and attachment data-URL decoding. Everything
 * route-specific — auth, rate limits, quotas, model routing, tools,
 * prompts, error-message wording, response shapes — stays in the routes
 * and orchestrators.
 */

/**
 * The maximum characters of a single chat turn.
 *
 * The cap has to sit on the transport the clients actually use (`messages`
 * with `content`/`parts`), not only on the legacy `content` field: an
 * unbounded turn is an unbounded database row, an unbounded sanitizer pass,
 * and a turn that the token budget silently drops from the prompt.
 */
export const MAX_CHAT_MESSAGE_CHARS = 20_000;

export const uiTextPartSchema = z.object({
  type: z.string(),
  text: z
    .string()
    .max(
      MAX_CHAT_MESSAGE_CHARS,
      `Messages must be ${MAX_CHAT_MESSAGE_CHARS.toLocaleString()} characters or fewer.`,
    )
    .optional(),
});

export const uiMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z
    .string()
    .max(
      MAX_CHAT_MESSAGE_CHARS,
      `Messages must be ${MAX_CHAT_MESSAGE_CHARS.toLocaleString()} characters or fewer.`,
    )
    .optional(),
  parts: z.array(uiTextPartSchema).optional(),
});

export type UiChatMessage = z.infer<typeof uiMessageSchema>;

/**
 * Text of one UI message: `content` first, then joined `text` parts.
 *
 * The two chat routes disagree on blank-string `content` and that
 * difference is preserved explicitly: the agent keeps a present-but-blank
 * `content` as-is, while the assistant falls back to the parts.
 */
export function extractUiMessageText(
  message: UiChatMessage,
  blankContentFallsBackToParts = false,
): string {
  if (
    typeof message.content === "string" &&
    (!blankContentFallsBackToParts || message.content.trim())
  ) {
    return message.content;
  }

  return (message.parts ?? [])
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text as string)
    .join("\n");
}

export type ChatAttachmentInput = {
  mediaType: string;
  filename: string;
  dataUrl: string;
};

/**
 * Decodes a turn's attachment data URLs to bytes (cheap; validation and
 * plan limits run later in the orchestrators). Image rejections are
 * remapped to the surface-specific message but keep their
 * `ChatAttachmentError` identity so routes preserve their 400 handling.
 */
export function decodeRequestAttachments(
  attachments: ReadonlyArray<ChatAttachmentInput> | undefined,
  imageErrorMessage: string,
): RawChatAttachment[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  try {
    return attachments.map((attachment) =>
      decodeChatFilePart({
        mediaType: attachment.mediaType,
        filename: attachment.filename,
        url: attachment.dataUrl,
      }),
    );
  } catch (error) {
    if (error instanceof ChatAttachmentError) {
      throw new ChatAttachmentError(
        error.code,
        error.code === "image" ? imageErrorMessage : error.message,
      );
    }
    throw error;
  }
}
