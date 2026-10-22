/**
 * Get Follow-up Stats Tool
 *
 * Real counts from the business's follow-ups table (soft-deleted excluded).
 * Overdue is derived: pending with a due date in the past.
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { and, eq, lt, sql, type SQL } from "drizzle-orm";
import { followUps } from "@/lib/db/schema";
import { getFollowUpStatsSchema } from "../schemas";
import type { ErrorResult, ToolExecutionContext } from "../types";

type GetFollowUpStatsInput = z.infer<typeof getFollowUpStatsSchema>;

type StatEntry = {
  label: string;
  value: string | number;
  format?: "number" | "currency" | "percent";
};

type GetFollowUpStatsOutput =
  | {
      type: "stats_summary";
      data: { stats: StatEntry[] };
      summary: string;
      metadata?: Record<string, unknown>;
    }
  | ErrorResult;

export const getFollowUpStatsTool = tool<
  GetFollowUpStatsInput,
  GetFollowUpStatsOutput
>({
  description:
    "Get statistics about follow-ups including pending, overdue, completed, and skipped counts.",
  inputSchema: getFollowUpStatsSchema,
  execute: async (_params: GetFollowUpStatsInput, options: ToolExecutionOptions) => {
    const context = options.experimental_context as ToolExecutionContext;

    try {
      const base = [
        eq(followUps.businessId, context.businessId),
        sql`${followUps.deletedAt} is null`,
      ];

      const countWhere = async (...extra: SQL[]) => {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(followUps)
          .where(and(...base, ...extra));
        return Number(count);
      };

      const now = new Date();
      const [total, pending, completed, skipped] = await Promise.all([
        countWhere(),
        countWhere(eq(followUps.status, "pending")),
        countWhere(eq(followUps.status, "completed")),
        countWhere(eq(followUps.status, "skipped")),
      ]);
      const overdue = await countWhere(
        eq(followUps.status, "pending"),
        lt(followUps.dueAt, now),
      );

      const completionRate =
        total > 0 ? (completed / total) * 100 : 0;

      return {
        type: "stats_summary",
        data: {
          stats: [
            { label: "Total follow-ups", value: total },
            { label: "Pending", value: pending },
            { label: "Overdue", value: overdue },
            { label: "Completed", value: completed },
            { label: "Skipped", value: skipped },
            {
              label: "Completion rate",
              value: completionRate,
              format: "percent" as const,
            },
          ],
        },
        summary:
          total === 0
            ? "You have no follow-ups scheduled"
            : `You have ${pending} pending follow-up${pending === 1 ? "" : "s"}${overdue > 0 ? ` (${overdue} overdue)` : ""} out of ${total} total`,
        metadata: { total, pending, overdue, completed, skipped },
      };
    } catch (error) {
      return {
        type: "error",
        error: "INTERNAL_ERROR",
        message: "Failed to get follow-up statistics",
        summary: "An error occurred while calculating follow-up statistics",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  },
});
