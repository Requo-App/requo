/**
 * Search Quotes Tool
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { searchQuotesSchema } from "../schemas";
import { searchQuotesQuery } from "../queries";
import { centsToDollars } from "../permissions";
import { formatQuoteMoney } from "@/features/quotes/utils";
import type { ErrorResult, ToolExecutionContext } from "../types";

type SearchQuotesInput = z.infer<typeof searchQuotesSchema>;

type SearchQuotesOutput =
  | {
      type: "quote_list";
      data: {
        results: Array<{
          id: string;
          quoteNumber: string | null;
          customerName: string;
          customerEmail: string;
          status: string;
          total: number | null;
          currency: string | null;
          sentAt: string | null;
          createdAt: string;
        }>;
        total: number;
        totalValue: number;
        /** The currency the totals are in. */
        currency: string;
        hasMore: boolean;
      };
      summary: string;
      metadata?: Record<string, unknown>;
    }
  | ErrorResult;

export const searchQuotesTool = tool<SearchQuotesInput, SearchQuotesOutput>({
  description:
    "Search and filter quotes by status, date range, customer, value range, or inquiry. Returns a list of matching quotes. Money values are in dollars. Archived and deleted quotes are excluded.",
  inputSchema: searchQuotesSchema,
  execute: async (params: SearchQuotesInput, options: ToolExecutionOptions) => {
    const context = options.experimental_context as ToolExecutionContext;

    try {
      const result = await searchQuotesQuery(context.businessId, params);
      const totalValueDollars = centsToDollars(result.totalValue);

      // The totals are reported in the currency the quotes are in, not in
      // dollars: a business quoting in EUR was shown a dollar figure.
      const currency =
        result.results.find((row) => row.currency)?.currency ?? "USD";

      const statusText = params.status ? ` with status "${params.status}"` : "";
      const dateText = params.dateRange
        ? ` from ${new Date(params.dateRange.start).toLocaleDateString()} to ${new Date(params.dateRange.end).toLocaleDateString()}`
        : "";
      const valueText =
        totalValueDollars > 0
          ? ` (total value: ${formatQuoteMoney(result.totalValue, currency)})`
          : "";

      return {
        type: "quote_list",
        data: {
          results: result.results.map((row) => ({
            id: row.id,
            quoteNumber: row.quoteNumber,
            customerName: row.customerName,
            customerEmail: row.customerEmail ?? "",
            status: row.status,
            total:
              row.totalInCents == null
                ? null
                : centsToDollars(row.totalInCents),
            currency: row.currency,
            sentAt:
              row.sentAt instanceof Date
                ? row.sentAt.toISOString()
                : (row.sentAt ?? null),
            createdAt:
              row.createdAt instanceof Date
                ? row.createdAt.toISOString()
                : String(row.createdAt),
          })),
          total: Number(result.total),
          totalValue: totalValueDollars,
          currency,
          hasMore: result.hasMore,
        },
        summary: `Found ${result.results.length} quotes${statusText}${dateText}${valueText}`,
        metadata: {
          total: Number(result.total),
          filtered: result.results.length,
          totalValue: totalValueDollars,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      return {
        type: "error",
        error: "INTERNAL_ERROR",
        message: "Failed to search quotes",
        summary: "An error occurred while searching quotes",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  },
});
