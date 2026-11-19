import {
  DashboardDetailFeed,
  DashboardDetailFeedItem,
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import { DataListPagination } from "@/components/shared/data-list-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminAiErrorsTable } from "@/features/admin/components/ai/admin-ai-errors-table";
import {
  AdminListToolbar,
  type AdminToolbarField,
} from "@/features/admin/components/primitives/admin-list-toolbar";
import { getAdminToolbarParam } from "@/features/admin/components/primitives/admin-toolbar-params";
import {
  ADMIN_AI_PROVIDERS,
  ADMIN_AI_PROVIDER_LABELS,
} from "@/features/admin/constants";
import { ADMIN_AI_ERRORS_PATH } from "@/features/admin/navigation";
import {
  countAdminAiErrors,
  listAdminAiErrors,
  listAdminAiRoutingEvents,
  listAdminAiSecurityEvents,
} from "@/features/admin/queries";
import { adminAiErrorsFiltersSchema } from "@/features/admin/schemas";
import type {
  AdminAiRoutingEvent,
  AdminAiSecurityEvent,
} from "@/features/admin/types";
import { formatAiDateTime } from "@/features/admin/components/ai/admin-ai-format";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminAiErrorsSectionsProps = {
  rawParams: SearchParamsRecord;
};

const aiErrorToolbarFields: AdminToolbarField[] = [
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
];

const aiErrorToolbarKeys = aiErrorToolbarFields.map((field) => field.key);

function toolbarValues(rawParams: SearchParamsRecord): Record<string, string> {
  return Object.fromEntries(
    aiErrorToolbarKeys.map((key) => [key, getAdminToolbarParam(rawParams, key)]),
  );
}

export async function AdminAiErrorsControlsSection({
  rawParams,
}: AdminAiErrorsSectionsProps) {
  const filters = adminAiErrorsFiltersSchema.safeParse(rawParams).data ?? {
    page: 1,
    pageSize: 25,
  };
  const total = await countAdminAiErrors(filters);

  return (
    <div className="data-list-toolbar-strip">
      <AdminListToolbar
        description="Only persisted failures are listed: failed calls, fallback routing attempts, and security events. Prompts and responses are never stored."
        fields={aiErrorToolbarFields}
        resultLabel={`${total.toLocaleString("en-US")} ${total === 1 ? "error" : "errors"}`}
        values={toolbarValues(rawParams)}
      />
    </div>
  );
}

export async function AdminAiErrorsTableSection({
  rawParams,
}: AdminAiErrorsSectionsProps) {
  const filters =
    adminAiErrorsFiltersSchema.safeParse(rawParams).data ?? {
      page: 1,
      pageSize: 25,
    };

  const { items, total } = await listAdminAiErrors(filters);
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const currentPage = Math.min(Math.max(1, filters.page), totalPages);
  const hasActiveFilters = aiErrorToolbarKeys.some(
    (key) => getAdminToolbarParam(rawParams, key).trim() !== "",
  );

  return (
    <AdminAiErrorsTable
      hasActiveFilters={hasActiveFilters}
      items={items}
      pagination={
        <DataListPagination
          currentPage={currentPage}
          pageSize={filters.pageSize}
          pathname={ADMIN_AI_ERRORS_PATH}
          searchParams={rawParams}
          totalItems={total}
          totalPages={totalPages}
        />
      }
    />
  );
}

export async function AdminAiSecurityEventsSection() {
  const events: AdminAiSecurityEvent[] = await listAdminAiSecurityEvents();
  return (
    <DashboardSection
      description="Newest input-safety and output-filtering events. No prompts or responses are stored — only the event type and matched pattern."
      title={`Security events (${events.length})`}
    >
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No security events on record.
        </p>
      ) : (
        <DashboardDetailFeed>
          {events.map((event) => (
            <DashboardDetailFeedItem
              key={event.id}
              meta={
                <>
                  {event.patternMatched ? (
                    <>
                      <span className="font-mono text-xs">
                        {event.patternMatched}
                      </span>
                      <span aria-hidden="true">·</span>
                    </>
                  ) : null}
                  <span>{formatAiDateTime(event.createdAt)}</span>
                </>
              }
              title={event.eventType.replaceAll("_", " ")}
            />
          ))}
        </DashboardDetailFeed>
      )}
    </DashboardSection>
  );
}

export async function AdminAiRoutingEventsSection() {
  const events: AdminAiRoutingEvent[] = await listAdminAiRoutingEvents();

  return (
    <DashboardSection
      description="Newest fallback attempts and post-fallback serving models. Each row carries a request correlation ID and stable failure kind — never prompts, responses, or raw provider error bodies."
      title={`Fallback routing events (${events.length})`}
    >
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No fallback routing events on record.
        </p>
      ) : (
        <DashboardDetailFeed>
          {events.map((event) => (
            <DashboardDetailFeedItem
              key={event.id}
              meta={
                <>
                  <span className="font-mono text-xs">
                    {event.correlationId}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-xs">{event.taskType}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatAiDateTime(event.createdAt)}</span>
                  {event.latencyMs !== null ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{event.latencyMs.toLocaleString("en-US")} ms</span>
                    </>
                  ) : null}
                  {event.statusCode !== null ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>HTTP {event.statusCode}</span>
                    </>
                  ) : null}
                  {event.reason ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">
                        {event.reason.replaceAll("_", " ")}
                      </span>
                    </>
                  ) : null}
                </>
              }
              title={`${event.eventType === "attempt_failed" ? "Attempt failed" : "Fallback served"} · ${event.provider}:${event.model}`}
              titleLines={2}
            />
          ))}
        </DashboardDetailFeed>
      )}
    </DashboardSection>
  );
}

export function AdminAiSecurityEventsFallback() {
  return (
    <div className="section-panel space-y-4">
      <Skeleton className="h-5 w-40 rounded-md" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton className="h-9 w-full rounded-lg" key={index} />
        ))}
      </div>
    </div>
  );
}

export const AdminAiRoutingEventsFallback = AdminAiSecurityEventsFallback;
