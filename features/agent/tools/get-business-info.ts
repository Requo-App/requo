/**
 * Get Business Info Tool
 *
 * Returns public business information.
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { getBusinessInfoParamsSchema } from "@/features/agent/schemas";
import type { AgentToolContext } from "@/features/agent/tools/types";

export const getBusinessInfoTool = tool<Record<string, never>, { name: string; description: string | null; contact: string | null }>({
  description:
    "Get basic information about the business (name, description, contact details). Use this when you need to share business contact information or general details.",
  inputSchema: getBusinessInfoParamsSchema,
  execute: async (_params, options: ToolExecutionOptions) => {
    const context = options.experimental_context as AgentToolContext;
    const { business } = context;

    return {
      name: business.name,
      description: business.shortDescription ?? null,
      contact: business.contactEmail ?? null,
    };
  },
});
