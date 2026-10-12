import { eq } from "drizzle-orm";

import { insertBusinessNotification } from "@/features/notifications/mutations";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema";
import { isLowEmailMode } from "@/lib/env";
import { sendChangeOrderEmail } from "@/lib/email/transactional";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * P2 notification rail: in-app (flag-gated) + customer email for submitted
 * decisions. Volume accrues to existing email quotas.
 */
export async function notifyChangeOrderEvent(input: {
  businessId: string;
  type: "change_order_created" | "change_order_decided";
  title: string;
  summary: string;
  quoteId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  displayNumber: string;
  changeOrderId: string;
  approvalUrl?: string | null;
  decision?: "submitted" | "approved" | "rejected" | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  await db.transaction(async (tx) => {
    const [business] = await tx
      .select({
        id: businesses.id,
        name: businesses.name,
        contactEmail: businesses.contactEmail,
        notifyInAppOnChangeOrder: businesses.notifyInAppOnChangeOrder,
      })
      .from(businesses)
      .where(eq(businesses.id, input.businessId))
      .limit(1);

    if (!business) return;

    if (business.notifyInAppOnChangeOrder) {
      await insertBusinessNotification(tx as DatabaseTransaction, {
        businessId: input.businessId,
        quoteId: input.quoteId ?? null,
        type: input.type,
        title: input.title,
        summary: input.summary,
        now,
      });
    }

    if (
      input.customerEmail &&
      !isLowEmailMode &&
      input.decision &&
      (input.decision === "submitted" ||
        input.decision === "approved" ||
        input.decision === "rejected")
    ) {
      await sendChangeOrderEmail({
        businessId: input.businessId,
        businessName: business.name,
        customerEmail: input.customerEmail,
        customerName: input.customerName ?? "there",
        displayNumber: input.displayNumber,
        decision: input.decision,
        approvalUrl: input.approvalUrl ?? null,
        changeOrderId: input.changeOrderId,
        replyToEmail: business.contactEmail ?? undefined,
      }).catch((error) => {
        console.warn("[change-orders] Change order email failed; in-app rail retained.", error);
      });
    }
  });
}
