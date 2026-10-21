/**
 * Search Knowledge Tool
 *
 * Searches the business knowledge base (manual memories + uploaded files)
 * through the shared RAG retrieval service. Business-scoped by construction.
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { searchKnowledgeSchema } from "../schemas";
import {
  retrieveBusinessKnowledge,
  UNTRUSTED_KNOWLEDGE_CLOSE,
  UNTRUSTED_KNOWLEDGE_OPEN,
} from "@/features/memory/retrieval";
import type { BusinessMemoryCategory } from "@/lib/db/schema/memories";
import type { ErrorResult, ToolExecutionContext } from "../types";

type SearchKnowledgeInput = z.infer<typeof searchKnowledgeSchema>;

type SearchKnowledgeOutput =
  | {
      type: "knowledge_results";
      data: {
        chunks: Array<{
          id: string;
          content: string;
          category: string | null;
          relevanceScore: number | null;
          fileName: string | null;
        }>;
        query: string;
      };
      summary: string;
      metadata?: Record<string, unknown>;
    }
  | ErrorResult;

export const searchKnowledgeTool = tool<
  SearchKnowledgeInput,
  SearchKnowledgeOutput
>({
  description:
    "Search the business knowledge base for business rules, customer context, workflow preferences, and pricing knowledge.",
  inputSchema: searchKnowledgeSchema,
  execute: async (params: SearchKnowledgeInput, options: ToolExecutionOptions) => {
    const context = options.experimental_context as ToolExecutionContext;

    try {
      const result = await retrieveBusinessKnowledge({
        businessId: context.businessId,
        queryText: params.query,
        topK: params.limit,
        categories: params.categories as BusinessMemoryCategory[] | undefined,
      });

      const chunks = result.evidence.map((item) => ({
        id: item.chunkId,
        // The knowledge content is returned as data, fenced so it cannot act
        // as an instruction for the tool-calling model.
        content: [
          UNTRUSTED_KNOWLEDGE_OPEN,
          `${item.title}\n${item.content}`,
          UNTRUSTED_KNOWLEDGE_CLOSE,
        ].join("\n"),
        category: item.sourceType === "manual_memory" ? "business_rules" : null,
        relevanceScore: item.score,
        fileName: item.sourceType === "uploaded_file" ? item.title : null,
      }));

      return {
        type: "knowledge_results",
        data: { chunks, query: params.query },
        summary:
          chunks.length > 0
            ? `Found ${chunks.length} knowledge result${chunks.length === 1 ? "" : "s"}`
            : "No knowledge found for this query",
        metadata: {
          usedRag: result.usedRag,
        },
      };
    } catch (error) {
      return {
        type: "error",
        error: "INTERNAL_ERROR",
        message: "Failed to search knowledge base",
        summary: "An error occurred while searching the knowledge base",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  },
});
