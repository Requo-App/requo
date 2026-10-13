import { DataListPagination } from "@/components/shared/data-list-pagination";
import { AdminUsersFilters } from "@/features/admin/components/admin-users-filters";
import { AdminUsersTable } from "@/features/admin/components/admin-users-table";
import { ADMIN_USERS_PATH } from "@/features/admin/navigation";
import { listAdminUsers } from "@/features/admin/queries";
import {
  adminUsersListFiltersSchema,
  type AdminUsersListFilters,
} from "@/features/admin/schemas";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminUsersListSectionsProps = {
  rawParams: SearchParamsRecord;
};

export async function AdminUsersListControlsSection({
  rawParams,
}: AdminUsersListSectionsProps) {
  const filters = adminUsersListFiltersSchema.safeParse(rawParams).data ?? {
    page: 1,
    pageSize: 25,
    status: "all" as const,
  };
  const { total } = await listAdminUsers(filters);

  return <AdminUsersFilters filters={filters} resultCount={total} />;
}

export async function AdminUsersListContentSection({
  rawParams,
}: AdminUsersListSectionsProps) {
  const filters =
    adminUsersListFiltersSchema.safeParse(rawParams).data ??
    ({
      page: 1,
      pageSize: 25,
      status: "all",
    } satisfies AdminUsersListFilters);

  const { items, total } = await listAdminUsers(filters);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const currentPage = Math.min(Math.max(1, filters.page), totalPages);
  const hasActiveFilters = Boolean(
    filters.search?.trim() || (filters.status && filters.status !== "all"),
  );

  return (
    <AdminUsersTable
      hasActiveFilters={hasActiveFilters}
      pagination={
        <DataListPagination
          currentPage={currentPage}
          pageSize={filters.pageSize}
          pathname={ADMIN_USERS_PATH}
          searchParams={rawParams}
          totalItems={total}
          totalPages={totalPages}
        />
      }
      users={items}
    />
  );
}
