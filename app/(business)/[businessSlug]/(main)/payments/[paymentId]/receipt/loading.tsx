import { DashboardPage } from "@/components/shared/dashboard-layout";

import { ReceiptPageSkeleton } from "./page";

/**
 * Static shell for the payment receipt route: the same header + section
 * fallbacks the page's Suspense boundaries use, so hard loads and
 * client navigations agree.
 */
export default function Loading() {
  return (
    <DashboardPage>
      <ReceiptPageSkeleton />
    </DashboardPage>
  );
}
