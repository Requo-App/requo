export type { KnowledgeCategory } from "@/lib/db/schema/knowledge";
export type { KnowledgeFileStatus } from "@/lib/db/schema/knowledge-files";
import type { KnowledgeCategory } from "@/lib/db/schema/knowledge";
import type { KnowledgeFileStatus } from "@/lib/db/schema/knowledge-files";

export const knowledgeCategoryLabels: Record<KnowledgeCategory, string> = {
  business_rules: "Business rules",
  customer_context: "Customer context",
  workflow_preferences: "Workflow preferences",
  pricing_knowledge: "Pricing knowledge",
};

/**
 * Pricing knowledge is a legacy/context-only category: it may shape wording,
 * scope, and clarification questions but never authorizes a generated price.
 */
export const KNOWLEDGE_CONTEXT_CATEGORIES: readonly KnowledgeCategory[] = [
  "business_rules",
  "customer_context",
  "workflow_preferences",
  "pricing_knowledge",
];

/** Max manual entry content length (mirrors the DB check constraint). */
export const KNOWLEDGE_CONTENT_MAX_LENGTH = 4000;
/** Max manual entry title length (mirrors the DB check constraint). */
export const KNOWLEDGE_TITLE_MAX_LENGTH = 200;

/** Uploaded knowledge file max size (5 MB, same convention as inquiry uploads). */
export const KNOWLEDGE_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** MIME/extensions accepted for knowledge file uploads. */
export const KNOWLEDGE_FILE_ACCEPT = [
  "application/pdf",
  "text/csv",
  "text/plain",
  "text/markdown",
] as const;

export const KNOWLEDGE_FILE_ACCEPT_EXTENSIONS = [
  ".pdf",
  ".csv",
  ".txt",
  ".md",
  ".markdown",
] as const;

/** Max extracted characters accepted for indexing (mirrors importer). */
export const KNOWLEDGE_MAX_EXTRACTED_CHARS = 80_000;

/** Target chunk size in tokens and overlap for file chunking. */
export const KNOWLEDGE_CHUNK_TARGET_TOKENS = 800;
export const KNOWLEDGE_CHUNK_OVERLAP_TOKENS = 100;

export type KnowledgeRow = {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  position: number;
  hasEmbedding: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeFileRow = {
  id: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  status: KnowledgeFileStatus;
  extractedCharacterCount: number | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeSummary = {
  sourceCount: number;
  sourceLimit: number | null;
  knowledgeCount: number;
  fileCount: number;
  readyFileCount: number;
  processingCount: number;
  failedFileCount: number;
};

export const knowledgeFileStatusLabels: Record<KnowledgeFileStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};