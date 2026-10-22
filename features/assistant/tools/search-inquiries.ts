import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { searchInquiriesSchema } from "../schemas";
import { searchInquiriesQuery } from "../queries";
import type { ErrorResult, ToolExecutionContext } from "../types";

type SearchInquiriesInput = z.infer<typeof searchInquiriesSchema>;

type SearchInquiriesOutput =
  | {
      type: "inquiry_list";
      data: {
        results: Array<{
          id: string;
          customerName: string;
          customerEmail: string;
          status: string;
          serviceName: string | null;
          serviceSlug: string | null;
          source: string | null;
          aiAssisted: boolean | null;
          createdAt: string;
        }>;
        total: number;
        hasMore: boolean;
      };
      summary: string;
      metadata?: Record<string, unknown>;
    }
  | ErrorResult;

export const searchInquiriesTool = tool<
  SearchInquiriesInput,
  SearchInquiriesOutput
>({
  description:
    "Search and filter inquiries by status, date range, customer, or other criteria. Returns a list of matching inquiries with details. Archived and deleted inquiries are excluded.",
  inputSchema: searchInquiriesSchema,
  execute: async (
    params: SearchInquiriesInput,
    options: ToolExecutionOptions
  ) => {
    const context = options.experimental_context as ToolExecutionContext;

    try {
      const result = await searchInquiriesQuery(context.businessId, params);

      const statusText = params.status ? ` with status "${params.status}"` : "";
      const serviceText = params.serviceSlug ? ` for service "${params.serviceSlug}"` : "";
      const dateText = params.dateRange
        ? ` from ${new Date(params.dateRange.start).toLocaleDateString()} to ${new Date(params.dateRange.end).toLocaleDateString()}`
        : "";

      return {
        type: "inquiry_list",
        data: {
          results: result.results.map((row) => ({
            id: row.id,
            customerName: row.customerName,
            customerEmail: row.customerEmail ?? "",
            status: row.status,
            serviceName: row.serviceName,
            serviceSlug: row.serviceSlug,
            source: row.source,
            aiAssisted: row.aiAssisted,
            createdAt:
              row.createdAt instanceof Date
                ? row.createdAt.toISOString()
                : String(row.createdAt),
          })),
          total: Number(result.total),
          hasMore: result.hasMore,
        },
        summary: `Found ${result.results.length} inquiries${statusText}${serviceText}${dateText}`,
        metadata: {
          total: Number(result.total),
          filtered: result.results.length,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      // A Tool failure is surfaced as a failure — never a plausible empty result.
      return {
        type: "error",
        error: "INTERNAL_ERROR",
        message: "Failed to search inquiries",
        summary: "An error occurred while searching inquiries",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  },
});
