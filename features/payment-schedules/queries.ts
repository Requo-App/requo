import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  paymentScheduleItems,
  paymentSchedules,
} from "@/lib/db/schema";

export async function getEditableScheduleForQuote(input: {
  businessId: string;
  quoteId: string;
}) {
  const [schedule] = await db
    .select()
    .from(paymentSchedules)
    .where(
      and(
        eq(paymentSchedules.businessId, input.businessId),
        eq(paymentSchedules.quoteId, input.quoteId),
      ),
    )
    .orderBy(desc(paymentSchedules.version))
    .limit(1);

  if (!schedule || schedule.state === "accepted" || schedule.state === "superseded") {
    return null;
  }

  const items = await db
    .select()
    .from(paymentScheduleItems)
    .where(eq(paymentScheduleItems.scheduleId, schedule.id))
    .orderBy(asc(paymentScheduleItems.position));

  return { ...schedule, items };
}

/**
 * Prefill source: always the latest approved (accepted) schedule version.
 * v1-vs-v2 resolution is max(version) — never the editable draft.
 */
export async function getLatestApprovedScheduleForQuote(input: {
  businessId: string;
  quoteId: string;
}) {
  const schedules = await db
    .select()
    .from(paymentSchedules)
    .where(
      and(
        eq(paymentSchedules.businessId, input.businessId),
        eq(paymentSchedules.quoteId, input.quoteId),
        eq(paymentSchedules.state, "accepted"),
      ),
    )
    .orderBy(desc(paymentSchedules.version))
    .limit(1);

  const schedule = schedules[0];
  if (!schedule) return null;

  const items = await db
    .select()
    .from(paymentScheduleItems)
    .where(eq(paymentScheduleItems.scheduleId, schedule.id))
    .orderBy(asc(paymentScheduleItems.position));

  return { ...schedule, items };
}

export async function listSchedulesForQuote(input: {
  businessId: string;
  quoteId: string;
}) {
  return db
    .select()
    .from(paymentSchedules)
    .where(
      and(
        eq(paymentSchedules.businessId, input.businessId),
        eq(paymentSchedules.quoteId, input.quoteId),
      ),
    )
    .orderBy(asc(paymentSchedules.version));
}
