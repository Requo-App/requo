import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PublicApprovalView } from "@/features/approvals/components/public-approval-view";
import { getApprovalByCustomerToken } from "@/features/approvals/queries";
import { recordAnalyticsEvent } from "@/features/analytics/tracking";
import { getChangeOrderByApprovalChain } from "@/features/change-orders/queries";
import { hashOpaqueToken } from "@/lib/security/tokens";

const approvalRouteParamsSchema = z.object({
  token: z.string().min(1).max(128),
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Review request",
    description: "Review and respond to a business request.",
    robots: { index: false, follow: false },
  };
}

export default async function PublicApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const parsedParams = approvalRouteParamsSchema.safeParse(await params);

  if (!parsedParams.success) {
    notFound();
  }

  const token = parsedParams.data.token;
  const view = await getApprovalByCustomerToken(token);

  if (!view) {
    notFound();
  }

  const { approval, chain } = view;
  const snapshot = approval.snapshot as Record<string, unknown>;
  const title = String(snapshot["title"] ?? "Review request");
  const decided = approval.state !== "pending";

  await recordAnalyticsEvent({
    businessId: approval.businessId,
    quoteId: chain.quoteId,
    eventType: "approval_viewed",
    visitorHash: hashOpaqueToken(`${approval.businessId}:approval:${approval.id}`),
    metadata: { subjectKind: chain.subjectType, approvalChainId: chain.id, actor: "customer" },
  }).catch(() => undefined);

  const changeOrder =
    chain.subjectType === "final_count"
      ? await getChangeOrderByApprovalChain(chain.id)
      : null;

  return (
    <PublicApprovalView
      token={token}
      title={title}
      subjectKind={chain.subjectType}
      version={approval.version}
      expiresAt={approval.expiresAt}
      state={approval.state}
      approverName={approval.approverName}
      changeOrder={
        changeOrder
          ? {
              displayNumber: changeOrder.displayNumber,
              reason: changeOrder.reason,
              customerExplanation: changeOrder.customerExplanation,
              deltas: changeOrder.deltas.map((delta) => ({
                targetKind: delta.targetKind,
                change: delta.change,
                before: delta.beforeSnapshot,
                after: delta.afterSnapshot,
              })),
            }
          : null
      }
      decided={decided}
    />
  );
}
