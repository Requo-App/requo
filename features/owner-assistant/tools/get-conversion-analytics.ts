/**
 * Get Conversion Analytics Tool
 * Requires Pro+ plan (analyticsPerformance feature)
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { inquiries, quotes } from "@/lib/db/schema";
import { getConversionAnalyticsSchema } from "../schemas";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import type { BusinessPlan } from "@/lib/plans/plans";
import type { ErrorResult, ToolExecutionContext } from "../types";

type GetConversionAnalyticsInput = z.infer<typeof getConversionAnalyticsSchema>;

type GetConversionAnalyticsOutput =
  | {
      type: "chart_data";
      data: {
        chartType: "bar";
        series: Array<{ name: string; data: Array<{ label: string; value: number }> }>;
        yAxisLabel?: string;
      };
      summary: string;
    }
  | ErrorResult;

export const getConversionAnalyticsTool = tool<
  GetConversionAnalyticsInput,
  GetConversionAnalyticsOutput
>({
  description:
    "Get detailed conversion funnel and metrics over time. Requires Pro or Business plan. Archived and deleted records are excluded.",
  inputSchema: getConversionAnalyticsSchema,
  execute: async (params: GetConversionAnalyticsInput, options: ToolExecutionOptions) => {
    const context = options.experimental_context as ToolExecutionContext;

    // Check plan access
    if (!hasFeatureAccess(context.plan as BusinessPlan, "analyticsPerformance")) {
      return {
        type: "error",
        error: "PLAN_LIMIT",
        message: "Conversion analytics require Pro or Business plan",
        summary: "Conversion analytics are available on the Pro plan and above.",
        upgradeUrl: `/checkout?plan=pro&businessId=${context.businessId}`,
      };
    }

    try {
      const conditions = [
        eq(inquiries.businessId, context.businessId),
        sql`${inquiries.deletedAt} is null`,
        sql`${inquiries.archivedAt} is null`,
        sql`${inquiries.status} != 'archived'`,
      ];
      const quoteConditions = [
        eq(quotes.businessId, context.businessId),
        sql`${quotes.deletedAt} is null`,
        sql`${quotes.archivedAt} is null`,
      ];

      if (params.dateRange) {
        conditions.push(gte(inquiries.createdAt, new Date(params.dateRange.start)));
        conditions.push(lte(inquiries.createdAt, new Date(params.dateRange.end)));
        quoteConditions.push(gte(quotes.createdAt, new Date(params.dateRange.start)));
        quoteConditions.push(lte(quotes.createdAt, new Date(params.dateRange.end)));
      }

      // Get funnel counts
      const [{ totalInquiries }] = await db
        .select({ totalInquiries: sql<number>`count(*)` })
        .from(inquiries)
        .where(and(...conditions));

      const [{ quotedCount }] = await db
        .select({ quotedCount: sql<number>`count(DISTINCT ${inquiries.id})` })
        .from(inquiries)
        .where(and(...conditions, sql`${inquiries.status} IN ('quoted', 'waiting', 'won')`));

      const [{ sentQuotes }] = await db
        .select({ sentQuotes: sql<number>`count(*)` })
        .from(quotes)
        .where(and(...quoteConditions, sql`${quotes.sentAt} IS NOT NULL`));

      const [{ viewedQuotes }] = await db
        .select({ viewedQuotes: sql<number>`count(*)` })
        .from(quotes)
        .where(and(...quoteConditions, sql`${quotes.publicViewedAt} IS NOT NULL`));

      const [{ acceptedQuotes }] = await db
        .select({ acceptedQuotes: sql<number>`count(*)` })
        .from(quotes)
        .where(and(...quoteConditions, eq(quotes.status, "accepted")));

      // Calculate conversion rates
      const inquiryToQuote = totalInquiries > 0 ? (quotedCount / totalInquiries) * 100 : 0;
      const quoteToView = sentQuotes > 0 ? (viewedQuotes / sentQuotes) * 100 : 0;
      const viewToAccept = viewedQuotes > 0 ? (acceptedQuotes / viewedQuotes) * 100 : 0;
      const inquiryToAccept = totalInquiries > 0 ? (acceptedQuotes / totalInquiries) * 100 : 0;

      return {
        type: "chart_data",
        data: {
          chartType: "bar",
          series: [
            {
              name: "Conversion funnel",
              data: [
                { label: "Inquiries", value: Number(totalInquiries) },
                { label: "Quoted", value: Number(quotedCount) },
                { label: "Viewed", value: Number(viewedQuotes) },
                { label: "Accepted", value: Number(acceptedQuotes) },
              ],
            },
          ],
          yAxisLabel: "Count",
        },
        summary: `Your overall conversion rate is ${inquiryToAccept.toFixed(1)}% (${acceptedQuotes} accepted from ${totalInquiries} inquiries; ${inquiryToQuote.toFixed(1)}% quoted, ${quoteToView.toFixed(1)}% viewed, ${viewToAccept.toFixed(1)}% view-to-accept)`,
      };
    } catch (error) {
      return {
        type: "error",
        error: "INTERNAL_ERROR",
        message: "Failed to get conversion analytics",
        summary: "An error occurred while calculating conversion analytics",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  },
});
