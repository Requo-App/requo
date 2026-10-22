/**
 * Get Inquiry Stats Tool
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { getInquiryStatsSchema } from "../schemas";
import { getInquiryStatsQuery } from "../queries";
import type { ErrorResult, ToolExecutionContext } from "../types";

type GetInquiryStatsInput = z.infer<typeof getInquiryStatsSchema>;

type StatEntry = {
  label: string;
  value: string | number;
  format?: "number" | "currency" | "percent";
};

type GetInquiryStatsOutput =
  | {
      type: "stats_summary";
      data: { stats: StatEntry[] };
      summary: string;
    }
  | ErrorResult;

export const getInquiryStatsTool = tool<
  GetInquiryStatsInput,
  GetInquiryStatsOutput
>({
  description:
    "Get aggregate statistics about inquiries including counts by status, source, and AI-assisted percentage. Archived and deleted inquiries are excluded.",
  inputSchema: getInquiryStatsSchema,
  execute: async (params: GetInquiryStatsInput, options: ToolExecutionOptions) => {
    const context = options.experimental_context as ToolExecutionContext;

    try {
      const stats = await getInquiryStatsQuery(context.businessId, params);

      const statusBreakdown = Object.entries(stats.byStatus)
        .map(([status, count]) => `${count} ${status}`)
        .join(", ");

      const aiText =
        Number(stats.aiAssistedCount) > 0
          ? ` ${stats.aiAssistedCount} (${Number(stats.aiAssistedPercentage).toFixed(1)}%) were AI-assisted.`
          : "";

      const statEntries: StatEntry[] = [
        { label: "Total inquiries", value: Number(stats.total) },
        ...Object.entries(stats.byStatus).map(([status, count]) => ({
          label: status,
          value: Number(count),
        })),
        {
          label: "AI-assisted",
          value: Number(stats.aiAssistedPercentage),
          format: "percent" as const,
        },
      ];

      return {
        type: "stats_summary",
        data: { stats: statEntries },
        summary: `You have ${stats.total} inquiries: ${statusBreakdown}.${aiText}`,
      };
    } catch (error) {
      return {
        type: "error",
        error: "INTERNAL_ERROR",
        message: "Failed to get inquiry statistics",
        summary: "An error occurred while calculating inquiry statistics",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  },
});
