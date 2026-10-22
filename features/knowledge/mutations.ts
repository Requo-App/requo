import "server-only";

import { and, count, eq } from "drizzle-orm";
import { updateTag } from "next/cache";

import { getKnowledgeCacheTags } from "@/lib/cache/business-tags";
import { knowledgeEmbeddingText } from "@/features/knowledge/embedding-text";
import { newEntityId } from "@/lib/ids";
import type {
  KnowledgeEntryInput,
  KnowledgeEntryUpdate,
} from "@/features/knowledge/schemas";
import { db } from "@/lib/db/client";
import { knowledgeEntries } from "@/lib/db/schema";
import {
  generateEmbedding,
  invalidateEmbeddingCache,
} from "@/lib/ai/embeddings";

function invalidateKnowledgeCache(businessId: string) {
  for (const tag of getKnowledgeCacheTags(businessId)) {
    updateTag(tag);
  }
}

export async function createKnowledgeEntry({
  businessId,
  entry,
}: {
  businessId: string;
  entry: KnowledgeEntryInput;
}) {
  const [countRow] = await db
    .select({ total: count() })
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.businessId, businessId));

  const id = newEntityId();

  // Embedding generation is best-effort: a null embedding is stored and
  // retrieval falls back to lexical matching. The entry itself must persist.
  const embedding = await generateEmbedding(
    knowledgeEmbeddingText(entry.title, entry.content),
  );

  await db.insert(knowledgeEntries).values({
    id,
    businessId,
    title: entry.title,
    content: entry.content,
    category: entry.category,
    position: countRow?.total ?? 0,
    embedding,
  });

  invalidateKnowledgeCache(businessId);

  return { id };
}

export async function updateKnowledgeEntry({
  businessId,
  knowledgeEntryId,
  update,
}: {
  businessId: string;
  knowledgeEntryId: string;
  update: KnowledgeEntryUpdate;
}) {
  const [owned] = await db
    .select({
      id: knowledgeEntries.id,
      title: knowledgeEntries.title,
      content: knowledgeEntries.content,
    })
    .from(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.id, knowledgeEntryId),
        eq(knowledgeEntries.businessId, businessId),
      ),
    )
    .limit(1);

  if (!owned) {
    return null;
  }

  // Invalidate the old embedding cache before content changes.
  await invalidateEmbeddingCache(
    knowledgeEmbeddingText(owned.title, owned.content),
  );

  const nextTitle = update.title ?? owned.title;
  const nextContent = update.content ?? owned.content;

  const embedding = await generateEmbedding(
    knowledgeEmbeddingText(nextTitle, nextContent),
  );

  const setValues: Partial<typeof knowledgeEntries.$inferInsert> = {
    title: nextTitle,
    content: nextContent,
    embedding,
  };

  if (update.category !== undefined) {
    setValues.category = update.category;
  }

  if (update.position !== undefined) {
    setValues.position = update.position;
  }

  await db
    .update(knowledgeEntries)
    .set(setValues)
    .where(eq(knowledgeEntries.id, knowledgeEntryId));

  invalidateKnowledgeCache(businessId);

  return { id: knowledgeEntryId };
}

export async function deleteKnowledgeEntry({
  businessId,
  knowledgeEntryId,
}: {
  businessId: string;
  knowledgeEntryId: string;
}) {
  const [owned] = await db
    .select({
      id: knowledgeEntries.id,
      title: knowledgeEntries.title,
      content: knowledgeEntries.content,
    })
    .from(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.id, knowledgeEntryId),
        eq(knowledgeEntries.businessId, businessId),
      ),
    )
    .limit(1);

  if (!owned) {
    return null;
  }

  await invalidateEmbeddingCache(
    knowledgeEmbeddingText(owned.title, owned.content),
  );

  await db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, knowledgeEntryId));

  invalidateKnowledgeCache(businessId);

  return { id: knowledgeEntryId };
}
