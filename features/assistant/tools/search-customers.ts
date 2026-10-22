/**
 * Search Customers Tool
 *
 * Customers are not a first-class entity: this aggregates from inquiries and
 * quotes through the single shared `searchCustomersQuery` implementation.
 * Archived and deleted records are excluded; matching is case-insensitive.
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { searchCustomersSchema } from "../schemas";
import { searchCustomersQuery } from "../queries";
import type { ErrorResult, ToolExecutionContext } from "../types";

type SearchCustomersInput = z.infer<typeof searchCustomersSchema>;

type SearchCustomersOutput =
  | {
      type: "customer_list";
      data: {
        results: Array<{
          email: string;
          name: string | null;
          inquiryCount: number;
          quoteCount: number;
          acceptedQuoteCount: number;
        }>;
        total: number;
        hasMore: boolean;
      };
      summary: string;
      metadata?: Record<string, unknown>;
    }
  | ErrorResult;

export const searchCustomersTool = tool<
  SearchCustomersInput,
  SearchCustomersOutput
>({
  description:
    "Find customers by email or name across inquiries and quotes. Returns aggregated customer information.",
  inputSchema: searchCustomersSchema,
  execute: async (params: SearchCustomersInput, options: ToolExecutionOptions) => {
    const context = options.experimental_context as ToolExecutionContext;

    try {
      const result = await searchCustomersQuery(context.businessId, params);

      let results = result.results.map((row) => ({
        email: row.email,
        name: row.name,
        inquiryCount: row.inquiryCount,
        quoteCount: row.quoteCount,
        acceptedQuoteCount: row.acceptedQuoteCount,
      }));

      if (params.hasInquiries === false) {
        results = results.filter((c) => c.inquiryCount === 0);
      }
      if (params.hasQuotes === false) {
        results = results.filter((c) => c.quoteCount === 0);
      }
      if (params.hasAcceptedQuotes === false) {
        results = results.filter((c) => c.acceptedQuoteCount === 0);
      }

      return {
        type: "customer_list",
        data: {
          results,
          total: result.total,
          hasMore: result.hasMore,
        },
        summary: `Found ${results.length} customers`,
        metadata: {
          total: result.total,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      return {
        type: "error",
        error: "INTERNAL_ERROR",
        message: "Failed to search customers",
        summary: "An error occurred while searching customers",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  },
});
