import { DashboardPage } from "@/components/shared/dashboard-layout";

import { NewInvoiceSkeleton } from "./page";

export default function Loading() {
  return (
    <DashboardPage>
      <NewInvoiceSkeleton />
    </DashboardPage>
  );
}
