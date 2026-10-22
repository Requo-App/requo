import "server-only";

import { NextResponse } from "next/server";

import {
  ChatAttachmentError,
  type RawChatAttachment,
} from "@/lib/ai/chat-attachments";
import {
  decodeRequestAttachments,
  type ChatAttachmentInput,
} from "@/lib/ai/chat-request";
import { isNoModelsAvailableMessage } from "@/lib/ai/routing-errors";

/**
 * Shared attachment-decode + 400 helper (was copy-pasted in both AI chats).
 * Returns bytes or an error Response. `imageMessage` preserves each
 * surface's wording.
 */
export function decodeChatAttachmentsOrResponse(
  attachments: ReadonlyArray<ChatAttachmentInput> | undefined,
  imageMessage: string,
):
  | { ok: true; rawAttachments: RawChatAttachment[] }
  | { ok: false; response: Response } {
  try {
    return {
      ok: true,
      rawAttachments: decodeRequestAttachments(attachments, imageMessage),
    };
  } catch (error) {
    if (error instanceof ChatAttachmentError) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              error.code === "image" ? imageMessage : error.message,
          },
          { status: 400 },
        ),
      };
    }
    throw error;
  }
}

/**
 * Shared prefix-mapped error handler for both AI chat routes.
 * Returns a Response when the error matches a known prefix, else null.
 * Covers both surfaces' prefixes (QUOTA_/SESSION_/ASSISTANT_/INPUT_/
 * ATTACHMENT_/UPLOAD_) so routes share one mapper.
 */
export function mapChatError(
  error: unknown,
  fallbackImageMessage: string,
): Response | null {
  if (!(error instanceof Error)) return null;

  const prefix = (name: string) =>
    error.message.startsWith(`${name}:`)
      ? error.message.slice(name.length + 1).trim()
      : null;

  let message = prefix("QUOTA_EXCEEDED");
  if (message !== null) {
    return NextResponse.json(
      { error: message || "Usage limit reached." },
      { status: 429 },
    );
  }

  message = prefix("SESSION_LIMIT_EXCEEDED") ?? prefix("ASSISTANT_LIMIT_EXCEEDED");
  if (message !== null) {
    return NextResponse.json({ error: message }, { status: 429 });
  }

  message = prefix("INPUT_REJECTED");
  if (message !== null) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  message = prefix("ATTACHMENT_REJECTED");
  if (message !== null) {
    return NextResponse.json(
      {
        error:
          message === "IMAGE_NOT_SUPPORTED"
            ? fallbackImageMessage
            : message || "That file can't be attached.",
      },
      { status: 400 },
    );
  }

  message = prefix("UPLOAD_LIMIT_EXCEEDED");
  if (message !== null) {
    return NextResponse.json(
      { error: message || "Daily file-upload limit reached." },
      { status: 429 },
    );
  }

  if (error.message.includes("A user message is required")) {
    return NextResponse.json(
      { error: "Send a message to continue the conversation." },
      { status: 400 },
    );
  }

  if (isNoModelsAvailableMessage(error.message)) {
    return NextResponse.json(
      {
        error: error.message.includes("No suitable AI model")
          ? "AI service temporarily unavailable. Please try again in a moment."
          : error.message,
      },
      { status: 503 },
    );
  }

  return null;
}
