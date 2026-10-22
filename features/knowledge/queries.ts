import "server-only";

import { and, asc, count, desc, eq, isNotNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db/client";
import {
  businessKnowledgeFiles,
  knowledgeEntries,
} from "@/lib/db/schema";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import type { PlanTier } from "@/lib/plans/plans";
import type {
  KnowledgeFileRow,
  KnowledgeSummary,
  KnowledgeRow,
} from "@/features/knowledge/types";

export const listKnowledgeEntries = cache(async (
  businessId: string,
): Promise<KnowledgeRow[]> => {
  const rows = await db
    .select({
      id: knowledgeEntries.id,
      title: knowledgeEntries.title,
      content: knowledgeEntries.content,
      category: knowledgeEntries.category,
      position: knowledgeEntries.position,
      createdAt: knowledgeEntries.createdAt,
      updatedAt: knowledgeEntries.updatedAt,
    })
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.businessId, businessId))
    .orderBy(
      asc(knowledgeEntries.position),
      asc(knowledgeEntries.createdAt),
    );

  // Whether a row is embedded is computed in SQL. Selecting the vector
  // itself shipped ~768 floats per row into the client payload, which the
  // knowledge manager never reads.
  const embeddingRows = await db
    .select({ id: knowledgeEntries.id })
    .from(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.businessId, businessId),
        isNotNull(knowledgeEntries.embedding),
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
  const [knowledgeCount, fileCount] = await Promise.all([
    db
      .select({ count: count() })
      .from(knowledgeEntries)
      .where(eq(knowledgeEntries.businessId, businessId)),
    db
      .select({ count: count() })
      .from(businessKnowledgeFiles)
      .where(eq(businessKnowledgeFiles.businessId, businessId)),
  ]);

  return (knowledgeCount[0]?.count ?? 0) + (fileCount[0]?.count ?? 0);
});

export const getBusinessKnowledgeSummary = cache(async (
  businessId: string,
  plan: PlanTier,
): Promise<KnowledgeSummary> => {
  const [knowledgeCount, fileRows] = await Promise.all([
    db
      .select({ count: count() })
      .from(knowledgeEntries)
      .where(eq(knowledgeEntries.businessId, businessId)),
    db
      .select({
        status: businessKnowledgeFiles.status,
        count: count(),
      })
      .from(businessKnowledgeFiles)
      .where(eq(businessKnowledgeFiles.businessId, businessId))
      .groupBy(businessKnowledgeFiles.status),
  ]);

  const knowledgeTotal = knowledgeCount[0]?.count ?? 0;
  const fileTotal = fileRows.reduce((sum, row) => sum + row.count, 0);

  const byStatus = new Map(fileRows.map((row) => [row.status, row.count]));

  return {
    sourceCount: knowledgeTotal + fileTotal,
    sourceLimit: getUsageLimit(plan, "knowledgeSourcesPerBusiness"),
    knowledgeCount: knowledgeTotal,
    fileCount: fileTotal,
    readyFileCount: byStatus.get("ready") ?? 0,
    processingCount:
      (byStatus.get("processing") ?? 0) + (byStatus.get("pending") ?? 0),
    failedFileCount: byStatus.get("failed") ?? 0,
  };
});
