import { DataListPagination } from "@/components/shared/data-list-pagination";
import { AdminEmailsFilters } from "@/features/admin/components/operations/emails/admin-emails-filters";
import { AdminEmailsTable } from "@/features/admin/components/operations/emails/admin-emails-table";
import { ADMIN_EMAILS_PATH } from "@/features/admin/navigation";
import { listAdminEmails } from "@/features/admin/queries";
import { adminEmailsListFiltersSchema } from "@/features/admin/schemas";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminEmailsListSectionsProps = {
  rawParams: SearchParamsRecord;
};

export async function AdminEmailsListControlsSection({
  rawParams,
}: AdminEmailsListSectionsProps) {
  const filters = adminEmailsListFiltersSchema.safeParse(rawParams).data ?? {
    page: 1,
    pageSize: 25,
  };
  const { total } = await listAdminEmails(filters);

  return <AdminEmailsFilters filters={filters} resultCount={total} />;
}

export async function AdminEmailsListContentSection({
  rawParams,
}: AdminEmailsListSectionsProps) {
  const filters =
    adminEmailsListFiltersSchema.safeParse(rawParams).data ?? {
      page: 1,
      pageSize: 25,
    };

  const { items, total } = await listAdminEmails(filters);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const currentPage = Math.min(Math.max(1, filters.page), totalPages);
  const hasActiveFilters = Boolean(
    filters.search?.trim() ||
      filters.status ||
      filters.emailType ||
      filters.provider,
  );

  return (
    <AdminEmailsTable
      hasActiveFilters={hasActiveFilters}
      items={items}
      pagination={
        <DataListPagination
          currentPage={currentPage}
          pageSize={filters.pageSize}
          pathname={ADMIN_EMAILS_PATH}
          searchParams={rawParams}
          totalItems={total}
          totalPages={totalPages}
        />
      }
    />
  );
}
