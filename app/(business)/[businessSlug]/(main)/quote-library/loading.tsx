import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { QuoteLibraryPageSkeleton } from "@/components/shell/quote-library-page-skeleton";

export default function QuoteLibraryLoading() {
  return (
    <DashboardPage>
      <PageHeader title="Quote library" />
      <QuoteLibraryPageSkeleton />
    </DashboardPage>
  );
}
