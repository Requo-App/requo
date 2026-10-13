import { DashboardPage } from "@/components/shared/dashboard-layout";

import { AssistantSkeleton } from "./page";

/** Loading skeleton for the Assistant section — same shape as the loaded surface. */
export default function AssistantLoading() {
  return (
    <DashboardPage className="min-h-0 flex-1">
      <AssistantSkeleton />
    </DashboardPage>
  );
}
