import "server-only";

import { extractRawText as mammothExtractRawText } from "mammoth";
import { extractText as unpdfExtractText } from "unpdf";

import { KNOWLEDGE_MAX_EXTRACTED_CHARS } from "@/features/knowledge/types";

/**
 * Deterministic knowledge file extraction.
 *
 * Text formats (CSV/TXT/Markdown) are decoded with normalized UTF-8 handling.
 * PDFs use server-side text extraction with page boundaries preserved as
 * markers so retrieval can reference page-level context. DOCX uses raw-text
 * extraction (formatting dropped — chat and knowledge flows only need words).
 */

export type ExtractedKnowledgeText = {
  text: string;
  truncated: boolean;
  extractedCharacterCount: number;
};

function normalizeText(input: string): {
  text: string;
  truncated: boolean;
} {
  // Strip BOM and normalize line endings.
  const cleaned = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (cleaned.length <= KNOWLEDGE_MAX_EXTRACTED_CHARS) {
    return { text: cleaned, truncated: false };
  }

  // Keep the head + a tail so long documents don't lose their final tables.
  const headSize = Math.floor(KNOWLEDGE_MAX_EXTRACTED_CHARS * 0.75);
  const tailSize = KNOWLEDGE_MAX_EXTRACTED_CHARS - headSize - 40;
  const head = cleaned.slice(0, headSize).trimEnd();
  const tail = cleaned.slice(-tailSize).trimStart();

  return {
    text: `${head}\n\n[...truncated for length...]\n\n${tail}`,
    truncated: true,
  };
}

export async function extractKnowledgeText({
  mimeType,
  fileName,
  bytes,
}: {
  mimeType: string;
  fileName: string;
  bytes: Buffer | Uint8Array;
}): Promise<ExtractedKnowledgeText> {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  const isPdf =
    lowerMime === "application/pdf" || lowerName.endsWith(".pdf");
  const isDocx =
    lowerMime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx");
  const isTextual =
    lowerMime === "text/csv" ||
    lowerMime === "application/csv" ||
    lowerMime === "text/plain" ||
    lowerMime === "text/markdown" ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".markdown");

  if (isPdf) {
    return extractPdfText(bytes);
  }

  if (isDocx) {
    return extractDocxText(bytes);
  }

  if (isTextual) {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const { text, truncated } = normalizeText(decoded);

    return {
      text,
      truncated,
      extractedCharacterCount: text.length,
    };
  }

  throw new Error("Unsupported file type. Upload a PDF, DOCX, CSV, TXT, or Markdown file.");
}

async function extractDocxText(
  bytes: Buffer | Uint8Array,
): Promise<ExtractedKnowledgeText> {
  const { value } = await mammothExtractRawText({
    buffer: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
  });
  const { text, truncated } = normalizeText(value ?? "");

  return {
    text,
    truncated,
    extractedCharacterCount: text.length,
  };
}

async function extractPdfText(
  bytes: Buffer | Uint8Array,
): Promise<ExtractedKnowledgeText> {
  // mergePages: false keeps page boundaries so we can tag chunks with
  // [Page N] markers that survive into retrieval evidence.
  const { text: pages } = await unpdfExtractText(bytes, { mergePages: false });

  if (pages.length === 0 || pages.every((page) => !page.trim())) {
    return {
      text: "",
      truncated: false,
      extractedCharacterCount: 0,
    };
  }

  const merged = pages
    .map((page, index) => {
      const normalized = normalizeText(page).text;

      if (!normalized) {
        return null;
      }

      return `[Page ${index + 1}]\n${normalized}`;
    })
    .filter((page): page is string => Boolean(page))
    .join("\n\n");

  const { text: finalText, truncated } = normalizeText(merged);

  return {
    text: finalText,
    truncated,
    extractedCharacterCount: finalText.length,
  };
}