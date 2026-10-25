import { DashboardPage } from "@/components/shared/dashboard-layout";
import {
  DetailPageHeaderFallback,
  DetailSectionFallback,
} from "@/components/shared/detail-section-fallback";

/**
 * Static shell for the payment detail route: mirrors the payment page
 * (detail header + payment details + invoice balance) so the shell and the
 * streamed page agree.
 */
export default function Loading() {
  return (
    <DashboardPage className="pb-24">
      <DetailPageHeaderFallback />
      <div className="flex flex-col gap-6">
        <DetailSectionFallback rows={4} />
        <DetailSectionFallback rows={2} />
      </div>
    </DashboardPage>
  );
}
