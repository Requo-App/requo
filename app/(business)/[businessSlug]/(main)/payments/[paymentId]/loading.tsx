import { DashboardDetailPageSkeleton } from "@/components/shell/dashboard-detail-page-skeleton";

/**
 * Static shell for the payment detail route: mirrors the payment page
 * (detail header + payment details + invoice balance) so the shell and the
 * streamed page agree.
 */
export default function Loading() {
  return <DashboardDetailPageSkeleton variant="payment" />;
}
