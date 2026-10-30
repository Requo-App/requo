import { z } from "zod";

import {
  quoteDiscussionMessageMaxLength,
  quoteDiscussionSenderNameMaxLength,
  quoteDiscussionSenderNameMinLength,
} from "@/features/quote-discussions/utils";
import { quoteDiscussionViews } from "@/features/quote-discussions/types";
import { firstString } from "@/lib/zod-helpers";

export const quoteDiscussionIdSchema = z
  .string()
  .trim()
  .min(1, "Discussion id is required.")
  .max(128, "Discussion id is too long.");

export const quoteDiscussionReadAtSchema = z
  .string()
  .trim()
  .datetime();

export const quoteDiscussionMessageSchema = z.object({
  senderName: z
    .string()
    .trim()
    .min(
      quoteDiscussionSenderNameMinLength,
      "Enter the name you want the business to see.",
    )
    .max(
      quoteDiscussionSenderNameMaxLength,
      `Names must be ${quoteDiscussionSenderNameMaxLength} characters or fewer.`,
    ),
  body: z
    .string()
    .trim()
    .min(1, "Enter a message before sending.")
    .max(
      quoteDiscussionMessageMaxLength,
      `Messages must be ${quoteDiscussionMessageMaxLength.toLocaleString("en-US")} characters or fewer.`,
    ),
});

export const quoteDiscussionInboxFiltersSchema = z.object({
  view: z
    .preprocess(
      (value) => firstString(value) ?? "needs_reply",
      z.enum(quoteDiscussionViews),
    )
    .catch("needs_reply"),
  page: z.preprocess((value) => {
    const first = firstString(value);
    const parsed = first ? Number(first) : 1;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  }, z.number().int().min(1).max(10_000)).catch(1),
});

export type QuoteDiscussionMessageInput = z.infer<
  typeof quoteDiscussionMessageSchema
>;
