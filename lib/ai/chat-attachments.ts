import "server-only";

import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_ACCEPT_EXTENSIONS,
  CHAT_ATTACHMENT_ACCEPT_MIME_TYPES,
  CHAT_ATTACHMENT_MAX_BYTES,
  formatAttachmentBlock,
} from "@/components/shared/chat/attachment-text";
import { extractKnowledgeText } from "@/features/memory/extraction";
import { sanitizeMemoryContent } from "@/lib/ai/input-sanitizer";
import { getFileExtension, isAcceptedFileType } from "@/lib/files";

export {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_ACCEPT_EXTENSIONS,
  CHAT_ATTACHMENT_ACCEPT_MIME_TYPES,
  CHAT_ATTACHMENT_MAX_BYTES,
};

/**
 * Ephemeral chat attachments (server side).
 *
 * Files ride along on a single chat turn as AI SDK `file` parts (base64
 * data URLs inside the JSON body — no multipart, no stored bytes). The route
 * decodes them, the orchestrator validates → extracts → sanitizes →
 * truncates → appends one delimited block per file to the user turn, and the
 * original bytes are discarded. Nothing is persisted except the extracted
 * text inside the user message plus an `attachmentCount` metadata marker
 * (which the daily plan limits count).
 */

/** Per-turn extracted-text budgets: the Agent's 3K input budget is half the
 *  Assistant's 6K, so its share is half too. */
export const ASSISTANT_ATTACHMENT_MAX_CHARS_PER_TURN = 10_000;
export const AGENT_ATTACHMENT_MAX_CHARS_PER_TURN = 5_000;

export const ASSISTANT_ATTACHMENT_MAX_FILES_PER_TURN = 2;
export const AGENT_ATTACHMENT_MAX_FILES_PER_TURN = 1;

/** Metadata marker written on the persisted user message; the daily plan
 *  limits count messages carrying it. */
export const ATTACHMENT_METADATA_KEY = "attachmentCount";

export type ChatAttachmentCode =
  | "too_many"
  | "image"
  | "unsupported_type"
  | "too_large"
  | "unreadable"
  | "empty"
  | "unsafe";

export class ChatAttachmentError extends Error {
  readonly code: ChatAttachmentCode;

  constructor(code: ChatAttachmentCode, message: string) {
    super(message);
    this.name = "ChatAttachmentError";
    this.code = code;
  }
}

export type RawChatAttachment = {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

export type ProcessedChatAttachment = {
  fileName: string;
  kind: string;
  text: string;
  charCount: number;
  truncated: boolean;
};

function fileKind(fileName: string, mimeType: string): string {
  const ext = getFileExtension(fileName).replace(/^\./, "");
  if (ext) return ext;
  const sub = mimeType.split("/")[1];
  return sub ? sub.split(";")[0].trim().slice(0, 12) : "file";
}

function isImage(mimeType: string, fileName: string): boolean {
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.startsWith("image/")) return true;
  const lowerName = fileName.toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"].some((ext) =>
    lowerName.endsWith(ext),
  );
}

/**
 * Decode one AI SDK `file` part (`data:<mime>;base64,…`) to bytes.
 * Throws `too_large` before decoding absurd payloads.
 */
export function decodeChatFilePart(part: {
  mediaType?: string;
  filename?: string;
  url?: string;
}): RawChatAttachment {
  const url = typeof part.url === "string" ? part.url : "";
  const match = /^data:([^;,]+)?;base64,([\s\S]*)$/.exec(url);
  if (!match) {
    throw new ChatAttachmentError(
      "unreadable",
      "That file couldn't be read. Try uploading it again.",
    );
  }
  const base64 = match[2].replace(/\s+/g, "");
  // Base64 inflates 4/3 — reject without decoding past ~2.7MB of source.
  if (base64.length > Math.ceil((CHAT_ATTACHMENT_MAX_BYTES * 4) / 3) + 64) {
    throw new ChatAttachmentError(
      "too_large",
      "That file is too large for chat. Keep files under 2 MB.",
    );
  }
  const fileName = (part.filename ?? "").trim() || "file";
  const mimeType = (match[1] || part.mediaType || "").toLowerCase();
  return { fileName, mimeType, bytes: Buffer.from(base64, "base64") };
}

/**
 * Validate → extract → sanitize → truncate one turn's files.
 * Returns the prompt block to append to the user turn ("" when no files).
 */
export async function processChatAttachments({
  files,
  maxFiles,
  maxCharsPerTurn,
}: {
  files: RawChatAttachment[];
  maxFiles: number;
  maxCharsPerTurn: number;
}): Promise<{
  block: string;
  fileCount: number;
  charCount: number;
  truncated: boolean;
}> {
  if (files.length === 0) {
    return { block: "", fileCount: 0, charCount: 0, truncated: false };
  }

  if (files.length > maxFiles) {
    throw new ChatAttachmentError(
      "too_many",
      maxFiles === 1
        ? "Attach one file per message."
        : `Attach no more than ${maxFiles} files per message.`,
    );
  }

  const processed: ProcessedChatAttachment[] = [];
  let usedChars = 0;
  let truncated = false;

  for (const file of files) {
    if (isImage(file.mimeType, file.fileName)) {
      throw new ChatAttachmentError("image", "IMAGE_NOT_SUPPORTED");
    }
    if (
      !isAcceptedFileType(
        { name: file.fileName, type: file.mimeType },
        {
          allowedExtensions: [...CHAT_ATTACHMENT_ACCEPT_EXTENSIONS],
          allowedMimeTypes: [...CHAT_ATTACHMENT_ACCEPT_MIME_TYPES],
        },
      )
    ) {
      throw new ChatAttachmentError(
        "unsupported_type",
        "Upload a PDF, DOCX, CSV, TXT, or Markdown file.",
      );
    }
    if (file.bytes.length === 0 || file.bytes.length > CHAT_ATTACHMENT_MAX_BYTES) {
      throw new ChatAttachmentError(
        "too_large",
        file.bytes.length === 0
          ? "That file is empty."
          : "That file is too large for chat. Keep files under 2 MB.",
      );
    }

    let extracted: Awaited<ReturnType<typeof extractKnowledgeText>>;
    try {
      extracted = await extractKnowledgeText({
        mimeType: file.mimeType,
        fileName: file.fileName,
        bytes: file.bytes,
      });
    } catch {
      throw new ChatAttachmentError(
        "unreadable",
        "That file couldn't be read. Try uploading it again.",
      );
    }

    if (!extracted.text.trim()) {
      throw new ChatAttachmentError(
        "empty",
        "That file contained no readable text.",
      );
    }

    const sanitization = sanitizeMemoryContent("", extracted.text);
    if (sanitization.status === "rejected") {
      throw new ChatAttachmentError(
        "unsafe",
        "That file couldn't be processed. Try removing any instructional text and upload again.",
      );
    }
    const safeText = sanitization.output || extracted.text;

    const remaining = maxCharsPerTurn - usedChars;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const slice = safeText.slice(0, remaining);
    const wasTruncated = safeText.length > remaining;
    if (wasTruncated) truncated = true;
    usedChars += slice.length;
    processed.push({
      fileName: file.fileName,
      kind: fileKind(file.fileName, file.mimeType),
      text: slice,
      charCount: slice.length,
      truncated: wasTruncated || extracted.truncated,
    });
  }

  if (processed.length === 0) {
    throw new ChatAttachmentError(
      "too_large",
      "Those files contain more text than fits in one message. Try a smaller file.",
    );
  }

  const block = processed
    .map((p) =>
      formatAttachmentBlock({
        fileName: p.fileName,
        kind: p.kind,
        charCount: p.charCount,
        truncated: p.truncated,
        text: p.text,
      }),
    )
    .join("\n\n");

  return { block, fileCount: processed.length, charCount: usedChars, truncated };
}
