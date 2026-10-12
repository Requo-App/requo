import { DataListPagination } from "@/components/shared/data-list-pagination";
import { AdminInquiriesFilters } from "@/features/admin/components/product/inquiries/admin-inquiries-filters";
import { AdminInquiriesTable } from "@/features/admin/components/product/inquiries/admin-inquiries-table";
import { ADMIN_INQUIRIES_PATH } from "@/features/admin/navigation";
import { listAdminInquiries } from "@/features/admin/queries";
import { adminInquiriesListFiltersSchema } from "@/features/admin/schemas";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminInquiriesListSectionsProps = {
  rawParams: SearchParamsRecord;
};

export async function AdminInquiriesListControlsSection({
  rawParams,
}: AdminInquiriesListSectionsProps) {
  const filters = adminInquiriesListFiltersSchema.safeParse(rawParams).data ?? {
    page: 1,
    pageSize: 25,
  };
  const { total } = await listAdminInquiries(filters);

  return <AdminInquiriesFilters filters={filters} resultCount={total} />;
}

export async function AdminInquiriesListContentSection({
  rawParams,
}: AdminInquiriesListSectionsProps) {
  const filters =
    adminInquiriesListFiltersSchema.safeParse(rawParams).data ?? {
      page: 1,
      pageSize: 25,
    };

  const { items, total } = await listAdminInquiries(filters);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const currentPage = Math.min(Math.max(1, filters.page), totalPages);
  const hasActiveFilters = Boolean(
    filters.search?.trim() || filters.status,
  );

  return (
    <AdminInquiriesTable
      hasActiveFilters={hasActiveFilters}
      items={items}
      pagination={
        <DataListPagination
          currentPage={currentPage}
          pageSize={filters.pageSize}
          pathname={ADMIN_INQUIRIES_PATH}
          searchParams={rawParams}
          totalItems={total}
          totalPages={totalPages}
        />
      }
    />
  );
}
