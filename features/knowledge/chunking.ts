import { createHash } from "crypto";

import {
  KNOWLEDGE_CHUNK_OVERLAP_TOKENS,
  KNOWLEDGE_CHUNK_TARGET_TOKENS,
} from "@/features/knowledge/types";

/**
 * Deterministic chunking for knowledge file text.
 *
 * Token estimation is a conservative heuristic (~4 characters per token) used
 * only to size chunks and budget retrieval context — never for billing.
 * Chunks are cut on paragraph/line boundaries when possible and carry a
 * content hash for stale-cache and dedup detection.
 */

export const KNOWLEDGE_CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }

  return Math.max(1, Math.ceil(text.length / KNOWLEDGE_CHARS_PER_TOKEN));
}

export type KnowledgeChunk = {
  content: string;
  contentHash: string;
  tokenEstimate: number;
};

function hashChunk(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Splits text into overlapping chunks of approximately
 * `KNOWLEDGE_CHUNK_TARGET_TOKENS` tokens with `KNOWLEDGE_CHUNK_OVERLAP_TOKENS`
 * token overlap, preferring paragraph/line boundaries.
 *
 * - Empty text produces no chunks.
 * - A single short document produces exactly one chunk.
 * - Overlap is trimmed to the target chunk size.
 */
export function chunkKnowledgeText(text: string): KnowledgeChunk[] {
  const normalized = text.trim();

  if (!normalized) {
    return [];
  }

  const targetChars = KNOWLEDGE_CHUNK_TARGET_TOKENS * KNOWLEDGE_CHARS_PER_TOKEN;
  const overlapChars = KNOWLEDGE_CHUNK_OVERLAP_TOKENS * KNOWLEDGE_CHARS_PER_TOKEN;

  if (normalized.length <= targetChars) {
    const chunk = normalized.trim();

    return [
      {
        content: chunk,
        contentHash: hashChunk(chunk),
        tokenEstimate: estimateTokens(chunk),
      },
    ];
  }

  // Prefer paragraph boundaries; fall back to line boundaries; final fallback
  // is a plain character window.
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  function flush() {
    const trimmed = current.trim();

    if (trimmed) {
      chunks.push(trimmed);
    }

    current = "";
  }

  if (paragraphs.length > 1) {
    for (const paragraph of paragraphs) {
      if (current.length + paragraph.length + 2 <= targetChars) {
        current = current ? `${current}\n\n${paragraph}` : paragraph;
      } else {
        flush();

        if (paragraph.length > targetChars) {
          // Oversized paragraph — split on lines, then on characters.
          const lines = paragraph.split("\n");
          let lineWindow = "";

          for (const line of lines) {
            if (lineWindow.length + line.length + 1 <= targetChars) {
              lineWindow = lineWindow ? `${lineWindow}\n${line}` : line;
            } else {
              if (lineWindow) {
                chunks.push(lineWindow.trim());
              }

              lineWindow = line;
            }
          }

          if (lineWindow.trim()) {
            chunks.push(lineWindow.trim());
          }
        }
      }
    }

    flush();
  } else {
    // No paragraph breaks — split on lines.
    const lines = normalized.split("\n");
    let lineWindow = "";

    for (const line of lines) {
      if (lineWindow.length + line.length + 1 <= targetChars) {
        lineWindow = lineWindow ? `${lineWindow}\n${line}` : line;
      } else {
        if (lineWindow) {
          chunks.push(lineWindow.trim());
        }

        lineWindow = line;
      }
    }

    if (lineWindow.trim()) {
      chunks.push(lineWindow.trim());
    }
  }

  // Apply overlap: each subsequent chunk re-includes the tail of the previous
  // chunk so context is not lost across boundaries.
  const overlapped: string[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];

    if (index === 0) {
      overlapped.push(chunk);
      continue;
    }

    const previous = chunks[index - 1];
    const overlapText = previous.slice(-overlapChars);

    const combined = `${overlapText}\n\n${chunk}`.trim();

    if (combined.length <= targetChars + overlapChars) {
      overlapped.push(combined);
    } else {
      overlapped.push(chunk);
    }
  }

  return overlapped
    .filter((content) => Boolean(content.trim()))
    .map((content) => {
      const trimmed = content.trim();

      return {
        content: trimmed,
        contentHash: hashChunk(trimmed),
        tokenEstimate: estimateTokens(trimmed),
      };
    });
}