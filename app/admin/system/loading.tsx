import Link from "next/link";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { AdminSectionsFallback } from "@/features/admin/components/admin-sections-fallback";
import { AdminHealthRefresh } from "@/features/admin/components/system/admin-health-refresh";
import { ADMIN_AUDIT_LOGS_PATH } from "@/features/admin/navigation";

export default function AdminSystemLoading() {
  return (
    <DashboardPage>
      <PageHeader
        description="System health, admin access, and configuration."
        title="System"
        actions={
          <>
            <AdminHealthRefresh />
            <Button asChild size="sm" variant="outline">
              <Link href={ADMIN_AUDIT_LOGS_PATH} prefetch={true}>
                View audit log
              </Link>
            </Button>
          </>
        }
      />
      <AdminSectionsFallback />
    </DashboardPage>
  );
}
