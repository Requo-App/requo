import { DataListPagination } from "@/components/shared/data-list-pagination";
import { AdminAiRequestsTable } from "@/features/admin/components/ai/admin-ai-requests-table";
import {
  AdminListToolbar,
  type AdminToolbarField,
} from "@/features/admin/components/primitives/admin-list-toolbar";
import { getAdminToolbarParam } from "@/features/admin/components/primitives/admin-toolbar-params";
import {
  ADMIN_AI_PROVIDERS,
  ADMIN_AI_PROVIDER_LABELS,
} from "@/features/admin/constants";
import { ADMIN_AI_REQUESTS_PATH } from "@/features/admin/navigation";
import { listAdminAiRequests } from "@/features/admin/queries";
import { adminAiRequestsFiltersSchema } from "@/features/admin/schemas";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminAiRequestsListSectionsProps = {
  rawParams: SearchParamsRecord;
};

const aiRequestToolbarFields: AdminToolbarField[] = [
  {
    kind: "select",
    key: "provider",
    label: "Provider",
    allLabel: "All providers",
    options: ADMIN_AI_PROVIDERS.map((provider) => ({
      value: provider,
      label: ADMIN_AI_PROVIDER_LABELS[provider],
    })),
  },
  {
    kind: "select",
    key: "status",
    label: "Status",
    allLabel: "All statuses",
    options: [
      { value: "success", label: "Success" },
      { value: "error", label: "Error" },
    ],
  },
  {
    kind: "text",
    key: "model",
    label: "Model",
    placeholder: "Filter by model name",
  },
  {
    kind: "text",
    key: "taskType",
    label: "Task type",
    placeholder: "e.g. quote_draft",
  },
  {
    kind: "text",
    key: "businessId",
    label: "Business id",
    placeholder: "Exact business id",
  },
  { kind: "date", key: "from", label: "From" },
  { kind: "date", key: "to", label: "To" },
];

const aiRequestToolbarKeys = [
  "q",
  ...aiRequestToolbarFields.map((field) => field.key),
];

function toolbarValues(rawParams: SearchParamsRecord): Record<string, string> {
  return Object.fromEntries(
    aiRequestToolbarKeys.map((key) => [key, getAdminToolbarParam(rawParams, key)]),
  );
}

export async function AdminAiRequestsListControlsSection({
  rawParams,
}: AdminAiRequestsListSectionsProps) {
  const filters = adminAiRequestsFiltersSchema.safeParse(rawParams).data ?? {
    page: 1,
    pageSize: 25,
  };
  const { total } = await listAdminAiRequests(filters);

  return (
    <div className="data-list-toolbar-strip">
      <AdminListToolbar
        description="Per-call records across every business. The log keeps the last 90 days — older calls are pruned nightly."
        fields={aiRequestToolbarFields}
        resultLabel={`${total.toLocaleString("en-US")} ${total === 1 ? "request" : "requests"}`}
        searchKey="q"
        searchLabel="Request id"
        searchPlaceholder="Exact request id"
        values={toolbarValues(rawParams)}
      />
    </div>
  );
}

export async function AdminAiRequestsListContentSection({
  rawParams,
}: AdminAiRequestsListSectionsProps) {
  const filters =
    adminAiRequestsFiltersSchema.safeParse(rawParams).data ?? {
      page: 1,
      pageSize: 25,
    };

  const { items, total } = await listAdminAiRequests(filters);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const currentPage = Math.min(Math.max(1, filters.page), totalPages);
  const hasActiveFilters = aiRequestToolbarKeys.some(
    (key) => getAdminToolbarParam(rawParams, key).trim() !== "",
  );

  return (
    <AdminAiRequestsTable
      hasActiveFilters={hasActiveFilters}
      items={items}
      pagination={
        <DataListPagination
          currentPage={currentPage}
          pageSize={filters.pageSize}
          pathname={ADMIN_AI_REQUESTS_PATH}
          searchParams={rawParams}
          totalItems={total}
          totalPages={totalPages}
        />
      }
    />
  );
}
