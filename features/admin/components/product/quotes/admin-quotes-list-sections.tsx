import { DataListPagination } from "@/components/shared/data-list-pagination";
import { AdminQuotesFilters } from "@/features/admin/components/product/quotes/admin-quotes-filters";
import { AdminQuotesTable } from "@/features/admin/components/product/quotes/admin-quotes-table";
import { ADMIN_QUOTES_PATH } from "@/features/admin/navigation";
import { listAdminQuotes } from "@/features/admin/queries";
import { adminQuotesListFiltersSchema } from "@/features/admin/schemas";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminQuotesListSectionsProps = {
  rawParams: SearchParamsRecord;
};

export async function AdminQuotesListControlsSection({
  rawParams,
}: AdminQuotesListSectionsProps) {
  const filters = adminQuotesListFiltersSchema.safeParse(rawParams).data ?? {
    page: 1,
    pageSize: 25,
  };
  const { total } = await listAdminQuotes(filters);

  return <AdminQuotesFilters filters={filters} resultCount={total} />;
}

export async function AdminQuotesListContentSection({
  rawParams,
}: AdminQuotesListSectionsProps) {
  const filters =
    adminQuotesListFiltersSchema.safeParse(rawParams).data ?? {
      page: 1,
      pageSize: 25,
    };

  const { items, total } = await listAdminQuotes(filters);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const currentPage = Math.min(Math.max(1, filters.page), totalPages);
  const hasActiveFilters = Boolean(
    filters.search?.trim() || filters.status,
  );

  return (
    <AdminQuotesTable
      hasActiveFilters={hasActiveFilters}
      items={items}
      pagination={
        <DataListPagination
          currentPage={currentPage}
          pageSize={filters.pageSize}
          pathname={ADMIN_QUOTES_PATH}
          searchParams={rawParams}
          totalItems={total}
          totalPages={totalPages}
        />
      }
    />
  );
}
