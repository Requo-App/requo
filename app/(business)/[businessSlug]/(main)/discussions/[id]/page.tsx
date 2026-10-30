import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { getAppShellContext } from "@/lib/app-shell/context";
import { sendQuoteDiscussionReplyAction } from "@/features/quote-discussions/actions";
import { BusinessDiscussionDetail } from "@/features/quote-discussions/components/business-discussion-detail";
import { getQuoteDiscussionDetailForBusiness } from "@/features/quote-discussions/queries";
import { quoteDiscussionIdSchema } from "@/features/quote-discussions/schemas";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Quote discussion",
  description: "Read and reply to a customer conversation about a quote.",
});

export const instant = true;

type DiscussionDetailPageProps = {
  params: Promise<{ businessSlug: string; id: string }>;
};

export default function DiscussionDetailPage({
  params,
}: DiscussionDetailPageProps) {
  return (
    <Suspense fallback={<DiscussionDetailSkeleton />}>
      <DiscussionDetailRegion params={params} />
    </Suspense>
  );
}

async function DiscussionDetailRegion({ params }: DiscussionDetailPageProps) {
  const resolvedParams = await params;
  const parsedId = quoteDiscussionIdSchema.safeParse(resolvedParams.id);

  if (!parsedId.success) {
    notFound();
  }

  const [{ businessContext }, user] = await Promise.all([
    getAppShellContext(resolvedParams.businessSlug),
    requireUser(),
  ]);
  const discussion = await getQuoteDiscussionDetailForBusiness({
    businessId: businessContext.business.id,
    discussionId: parsedId.data,
    userId: user.id,
  });

  if (!discussion) {
    notFound();
  }

  const replyAction = sendQuoteDiscussionReplyAction.bind(
    null,
    businessContext.business.slug,
    discussion.id,
  );

  return (
    <BusinessDiscussionDetail
      discussion={discussion}
      replyAction={replyAction}
      senderName={user.name?.trim() || businessContext.business.name}
    />
  );
}

export function DiscussionDetailSkeleton() {
  return (
    <DashboardPage>
      <PageHeader title="Quote discussion" />
      <div className="dashboard-detail-layout">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      </div>
    </DashboardPage>
  );
}
