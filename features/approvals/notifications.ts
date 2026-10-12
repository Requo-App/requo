import "server-only";

import { eq } from "drizzle-orm";

import { insertBusinessNotification } from "@/features/notifications/mutations";
import type { BusinessNotificationType } from "@/features/notifications/types";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema";
import { isLowEmailMode } from "@/lib/env";
import { sendApprovalEmail } from "@/lib/email/transactional";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ApprovalNotificationKind =
  | "approval_requested"
  | "approval_approved"
  | "approval_changes_requested"
  | "approval_expired";

/**
 * P1 notification rail: in-app (flag-gated) + customer email (LOW_EMAIL_MODE
 * aware, volume accrues to existing email quotas). Customer-triggered events
 * are attributed as customer actions with null business actor by callers
 * (quote-response precedent).
 */
export async function notifyApprovalEvent(
  tx: DatabaseTransaction,
  input: {
    businessId: string;
    type: ApprovalNotificationKind;
    title: string;
    summary: string;
    quoteId?: string | null;
    inquiryId?: string | null;
    /** Customer email for the email leg; omitted for internal transitions. */
    customerEmail?: string | null;
    customerName?: string | null;
    approvalUrl?: string | null;
    approvalId?: string | null;
    approvalVersion?: number | null;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  const [business] = await tx
    .select({
      id: businesses.id,
      name: businesses.name,
      contactEmail: businesses.contactEmail,
      notifyInAppOnApproval: businesses.notifyInAppOnApproval,
    })
    .from(businesses)
    .where(eq(businesses.id, input.businessId))
    .limit(1);

  if (!business) return;

  if (business.notifyInAppOnApproval) {
    await insertBusinessNotification(tx, {
      businessId: input.businessId,
      inquiryId: input.inquiryId ?? null,
      quoteId: input.quoteId ?? null,
      type: input.type as BusinessNotificationType,
      title: input.title,
      summary: input.summary,
      now,
    });
  }

  if (
    input.customerEmail &&
    input.approvalId &&
    !isLowEmailMode &&
    (input.type === "approval_requested" || input.type === "approval_expired")
  ) {
    await sendApprovalEmail({
      businessId: input.businessId,
      businessName: business.name,
      customerEmail: input.customerEmail,
      customerName: input.customerName ?? "there",
      title: input.title,
      decision: input.type === "approval_requested" ? "requested" : "expired",
      approvalUrl: input.approvalUrl ?? null,
      approvalId: input.approvalId,
      version: input.approvalVersion ?? 1,
      replyToEmail: business.contactEmail ?? undefined,
    }).catch((error) => {
      console.warn("[approvals] Approval email failed; in-app rail retained.", error);
    });
  }
}
