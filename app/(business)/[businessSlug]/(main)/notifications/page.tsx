import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { DashboardPage } from "@/components/shared/dashboard-layout";
import { getBusinessNotificationBellView } from "@/features/notifications/queries";
import { NotificationsList } from "@/features/notifications/components/notifications-list";
import { DashboardListResultsSkeleton } from "@/components/shared/dashboard-list-results-skeleton";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getAppShellContext } from "@/lib/app-shell/context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Notifications",
  description: "View all notifications for this business.",
});

export const instant = true;

type NotificationsPageProps = {
  params: Promise<{ businessSlug: string }>;
};

/**
 * Notifications page — returns the page shell synchronously and streams
 * the notification list inside a Suspense boundary.
 */
export default function NotificationsPage({ params }: NotificationsPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        title="Notifications"
      />
      <Suspense fallback={<DashboardListResultsSkeleton />}>
        <NotificationsContent params={params} />
      </Suspense>
    </DashboardPage>
  );
}

async function NotificationsContent({ params }: NotificationsPageProps) {
  const { businessSlug } = await params;
  const { user, businessContext } = await getAppShellContext(businessSlug);

  const view = await getBusinessNotificationBellView({
    businessId: businessContext.business.id,
    businessSlug: businessContext.business.slug,
    userId: user.id,
    memberSince: businessContext.memberJoinedAt,
    limit: 50,
  });

  return (
    <NotificationsList
      businessSlug={businessContext.business.slug}
      initialView={view}
    />
  );
}
