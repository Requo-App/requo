import { DashboardDetailPageSkeleton } from "@/components/shell/dashboard-detail-page-skeleton";

/**
 * Static shell for the payment detail route: mirrors the invoice detail
 * composition the page follows (detail header + stacked sections) so the
 * shell and the streamed page agree.
 */
export default function Loading() {
  return <DashboardDetailPageSkeleton variant="invoice" />;
}
