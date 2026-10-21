import { z } from "zod";

import {
  followUpCategories,
  followUpChannels,
  followUpDueFilterValues,
  followUpRecurrences,
  followUpSendModes,
  followUpSortValues,
  followUpStatusFilterValues,
  followUpTerminationConditions,
} from "@/features/follow-ups/types";
import {
  coercePositiveInteger,
  emptyToUndefined,
  firstString,
  isValidDateInput,
} from "@/lib/zod-helpers";

/**
 * Recurrence rules shared by the create and edit schemas.
 *
 * A repeating follow-up without a stop condition runs forever, so the server
 * refuses the ambiguous combinations instead of trusting the client form:
 * - `count` termination needs the limit that defines the count;
 * - a limit only makes sense when the follow-up actually repeats.
 */
function refineRecurrence(
  value: {
    recurrence: (typeof followUpRecurrences)[number];
    recurrenceLimit: number | null;
    terminationCondition: (typeof followUpTerminationConditions)[number] | null;
  },
  ctx: z.RefinementCtx,
) {
  if (
    value.terminationCondition === "count" &&
    value.recurrenceLimit === null
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recurrenceLimit"],
      message: "Set how many times this follow-up should repeat.",
    });
  }

  if (value.recurrenceLimit !== null && value.recurrence === "none") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recurrence"],
      message: "Choose how often this follow-up should repeat.",
    });
  }
}

export const followUpCreateSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Enter a follow-up title.")
      .max(160, "Follow-up titles must be 160 characters or fewer."),
    reason: z
      .string()
      .trim()
      .min(2, "Enter why this follow-up is needed.")
      .max(500, "Follow-up reasons must be 500 characters or fewer."),
    channel: z.enum(followUpChannels, {
      error: () => "Choose a follow-up channel.",
    }),
    category: z.enum(followUpCategories).default("sales"),
    sendMode: z.enum(followUpSendModes).default("manual"),
    dueDate: z
      .string()
      .trim()
      .refine(isValidDateInput, "Enter a valid due date."),
    recurrence: z.enum(followUpRecurrences).default("none"),
    recurrenceLimit: z.preprocess(
      (value) => {
        if (value == null || value === "") return null;
        const num = Number(value);
        return Number.isNaN(num) ? value : num;
      },
      z.number().int().min(1).max(100).nullable().default(null),
    ),
    terminationCondition: z.preprocess(
      (value) => {
        if (value == null || value === "" || value === "none") return null;
        return value;
      },
      z.enum(followUpTerminationConditions).nullable().default(null),
    ),
  })
  .strict()
  .superRefine(refineRecurrence);

export const followUpEditSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Enter a follow-up title.")
      .max(160, "Follow-up titles must be 160 characters or fewer."),
    reason: z
      .string()
      .trim()
      .min(2, "Enter why this follow-up is needed.")
      .max(500, "Follow-up reasons must be 500 characters or fewer."),
    channel: z.enum(followUpChannels, {
      error: () => "Choose a follow-up channel.",
    }),
    category: z.enum(followUpCategories).default("sales"),
    sendMode: z.enum(followUpSendModes).default("manual"),
    dueDate: z
      .string()
      .trim()
      .refine(isValidDateInput, "Enter a valid due date."),
    recurrence: z.enum(followUpRecurrences).default("none"),
    recurrenceLimit: z.preprocess(
      (value) => {
        if (value == null || value === "") return null;
        const num = Number(value);
        return Number.isNaN(num) ? value : num;
      },
      z.number().int().min(1).max(100).nullable().default(null),
    ),
    terminationCondition: z.preprocess(
      (value) => {
        if (value == null || value === "" || value === "none") return null;
        return value;
      },
      z.enum(followUpTerminationConditions).nullable().default(null),
    ),
  })
  .strict()
  .superRefine(refineRecurrence);

export const followUpReassignSchema = z
  .object({
    assignedToUserId: z
      .string()
      .trim()
      .min(1, "Choose a team member to assign.")
      .max(64, "Choose a team member to assign."),
  })
  .strict();

export const followUpRescheduleSchema = z
  .object({
    dueDate: z
      .string()
      .trim()
      .refine(isValidDateInput, "Enter a valid due date."),
  })
  .strict();

export const followUpListFiltersSchema = z.object({
  q: z
    .preprocess(
      (value) => emptyToUndefined(firstString(value)),
      z
        .string()
        .trim()
        .max(120, "Search must be 120 characters or fewer.")
        .optional(),
    )
    .catch(undefined),
  status: z
    .preprocess(
      (value) => firstString(value) ?? "all",
      z.enum(followUpStatusFilterValues),
    )
    .catch("all"),
  due: z
    .preprocess(
      (value) => firstString(value) ?? "all",
      z.enum(followUpDueFilterValues),
    )
    .catch("all"),
  sort: z
    .preprocess(
      (value) => firstString(value) ?? "due_asc",
      z.enum(followUpSortValues),
    )
    .catch("due_asc"),
  page: coercePositiveInteger("Page").catch(1),
});

export const followUpCompleteSchema = z.object({
  completionNote: z.preprocess(
    // `FormData.get` returns null for a missing key, and the board's quick
    // "Done" action submits no note at all.
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(500, "Completion notes must be 500 characters or fewer.")
      .optional()
      .transform((v) => v || null),
  ),
});

export const followUpSnoozeSchema = z.object({
  snoozedUntil: z
    .string()
    .trim()
    .refine(
      (value) => {
        // The client sends a business-local `YYYY-MM-DDTHH:mm` wall clock.
        // Accept a full ISO instant too, but reject anything ambiguous.
        if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/.test(value)) {
          return false;
        }

        return !Number.isNaN(new Date(value).getTime());
      },
      "Enter a valid snooze date/time.",
    ),
});

export const followUpBulkActionSchema = z.object({
  followUpIds: z.array(z.string().min(1)).min(1, "Select at least one follow-up.").max(50, "Cannot bulk-update more than 50 follow-ups at once."),
  completionNote: z
    .string()
    .trim()
    .max(500, "Completion notes must be 500 characters or fewer.")
    .optional()
    .transform((v) => v || null),
});

export type FollowUpCreateInput = z.infer<typeof followUpCreateSchema>;
export type FollowUpEditInput = z.infer<typeof followUpEditSchema>;
export type FollowUpRescheduleInput = z.infer<typeof followUpRescheduleSchema>;
export type FollowUpReassignInput = z.infer<typeof followUpReassignSchema>;
export type FollowUpCompleteInput = z.infer<typeof followUpCompleteSchema>;
export type FollowUpSnoozeInput = z.infer<typeof followUpSnoozeSchema>;
export type FollowUpBulkActionInput = z.infer<typeof followUpBulkActionSchema>;
