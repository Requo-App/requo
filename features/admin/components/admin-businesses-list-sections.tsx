import { DataListPagination } from "@/components/shared/data-list-pagination";
import { AdminBusinessesFilters } from "@/features/admin/components/admin-businesses-filters";
import { AdminBusinessesTable } from "@/features/admin/components/admin-businesses-table";
import { ADMIN_BUSINESSES_PATH } from "@/features/admin/navigation";
import { listAdminBusinesses } from "@/features/admin/queries";
import { adminBusinessesListFiltersSchema } from "@/features/admin/schemas";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminBusinessesListSectionsProps = {
  rawParams: SearchParamsRecord;
};

export async function AdminBusinessesListControlsSection({
  rawParams,
}: AdminBusinessesListSectionsProps) {
  const filters = adminBusinessesListFiltersSchema.safeParse(rawParams).data ?? {
    page: 1,
    pageSize: 25,
  };
  const { total } = await listAdminBusinesses(filters);

  return <AdminBusinessesFilters filters={filters} resultCount={total} />;
}

export async function AdminBusinessesListContentSection({
  rawParams,
}: AdminBusinessesListSectionsProps) {
  const filters =
    adminBusinessesListFiltersSchema.safeParse(rawParams).data ?? {
      page: 1,
      pageSize: 25,
    };

  const { items, total } = await listAdminBusinesses(filters);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const currentPage = Math.min(Math.max(1, filters.page), totalPages);
  const hasActiveFilters = Boolean(filters.search?.trim() || filters.plan);

  return (
    <AdminBusinessesTable
      hasActiveFilters={hasActiveFilters}
      items={items}
      pagination={
        <DataListPagination
          currentPage={currentPage}
          pageSize={filters.pageSize}
          pathname={ADMIN_BUSINESSES_PATH}
          searchParams={rawParams}
          totalItems={total}
          totalPages={totalPages}
        />
      }
    />
  );
}
