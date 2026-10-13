import { DashboardPage } from "@/components/shared/dashboard-layout";

import { ServiceEditorShellFallback } from "./page";

export default function BusinessServiceLoading() {
  return (
    <DashboardPage>
      <ServiceEditorShellFallback />
    </DashboardPage>
  );
}
