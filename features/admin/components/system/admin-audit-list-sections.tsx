import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { DataListPagination } from "@/components/shared/data-list-pagination";
import {
  AdminListToolbar,
  type AdminToolbarField,
} from "@/features/admin/components/primitives/admin-list-toolbar";
import { getAdminToolbarParam } from "@/features/admin/components/primitives/admin-toolbar-params";
import { AdminAuditTable } from "@/features/admin/components/system/admin-audit-table";
import {
  ADMIN_ACTIONS,
  ADMIN_TARGET_TYPES,
} from "@/features/admin/constants";
import {
  getAdminActionLabel,
  getAdminTargetTypeLabel,
} from "@/features/admin/labels";
import { ADMIN_AUDIT_LOGS_PATH } from "@/features/admin/navigation";
import { listAdminAuditLogs } from "@/features/admin/queries";
import { adminAuditLogListFiltersSchema } from "@/features/admin/schemas";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function AdminAuditListPageShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardPage>
      <PageHeader
        description="Every admin view and action, newest first."
        title="Audit logs"
      />
      {children}
    </DashboardPage>
  );
}

const auditToolbarFields: AdminToolbarField[] = [
  {
    kind: "text",
    key: "adminUserId",
    label: "Admin user id",
    placeholder: "Filter by admin user id",
  },
  {
    kind: "select",
    key: "action",
    label: "Action",
    allLabel: "All actions",
    options: ADMIN_ACTIONS.map((action) => ({
      value: action,
      label: getAdminActionLabel(action),
    })),
  },
  {
    kind: "select",
    key: "targetType",
    label: "Target type",
    allLabel: "All targets",
    options: ADMIN_TARGET_TYPES.map((targetType) => ({
      value: targetType,
      label: getAdminTargetTypeLabel(targetType),
    })),
  },
  {
    kind: "text",
    key: "targetId",
    label: "Target id",
    placeholder: "Filter by target id",
  },
];

const auditToolbarKeys = auditToolbarFields.map((field) => field.key);

function toolbarValues(rawParams: SearchParamsRecord): Record<string, string> {
  return Object.fromEntries(
    auditToolbarKeys.map((key) => [key, getAdminToolbarParam(rawParams, key)]),
  );
}

export async function AdminAuditListControlsSection({
  rawParams,
}: {
  rawParams: SearchParamsRecord;
}) {
  const filters = adminAuditLogListFiltersSchema.safeParse(rawParams).data ?? {
    page: 1,
    pageSize: 50,
  };
  const { total } = await listAdminAuditLogs(filters);

  return (
    <div className="data-list-toolbar-strip">
      <AdminListToolbar
        description="Narrow the audit feed by admin, action, target type, or target id."
        fields={auditToolbarFields}
        resultLabel={`${total.toLocaleString("en-US")} ${total === 1 ? "entry" : "entries"}`}
        values={toolbarValues(rawParams)}
      />
    </div>
  );
}

export async function AdminAuditListContentSection({
  rawParams,
}: {
  rawParams: SearchParamsRecord;
}) {
  const filters = adminAuditLogListFiltersSchema.safeParse(rawParams).data ?? {
    page: 1,
    pageSize: 50,
  };

  const { items, total } = await listAdminAuditLogs(filters);
  const pageSize = filters.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, filters.page), totalPages);
  const hasActiveFilters = auditToolbarKeys.some(
    (key) => getAdminToolbarParam(rawParams, key).trim() !== "",
  );

  return (
    <AdminAuditTable
      hasActiveFilters={hasActiveFilters}
      items={items}
      pagination={
        <DataListPagination
          currentPage={currentPage}
          pageSize={pageSize}
          pathname={ADMIN_AUDIT_LOGS_PATH}
          searchParams={rawParams}
          totalItems={total}
          totalPages={totalPages}
        />
      }
    />
  );
}
