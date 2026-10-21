import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { memoryEmbeddingText } from "@/features/memory/embedding-text";
import { invalidateKnowledgeCache } from "@/features/memory/knowledge-cache";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { db } from "@/lib/db/client";
import {
  businessKnowledgeChunks,
  businessKnowledgeFiles,
  businessMemories,
} from "@/lib/db/schema";
import { isGeminiConfigured } from "@/lib/env";

/**
 * Repairs rows whose embedding is `null`.
 *
 * Embedding generation is best-effort on the write path: a provider outage or
 * a rate limit leaves `null` behind and retrieval silently degrades to lexical
 * matching for that content. Nothing else ever revisits those rows, so without
 * this job the degradation is permanent. Runs hourly via Inngest
 * (`cron-embedding-backfill`).
 *
 * Scope is deliberately narrow — it only fills `IS NULL` rows. It never
 * re-embeds content that changed, because `business_memories` has no content
 * hash to detect staleness with, and re-embedding every chunk on every run
 * would cost a full provider sweep per hour.
 */

export const EMBEDDING_BACKFILL_BATCH_SIZE = 100; // per table, per run

export type EmbeddingBackfillSummary = {
  chunksScanned: number;
  chunksBackfilled: number;
  memoriesScanned: number;
  memoriesBackfilled: number;
  stillNull: number;
  businessesTouched: number;
  skipped?: "gemini-not-configured";
};

const EMPTY_SUMMARY: EmbeddingBackfillSummary = {
  chunksScanned: 0,
  chunksBackfilled: 0,
  memoriesScanned: 0,
  memoriesBackfilled: 0,
  stillNull: 0,
  businessesTouched: 0,
};

export async function backfillMissingEmbeddings(): Promise<EmbeddingBackfillSummary> {
  if (!isGeminiConfigured) {
    return { ...EMPTY_SUMMARY, skipped: "gemini-not-configured" };
  }

  const [chunkRows, memoryRows] = await Promise.all([
    db
      .select({
        id: businessKnowledgeChunks.id,
        businessId: businessKnowledgeChunks.businessId,
        content: businessKnowledgeChunks.content,
      })
      .from(businessKnowledgeChunks)
      .innerJoin(
        businessKnowledgeFiles,
        eq(businessKnowledgeChunks.fileId, businessKnowledgeFiles.id),
      )
      .where(
        and(
          isNull(businessKnowledgeChunks.embedding),
          // Only files that finished processing — a failed upload has no
          // trustworthy text to embed.
          eq(businessKnowledgeFiles.status, "ready"),
        ),
      )
      // Ordered by creation, not by the timestamp the job itself updates.
      // Ordering by `updatedAt` re-selected the rows that failed to embed
      // first, forever: the same poison rows were retried every hour and
      // everything behind them was never repaired.
      .orderBy(asc(businessKnowledgeChunks.createdAt))
      .limit(EMBEDDING_BACKFILL_BATCH_SIZE),
    db
      .select({
        id: businessMemories.id,
        businessId: businessMemories.businessId,
        title: businessMemories.title,
        content: businessMemories.content,
      })
      .from(businessMemories)
      .where(isNull(businessMemories.embedding))
      .orderBy(asc(businessMemories.createdAt))
      .limit(EMBEDDING_BACKFILL_BATCH_SIZE),
  ]);

  const touchedBusinessIds = new Set<string>();
  let chunksBackfilled = 0;
  let memoriesBackfilled = 0;

  if (chunkRows.length > 0) {
    const embeddings = await generateEmbeddings(
      chunkRows.map((row) => row.content),
    );

    for (let index = 0; index < chunkRows.length; index++) {
      const embedding = embeddings[index];

      if (!embedding) {
        continue;
      }

      const row = chunkRows[index];

      await db
        .update(businessKnowledgeChunks)
        .set({ embedding, updatedAt: new Date() })
        .where(eq(businessKnowledgeChunks.id, row.id));

      touchedBusinessIds.add(row.businessId);
      chunksBackfilled++;
    }
  }

  if (memoryRows.length > 0) {
    // Must match the write path exactly, or the memory lands in a different
    // part of the vector space than the one retrieval queries.
    const embeddings = await generateEmbeddings(
      memoryRows.map((row) => memoryEmbeddingText(row.title, row.content)),
    );

    for (let index = 0; index < memoryRows.length; index++) {
      const embedding = embeddings[index];

      if (!embedding) {
        continue;
      }

      const row = memoryRows[index];

      await db
        .update(businessMemories)
        .set({ embedding, updatedAt: new Date() })
        .where(eq(businessMemories.id, row.id));

      touchedBusinessIds.add(row.businessId);
      memoriesBackfilled++;
    }
  }

  // Only after the rows are committed, so a reader never gets a cache miss
  // followed by a stale null.
  for (const businessId of touchedBusinessIds) {
    invalidateKnowledgeCache(businessId);
  }

  const summary: EmbeddingBackfillSummary = {
    chunksScanned: chunkRows.length,
    chunksBackfilled,
    memoriesScanned: memoryRows.length,
    memoriesBackfilled,
    stillNull:
      chunkRows.length -
      chunksBackfilled +
      (memoryRows.length - memoriesBackfilled),
    businessesTouched: touchedBusinessIds.size,
  };

  console.info(
    JSON.stringify({
      type: "embedding_backfill",
      timestamp: new Date().toISOString(),
      ...summary,
    }),
  );

  return summary;
}
