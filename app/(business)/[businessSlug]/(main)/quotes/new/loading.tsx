import { DashboardPage } from "@/components/shared/dashboard-layout";

import { NewQuoteEditorSkeleton } from "./page";

export default function BusinessDashboardNewQuoteLoading() {
  return (
    <DashboardPage>
      <NewQuoteEditorSkeleton />
    </DashboardPage>
  );
}
