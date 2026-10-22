import "server-only";

import { and, eq } from "drizzle-orm";

import { chunkKnowledgeText } from "@/features/knowledge/chunking";
import { extractKnowledgeText } from "@/features/knowledge/extraction";
import { invalidateKnowledgeCache } from "@/features/knowledge/knowledge-cache";
import { KNOWLEDGE_FILE_MAX_BYTES } from "@/features/knowledge/types";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { sanitizeKnowledgeContent } from "@/lib/ai/input-sanitizer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/db/client";
import { newEntityId } from "@/lib/ids";
import {
  businessKnowledgeChunks,
  businessKnowledgeFiles,
} from "@/lib/db/schema";

export const KNOWLEDGE_FILES_BUCKET = "knowledge-files";

export const knowledgeFileFailureReasons = {
  notFound: "The file could not be found. Try uploading it again.",
  unreadable: "The file could not be read. Try uploading it again.",
  empty: "The file contained no readable text.",
  tooLarge: "The extracted text is too large to index.",
  unsafe: "The file content could not be processed.",
  unsupported: "This file type is not supported. Use PDF, CSV, TXT, or Markdown.",
} as const;

async function downloadKnowledgeFile(storagePath: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(KNOWLEDGE_FILES_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

async function removeStoredFile(storagePath: string) {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.storage.from(KNOWLEDGE_FILES_BUCKET).remove([storagePath]);
  } catch {
    // Best-effort cleanup.
  }
}

/**
 * Processes a knowledge file end-to-end: download, extract, sanitize, chunk,
 * embed, and transactionally replace previous chunks.
 *
 * Runs inside the Inngest background processor. Failure never deletes the
 * uploaded source; the file row is marked `failed` with a safe reason and the
 * UI exposes retry/delete.
 */
export async function processKnowledgeFile({
  businessId,
  fileId,
}: {
  businessId: string;
  fileId: string;
}): Promise<
  | { ok: true; chunkCount: number; extractedCharacterCount: number }
  | { ok: false; failureReason: string }
> {
  const [fileRow] = await db
    .select({
      id: businessKnowledgeFiles.id,
      businessId: businessKnowledgeFiles.businessId,
      storagePath: businessKnowledgeFiles.storagePath,
      mimeType: businessKnowledgeFiles.mimeType,
      originalFileName: businessKnowledgeFiles.originalFileName,
      byteSize: businessKnowledgeFiles.byteSize,
    })
    .from(businessKnowledgeFiles)
    .where(
      and(
        eq(businessKnowledgeFiles.id, fileId),
        eq(businessKnowledgeFiles.businessId, businessId),
      ),
    )
    .limit(1);

  if (!fileRow) {
    return {
      ok: false,
      failureReason: knowledgeFileFailureReasons.notFound,
    };
  }

  // Re-enforce the size limit in the background processor.
  if (fileRow.byteSize > KNOWLEDGE_FILE_MAX_BYTES) {
    await markFileFailed(fileRow.id, fileRow.businessId, knowledgeFileFailureReasons.tooLarge);
    return {
      ok: false,
      failureReason: knowledgeFileFailureReasons.tooLarge,
    };
  }

  await db
    .update(businessKnowledgeFiles)
    .set({
      status: "processing",
      failureReason: null,
      updatedAt: new Date(),
    })
    .where(eq(businessKnowledgeFiles.id, fileId));

  let extracted: Awaited<ReturnType<typeof extractKnowledgeText>>;

  try {
    const bytes = await downloadKnowledgeFile(fileRow.storagePath);
    extracted = await extractKnowledgeText({
      mimeType: fileRow.mimeType,
      fileName: fileRow.originalFileName,
      bytes,
    });
  } catch {
    await markFileFailed(fileRow.id, fileRow.businessId, knowledgeFileFailureReasons.unreadable);
    return {
      ok: false,
      failureReason: knowledgeFileFailureReasons.unreadable,
    };
  }

  if (!extracted.text.trim()) {
    await markFileFailed(fileRow.id, fileRow.businessId, knowledgeFileFailureReasons.empty);
    return {
      ok: false,
      failureReason: knowledgeFileFailureReasons.empty,
    };
  }

  // Prompt-injection guard: reject content with high-confidence patterns
  // before it reaches indexing or retrieval.
  const sanitization = sanitizeKnowledgeContent("", extracted.text);

  if (sanitization.status === "rejected") {
    await markFileFailed(fileRow.id, fileRow.businessId, knowledgeFileFailureReasons.unsafe);
    return {
      ok: false,
      failureReason: knowledgeFileFailureReasons.unsafe,
    };
  }

  const safeText = sanitization.output || extracted.text;
  const chunks = chunkKnowledgeText(safeText);

  if (chunks.length === 0) {
    await markFileFailed(fileRow.id, fileRow.businessId, knowledgeFileFailureReasons.empty);
    return {
      ok: false,
      failureReason: knowledgeFileFailureReasons.empty,
    };
  }

  // Embeddings are best-effort: null entries fall back to lexical retrieval.
  const embeddings = await generateEmbeddings(chunks.map((chunk) => chunk.content));

  try {
    await db.transaction(async (tx) => {
      // Replace previous chunks atomically (retry case).
      await tx
        .delete(businessKnowledgeChunks)
        .where(
          and(
            eq(businessKnowledgeChunks.fileId, fileId),
            eq(businessKnowledgeChunks.businessId, businessId),
          ),
        );

      if (chunks.length > 0) {
        await tx.insert(businessKnowledgeChunks).values(
          chunks.map((chunk, index) => ({
            id: newEntityId(),
            businessId,
            fileId,
            position: index,
            content: chunk.content,
            contentHash: chunk.contentHash,
            embedding: embeddings[index] ?? null,
            tokenEstimate: chunk.tokenEstimate,
          })),
        );
      }
    });
  } catch {
    await markFileFailed(fileRow.id, fileRow.businessId, knowledgeFileFailureReasons.unreadable);
    return {
      ok: false,
      failureReason: knowledgeFileFailureReasons.unreadable,
    };
  }

  await db
    .update(businessKnowledgeFiles)
    .set({
      status: "ready",
      extractedCharacterCount: extracted.extractedCharacterCount,
      failureReason: null,
      updatedAt: new Date(),
    })
    .where(eq(businessKnowledgeFiles.id, fileId));

  invalidateKnowledgeCache(businessId);

  return {
    ok: true,
    chunkCount: chunks.length,
    extractedCharacterCount: extracted.extractedCharacterCount,
  };
}

async function markFileFailed(
  fileId: string,
  businessId: string,
  failureReason: string,
) {
  await db
    .update(businessKnowledgeFiles)
    .set({
      status: "failed",
      failureReason,
      updatedAt: new Date(),
    })
    .where(eq(businessKnowledgeFiles.id, fileId));

  invalidateKnowledgeCache(businessId);
}

export async function deleteKnowledgeFileForBusiness({
  businessId,
  fileId,
}: {
  businessId: string;
  fileId: string;
}) {
  const [owned] = await db
    .select({
      id: businessKnowledgeFiles.id,
      storagePath: businessKnowledgeFiles.storagePath,
    })
    .from(businessKnowledgeFiles)
    .where(
      and(
        eq(businessKnowledgeFiles.id, fileId),
        eq(businessKnowledgeFiles.businessId, businessId),
      ),
    )
    .limit(1);

  if (!owned) {
    return null;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(businessKnowledgeChunks)
      .where(eq(businessKnowledgeChunks.fileId, fileId));
    await tx
      .delete(businessKnowledgeFiles)
      .where(eq(businessKnowledgeFiles.id, fileId));
  });

  await removeStoredFile(owned.storagePath);
  invalidateKnowledgeCache(businessId);

  return { id: fileId };
}