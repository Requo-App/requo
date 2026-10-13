import { DataListPagination } from "@/components/shared/data-list-pagination";
import { AdminInvoicesFilters } from "@/features/admin/components/product/invoices/admin-invoices-filters";
import { AdminInvoicesTable } from "@/features/admin/components/product/invoices/admin-invoices-table";
import { ADMIN_INVOICES_PATH } from "@/features/admin/navigation";
import { listAdminInvoices } from "@/features/admin/queries";
import { adminInvoicesListFiltersSchema } from "@/features/admin/schemas";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminInvoicesListSectionsProps = {
  rawParams: SearchParamsRecord;
};

export async function AdminInvoicesListControlsSection({
  rawParams,
}: AdminInvoicesListSectionsProps) {
  const filters = adminInvoicesListFiltersSchema.safeParse(rawParams).data ?? {
    page: 1,
    pageSize: 25,
  };
  const { total } = await listAdminInvoices(filters);

  return <AdminInvoicesFilters filters={filters} resultCount={total} />;
}

export async function AdminInvoicesListContentSection({
  rawParams,
}: AdminInvoicesListSectionsProps) {
  const filters =
    adminInvoicesListFiltersSchema.safeParse(rawParams).data ?? {
      page: 1,
      pageSize: 25,
    };

  const { items, total } = await listAdminInvoices(filters);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const currentPage = Math.min(Math.max(1, filters.page), totalPages);
  const hasActiveFilters = Boolean(
    filters.search?.trim() || filters.status,
  );

  return (
    <AdminInvoicesTable
      hasActiveFilters={hasActiveFilters}
      items={items}
      pagination={
        <DataListPagination
          currentPage={currentPage}
          pageSize={filters.pageSize}
          pathname={ADMIN_INVOICES_PATH}
          searchParams={rawParams}
          totalItems={total}
          totalPages={totalPages}
        />
      }
    />
  );
}
