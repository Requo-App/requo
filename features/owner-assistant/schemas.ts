/**
 * Owner Assistant Schemas
 *
 * Zod schemas for validating tool inputs and outputs.
 */

import { z } from "zod";

/**
 * Common schemas
 */
export const dateRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

/**
 * Read Tool Schemas
 */

export const searchInquiriesSchema = z.object({
  status: z
    .enum(["new", "quoted", "waiting", "won", "lost", "archived", "overdue"])
    .optional(),
  dateRange: dateRangeSchema.optional(),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
  aiAssisted: z.boolean().optional(),
  serviceSlug: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(["createdAt", "updatedAt", "customerName"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const getInquiryStatsSchema = z.object({
  dateRange: dateRangeSchema.optional(),
  groupBy: z
    .enum(["status", "source", "day", "week", "month"])
    .optional(),
});

export const searchQuotesSchema = z.object({
  status: z
    .enum(["draft", "sent", "accepted", "rejected", "expired", "voided", "revision_requested"])
    .optional(),
  dateRange: dateRangeSchema.optional(),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
  minValue: z.number().min(0).optional(),
  maxValue: z.number().min(0).optional(),
  inquiryId: z.string().min(1).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  sortBy: z
    .enum(["createdAt", "sentAt", "total", "customerName"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const getQuoteStatsSchema = z.object({
  dateRange: dateRangeSchema.optional(),
  groupBy: z.enum(["status", "day", "week", "month"]).optional(),
});

export const getConversionAnalyticsSchema = z.object({
  dateRange: dateRangeSchema.optional(),
  granularity: z.enum(["day", "week", "month"]).default("week"),
  includeCharts: z.boolean().default(true),
});

export const getWorkflowAnalyticsSchema = z.object({
  dateRange: dateRangeSchema.optional(),
  includeCharts: z.boolean().default(true),
});

export const searchCustomersSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
  hasInquiries: z.boolean().optional(),
  hasQuotes: z.boolean().optional(),
  hasAcceptedQuotes: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export const searchKnowledgeSchema = z.object({
  query: z.string().min(1),
  categories: z
    .array(
      z.enum([
        "business_rules",
        "customer_context",
        "workflow_preferences",
        "pricing_knowledge",
      ])
    )
    .optional(),
  limit: z.number().min(1).max(10).default(5),
});

export const getFollowUpStatsSchema = z.object({
  status: z.enum(["pending", "completed", "skipped", "overdue"]).optional(),
  dateRange: dateRangeSchema.optional(),
});

/**
 * Write Tool Schemas
 */

export const createInquirySchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerContactMethod: z.enum(["email", "phone", "other"]).optional(),
  customerContactHandle: z.string().optional(),
  serviceSlug: z.string().min(1),
  details: z.string().min(1),
  requestedDeadline: z.string().datetime().optional(),
  budgetText: z.string().optional(),
  tags: z.array(z.string()).optional(),
  internalNotes: z.string().optional(),
});

export const createQuoteSchema = z.object({
  inquiryId: z.string().min(1).optional(),
  customerName: z.string().min(1).optional(),
  customerEmail: z.string().email().optional(),
  /**
   * The model supplies scope only. It never supplies a price — quotes are
   * priced from the business's saved pricing library or by the owner.
   */
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().min(1).max(999_999),
      })
    )
    .min(1),
  notes: z.string().optional(),
  validUntil: z.string().datetime().optional(),
  terms: z.string().optional(),
});

export const updateInquiryStatusSchema = z.object({
  inquiryId: z.string().min(1),
  newStatus: z.enum(["quoted", "waiting", "won", "lost"]),
  notes: z.string().optional(),
  /**
   * The inquiry state the owner approved. A staged change is refused when the
   * inquiry moved on in between, so the owner never approves "new → won"
   * and the tool writes over a colleague's "lost".
   */
  expectedStatus: z.string().min(1).optional(),
});

export const sendQuoteSchema = z.object({
  quoteId: z.string().min(1),
  deliveryMethod: z.enum(["email", "link"]),
  /**
   * The quote state the owner approved. A staged send is refused when the
   * quote changed in between, so the owner never approves one price and
   * sends another.
   */
  expectedUpdatedAt: z.string().min(1).optional(),
  expectedTotalInCents: z.number().int().optional(),
});

export const scheduleFollowUpSchema = z.object({
  resourceType: z.enum(["inquiry", "quote"]),
  resourceId: z.string().min(1),
  scheduledFor: z.string().datetime(),
  message: z.string().optional(),
  autoSend: z.boolean().default(false),
  reminderDays: z.number().min(1).max(30).optional(),
});

/**
 * Type inference helpers
 */
export type SearchInquiriesInput = z.infer<typeof searchInquiriesSchema>;
export type GetInquiryStatsInput = z.infer<typeof getInquiryStatsSchema>;
export type SearchQuotesInput = z.infer<typeof searchQuotesSchema>;
export type GetQuoteStatsInput = z.infer<typeof getQuoteStatsSchema>;
export type GetConversionAnalyticsInput = z.infer<
  typeof getConversionAnalyticsSchema
>;
export type GetWorkflowAnalyticsInput = z.infer<
  typeof getWorkflowAnalyticsSchema
>;
export type SearchCustomersInput = z.infer<typeof searchCustomersSchema>;
export type SearchKnowledgeInput = z.infer<typeof searchKnowledgeSchema>;
export type GetFollowUpStatsInput = z.infer<typeof getFollowUpStatsSchema>;
export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateInquiryStatusInput = z.infer<typeof updateInquiryStatusSchema>;
export type SendQuoteInput = z.infer<typeof sendQuoteSchema>;
export type ScheduleFollowUpInput = z.infer<typeof scheduleFollowUpSchema>;
