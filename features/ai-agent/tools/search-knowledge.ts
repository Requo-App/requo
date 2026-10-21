/**
 * Search Knowledge Tool
 *
 * Retrieves relevant business memories via RAG.
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { retrieveBusinessKnowledge } from "@/features/memory/retrieval";
import {
  UNTRUSTED_KNOWLEDGE_CLOSE,
  UNTRUSTED_KNOWLEDGE_OPEN,
} from "@/features/memory/retrieval";
import { searchKnowledgeParamsSchema } from "@/features/ai-agent/schemas";
import type { AgentToolContext } from "@/features/ai-agent/tools/types";

type SearchKnowledgeInput = z.infer<typeof searchKnowledgeParamsSchema>;

type SearchKnowledgeOutput =
  | { found: false; message: string; results?: undefined }
  | { found: true; message?: undefined; results: Array<{ content: string; relevance: number; source: string }> };

export const searchKnowledgeTool = tool<SearchKnowledgeInput, SearchKnowledgeOutput>({
  description:
    "Search the business's knowledge base for information about services, pricing, capabilities, policies, or any other business-specific details. Use this when you need accurate information to answer customer questions.",
  inputSchema: searchKnowledgeParamsSchema,
  execute: async ({ query }, options: ToolExecutionOptions) => {
    const context = options.experimental_context as AgentToolContext;

    try {
      const result = await retrieveBusinessKnowledge({
        businessId: context.businessId,
        queryText: query,
        topK: 5,
        tokenBudget: 1500,
      });

      if (result.evidence.length === 0) {
        return {
          found: false,
          message: "No relevant information found in the business knowledge base.",
        };
      }

      return {
        found: true,
        results: result.evidence.map((e) => ({
          // The knowledge content is returned as data, fenced so it cannot
          // act as an instruction for the tool-calling model.
          content: [
            UNTRUSTED_KNOWLEDGE_OPEN,
            e.content,
            UNTRUSTED_KNOWLEDGE_CLOSE,
          ].join("\n"),
          relevance: e.score,
          source: e.title,
        })),
      };
    } catch (error) {
      console.error("Search knowledge tool error:", error);
      return {
        found: false,
        message: "Failed to search knowledge base. Please try asking in a different way.",
      };
    }
  },
});
