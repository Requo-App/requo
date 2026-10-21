import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import {
  cosineSimilarity,
  EMBEDDING_MAX_ATTEMPTS_READ,
  generateEmbedding,
} from "@/lib/ai/embeddings";
import { matchedTerms, significantTerms } from "@/lib/ai/text-terms";
import { db } from "@/lib/db/client";
import {
  businessKnowledgeChunks,
  businessKnowledgeFiles,
  businessMemories,
} from "@/lib/db/schema";
import type { BusinessMemoryCategory } from "@/lib/db/schema/memories";

/**
 * Hybrid knowledge retriever for AI quote generation.
 *
 * Retrieval is business-scoped and context-only: evidence may shape wording,
 * scope, exclusions, and clarification questions, but it is never monetary
 * authority. Returns empty evidence for empty knowledge, a blank query, a
 * failed embedding, or when no candidate clears the conservative threshold.
 */

export type KnowledgeEvidence = {
  sourceType: "manual_memory" | "uploaded_file";
  sourceId: string;
  chunkId: string;
  title: string;
  content: string;
  score: number;
  confidence: "high" | "medium" | "low";
};

export type KnowledgeRetrievalResult = {
  evidence: KnowledgeEvidence[];
  usedRag: boolean;
};

export const KNOWLEDGE_TOP_K = 6;
export const KNOWLEDGE_TOKEN_BUDGET = 1_800;
export const KNOWLEDGE_CHARS_PER_TOKEN = 4;

/**
 * Candidate caps applied in SQL before scoring.
 *
 * Scoring happens in application code, so without a cap a business with a
 * large corpus loads every row into memory on every retrieval. These are set
 * well above the per-business volumes this pipeline was designed for, so they
 * only engage on outlier tenants — but they do truncate by recency, so a
 * relevant-but-ancient chunk can be missed on a very large corpus.
 */
export const KNOWLEDGE_CANDIDATE_LIMIT_MEMORIES = 200;
export const KNOWLEDGE_CANDIDATE_LIMIT_CHUNKS = 500;

const COMBINED_SCORE_THRESHOLD = 0.26;
const COSINE_FLOOR = 0.16;
const LEXICAL_ONLY_MIN_TERMS = 2;
const COSINE_WEIGHT = 0.65;
const LEXICAL_WEIGHT = 0.35;

type ScoredCandidate = {
  evidence: KnowledgeEvidence;
  cosineScore: number;
  lexicalScore: number;
};

function mapConfidence(score: number): KnowledgeEvidence["confidence"] {
  if (score >= 0.5) {
    return "high";
  }

  if (score >= 0.34) {
    return "medium";
  }

  return "low";
}

function estimateCharsForBudget(tokenBudget: number): number {
  return tokenBudget * KNOWLEDGE_CHARS_PER_TOKEN;
}

/**
 * Retrieves business knowledge relevant to a query using hybrid scoring:
 * cosine similarity over embeddings when available, combined with a lexical
 * keyword boost. Fail-safe by design — any failure path yields empty evidence.
 */
export async function retrieveBusinessKnowledge(input: {
  businessId: string;
  queryText: string;
  topK?: number;
  tokenBudget?: number;
  categories?: BusinessMemoryCategory[];
}): Promise<KnowledgeRetrievalResult> {
  const query = input.queryText.trim();

  if (!query) {
    return { evidence: [], usedRag: false };
  }

  const topK = Math.min(input.topK ?? KNOWLEDGE_TOP_K, 10);
  const tokenBudget = input.tokenBudget ?? KNOWLEDGE_TOKEN_BUDGET;

  // Load sources in parallel: manual memories (optionally category-filtered)
  // and chunks from ready files only. Both are capped by recency so a large
  // corpus cannot load unbounded rows into memory for in-process scoring.
  const [memories, fileChunks] = await Promise.all([
    db
      .select({
        id: businessMemories.id,
        title: businessMemories.title,
        content: businessMemories.content,
        embedding: businessMemories.embedding,
      })
      .from(businessMemories)
      .where(
        and(
          eq(businessMemories.businessId, input.businessId),
          ...(input.categories?.length
            ? [inArray(businessMemories.category, input.categories)]
            : []),
        ),
      )
      .orderBy(desc(businessMemories.updatedAt))
      .limit(KNOWLEDGE_CANDIDATE_LIMIT_MEMORIES),
    db
      .select({
        chunkId: businessKnowledgeChunks.id,
        fileId: businessKnowledgeChunks.fileId,
        content: businessKnowledgeChunks.content,
        embedding: businessKnowledgeChunks.embedding,
        fileName: businessKnowledgeFiles.originalFileName,
      })
      .from(businessKnowledgeChunks)
      .innerJoin(
        businessKnowledgeFiles,
        eq(businessKnowledgeChunks.fileId, businessKnowledgeFiles.id),
      )
      .where(
        and(
          eq(businessKnowledgeChunks.businessId, input.businessId),
          eq(businessKnowledgeFiles.status, "ready"),
        ),
      )
      .orderBy(desc(businessKnowledgeChunks.updatedAt))
      .limit(KNOWLEDGE_CANDIDATE_LIMIT_CHUNKS),
  ]);

  if (memories.length === 0 && fileChunks.length === 0) {
    return { evidence: [], usedRag: false };
  }

  const candidates: Array<{
    sourceType: KnowledgeEvidence["sourceType"];
    sourceId: string;
    chunkId: string;
    title: string;
    content: string;
    embedding: number[] | null;
  }> = [];

  for (const memory of memories) {
    candidates.push({
      sourceType: "manual_memory",
      sourceId: memory.id,
      chunkId: memory.id,
      title: memory.title,
      content: memory.content,
      embedding: memory.embedding,
    });
  }

  for (const chunk of fileChunks) {
    candidates.push({
      sourceType: "uploaded_file",
      sourceId: chunk.fileId,
      chunkId: chunk.chunkId,
      title: chunk.fileName,
      content: chunk.content,
      embedding: chunk.embedding,
    });
  }

  // Query embedding is best-effort; lexical retrieval must always work. This
  // sits on the user's critical path, so it gets a single attempt — a transient
  // provider failure should fall back to lexical immediately rather than stall
  // quote generation. Ingestion uses the retrying write-path budget instead.
  const queryEmbedding = await generateEmbedding(query, {
    maxAttempts: EMBEDDING_MAX_ATTEMPTS_READ,
  }).catch(() => null);

  const terms = significantTerms(query);
  const scored: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    const cosine =
      queryEmbedding && candidate.embedding
        ? cosineSimilarity(queryEmbedding, candidate.embedding)
        : 0;

    // Whole-token matching: a term counts only when the content contains it as
    // a word, not as a substring of a longer one.
    const matched = matchedTerms(candidate.content, terms);
    const lexical = terms.length === 0 ? 0 : matched.length / terms.length;

    // Lexical-only fallback: require several distinctive terms to match.
    if (!queryEmbedding && matched.length < LEXICAL_ONLY_MIN_TERMS) {
      continue;
    }

    const combined =
      cosine * COSINE_WEIGHT + lexical * LEXICAL_WEIGHT;

    if (combined < COMBINED_SCORE_THRESHOLD) {
      continue;
    }

    if (queryEmbedding && cosine < COSINE_FLOOR) {
      continue;
    }

    scored.push({
      evidence: {
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        chunkId: candidate.chunkId,
        title: candidate.title,
        content: candidate.content,
        score: combined,
        confidence: mapConfidence(combined),
      },
      cosineScore: cosine,
      lexicalScore: lexical,
    });
  }

  if (scored.length === 0) {
    return { evidence: [], usedRag: false };
  }

  // Rank by combined score, then apply the token budget.
  scored.sort((a, b) => b.evidence.score - a.evidence.score);

  const budgetChars = estimateCharsForBudget(tokenBudget);
  const selected: KnowledgeEvidence[] = [];
  let usedChars = 0;

  for (const candidate of scored) {
    if (selected.length >= topK) {
      break;
    }

    const contentChars = candidate.evidence.content.length + 40; // title + framing

    if (usedChars + contentChars > budgetChars) {
      break;
    }

    selected.push(candidate.evidence);
    usedChars += contentChars;
  }

  return {
    evidence: selected,
    usedRag: selected.length > 0,
  };
}

/**
 * The fence that wraps retrieved knowledge in a prompt. Knowledge content is
 * business-authored, but it is not an instruction channel: a prompt that
 * treats it as one lets a knowledge entry steer the model.
 */
export const UNTRUSTED_KNOWLEDGE_OPEN = "<untrusted_business_knowledge>";
export const UNTRUSTED_KNOWLEDGE_CLOSE = "</untrusted_business_knowledge>";

/** Remove the knowledge fence tags from retrieved content. */
function stripKnowledgeFenceTags(value: string): string {
  return value.replace(
    /<\s*\/?\s*untrusted[_\s-]*(business[_\s-]*knowledge|knowledge|customer[_\s-]*content)\s*>/gi,
    "",
  );
}

/**
 * Formats retrieved evidence for a prompt, keeping source/chunk IDs attached
 * so the final draft can cite the exact evidence used.
 *
 * The content is fenced: it is data the model may draw scope and wording
 * from, never an instruction it may follow.
 */
export function formatKnowledgeEvidence(
  evidence: KnowledgeEvidence[],
): string {
  if (evidence.length === 0) {
    return "- No saved business knowledge.";
  }

  const entries = evidence
    .map(
      (entry) =>
        `- [${entry.sourceType === "manual_memory" ? "Memory" : "File"}: "${entry.title}" (source:${entry.sourceId}, chunk:${entry.chunkId}, confidence:${entry.confidence})]\n  ${stripKnowledgeFenceTags(entry.content).slice(0, 1200)}`,
    )
    .join("\n\n");

  return [
    UNTRUSTED_KNOWLEDGE_OPEN,
    entries,
    UNTRUSTED_KNOWLEDGE_CLOSE,
  ].join("\n");
}