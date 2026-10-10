import { DashboardDetailPageSkeleton } from "@/components/shell/dashboard-detail-page-skeleton";

/**
 * Static shell for the payment receipt route: same payment-record
 * composition as the payment detail page (detail header + stacked
 * sections) so the shell and the streamed page agree.
 */
export default function Loading() {
  return <DashboardDetailPageSkeleton variant="invoice" />;
}
