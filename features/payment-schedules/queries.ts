import "server-only";

import { and, asc, desc, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  paymentScheduleItems,
  paymentSchedules,
  type PaymentSchedule,
  type PaymentScheduleItem,
} from "@/lib/db/schema";

export type PaymentScheduleWithItems = PaymentSchedule & {
  items: PaymentScheduleItem[];
};

type ScheduleReader = Pick<typeof db, "select">;

/**
 * Latest schedule for a quote. Superseded versions are history and are
 * excluded unless the caller explicitly asks for them.
 */
export async function getLatestScheduleForQuote(
  reader: ScheduleReader,
  input: {
    businessId: string;
    quoteId: string;
    includeSuperseded?: boolean;
  },
): Promise<PaymentScheduleWithItems | null> {
  const conditions = [
    eq(paymentSchedules.businessId, input.businessId),
    eq(paymentSchedules.quoteId, input.quoteId),
  ];

  if (!input.includeSuperseded) {
    conditions.push(ne(paymentSchedules.state, "superseded"));
  }

  const [schedule] = await reader
    .select()
    .from(paymentSchedules)
    .where(and(...conditions))
    .orderBy(desc(paymentSchedules.version))
    .limit(1);

  if (!schedule) {
    return null;
  }

  const items = await reader
    .select()
    .from(paymentScheduleItems)
    .where(eq(paymentScheduleItems.scheduleId, schedule.id))
    .orderBy(asc(paymentScheduleItems.position));

  return { ...schedule, items };
}

export async function getEditableScheduleForQuote(input: {
  businessId: string;
  quoteId: string;
}) {
  const schedule = await getLatestScheduleForQuote(db, input);

  if (!schedule || schedule.state === "accepted" || schedule.state === "superseded") {
    return null;
  }

  return schedule;
}

/**
 * Customer-facing schedule: the latest draft, scheduled, or accepted version.
 * Used by the public quote page, previews, print/PDF, and the send gate's
 * payment-schedule presence check.
 */
export async function getCustomerScheduleForQuote(input: {
  businessId: string;
  quoteId: string;
}) {
  return getLatestScheduleForQuote(db, input);
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
