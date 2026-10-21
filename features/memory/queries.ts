import "server-only";

import { and, asc, count, desc, eq, isNotNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db/client";
import {
  businessKnowledgeFiles,
  businessMemories,
} from "@/lib/db/schema";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import type { BusinessPlan } from "@/lib/plans/plans";
import type {
  KnowledgeFileRow,
  KnowledgeSummary,
  MemoryRow,
} from "@/features/memory/types";

export const listBusinessMemories = cache(async (
  businessId: string,
): Promise<MemoryRow[]> => {
  const rows = await db
    .select({
      id: businessMemories.id,
      title: businessMemories.title,
      content: businessMemories.content,
      category: businessMemories.category,
      position: businessMemories.position,
      createdAt: businessMemories.createdAt,
      updatedAt: businessMemories.updatedAt,
    })
    .from(businessMemories)
    .where(eq(businessMemories.businessId, businessId))
    .orderBy(
      asc(businessMemories.position),
      asc(businessMemories.createdAt),
    );

  // Whether a row is embedded is computed in SQL. Selecting the vector
  // itself shipped ~768 floats per row into the client payload, which the
  // knowledge manager never reads.
  const embeddingRows = await db
    .select({ id: businessMemories.id })
    .from(businessMemories)
    .where(
      and(
        eq(businessMemories.businessId, businessId),
        isNotNull(businessMemories.embedding),
      ),
    );

  const embeddedIds = new Set(embeddingRows.map((row) => row.id));

  return rows.map((row) => ({
    ...row,
    hasEmbedding: embeddedIds.has(row.id),
  }));
});

export const listBusinessKnowledgeFiles = cache(async (
  businessId: string,
): Promise<KnowledgeFileRow[]> => {
  const rows = await db
    .select({
      id: businessKnowledgeFiles.id,
      originalFileName: businessKnowledgeFiles.originalFileName,
      mimeType: businessKnowledgeFiles.mimeType,
      byteSize: businessKnowledgeFiles.byteSize,
      status: businessKnowledgeFiles.status,
      extractedCharacterCount: businessKnowledgeFiles.extractedCharacterCount,
      failureReason: businessKnowledgeFiles.failureReason,
      createdAt: businessKnowledgeFiles.createdAt,
      updatedAt: businessKnowledgeFiles.updatedAt,
    })
    .from(businessKnowledgeFiles)
    .where(eq(businessKnowledgeFiles.businessId, businessId))
    .orderBy(desc(businessKnowledgeFiles.createdAt));

  return rows;
});

export const countBusinessKnowledgeSources = cache(async (
  businessId: string,
): Promise<number> => {
  const [memoryCount, fileCount] = await Promise.all([
    db
      .select({ count: count() })
      .from(businessMemories)
      .where(eq(businessMemories.businessId, businessId)),
    db
      .select({ count: count() })
      .from(businessKnowledgeFiles)
      .where(eq(businessKnowledgeFiles.businessId, businessId)),
  ]);

  return (memoryCount[0]?.count ?? 0) + (fileCount[0]?.count ?? 0);
});

export const getBusinessKnowledgeSummary = cache(async (
  businessId: string,
  plan: BusinessPlan,
): Promise<KnowledgeSummary> => {
  const [memoryCount, fileRows] = await Promise.all([
    db
      .select({ count: count() })
      .from(businessMemories)
      .where(eq(businessMemories.businessId, businessId)),
    db
      .select({
        status: businessKnowledgeFiles.status,
        count: count(),
      })
      .from(businessKnowledgeFiles)
      .where(eq(businessKnowledgeFiles.businessId, businessId))
      .groupBy(businessKnowledgeFiles.status),
  ]);

  const memoryTotal = memoryCount[0]?.count ?? 0;
  const fileTotal = fileRows.reduce((sum, row) => sum + row.count, 0);

  const byStatus = new Map(fileRows.map((row) => [row.status, row.count]));

  return {
    sourceCount: memoryTotal + fileTotal,
    sourceLimit: getUsageLimit(plan, "knowledgeSourcesPerBusiness"),
    memoryCount: memoryTotal,
    fileCount: fileTotal,
    readyFileCount: byStatus.get("ready") ?? 0,
    processingCount:
      (byStatus.get("processing") ?? 0) + (byStatus.get("pending") ?? 0),
    failedFileCount: byStatus.get("failed") ?? 0,
  };
});
