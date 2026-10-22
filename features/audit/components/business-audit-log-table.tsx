"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { DashboardEmptyState } from "@/components/shared/dashboard-layout";
import { DataListPagination } from "@/components/shared/data-list-pagination";
import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BusinessAuditLogCards } from "@/features/audit/components/business-audit-log-cards";
import {
  getAuditActionLabel,
  getAuditEntityLabel,
} from "@/features/audit/constants";
import type { BusinessAuditLogPage } from "@/features/audit/types";
import {
  formatAuditActorLabel,
  formatAuditEventDetails,
  formatAuditTimestamp,
} from "@/features/audit/utils";

type BusinessAuditLogTableProps = {
  page: BusinessAuditLogPage;
};

export function BusinessAuditLogTable({
  page,
}: BusinessAuditLogTableProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsRecord = useMemo(
    () => Object.fromEntries(searchParams.entries()),
    [searchParams],
  );

  const firstItemIndex =
    page.totalCount === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const lastItemIndex = Math.min(page.page * page.pageSize, page.totalCount);

  if (!page.items.length) {
    return (
      <div className="p-4">
        <DashboardEmptyState
          description="Meaningful lifecycle, billing, member, and security actions will appear here as they happen."
          title="No audit events yet"
          variant="list"
        />
      </div>
    );
  }

  return (
    <>
      <BusinessAuditLogCards items={page.items} />
      <div className="hidden overflow-x-auto no-scrollbar xl:block">
        <Table className="min-w-[60rem]">
          <TableCaption className="sr-only">Newest audit events appear first.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">When</TableHead>
              <TableHead className="whitespace-nowrap">Actor</TableHead>
              <TableHead className="w-[24rem]">Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((item) => {
              const timestamp = formatAuditTimestamp(item);
              const actorLabel = formatAuditActorLabel(item);
              const actionLabel = getAuditActionLabel(item.action);
              const entityLabel = getAuditEntityLabel(item.entityType);
              const details = formatAuditEventDetails(item);

              return (
                <TableRow className="group/row" key={item.id}>
                  <TableCell className="whitespace-nowrap">
                    <div className="table-meta-stack">
                      <span
                        className="text-sm leading-5 font-medium text-foreground"
                        suppressHydrationWarning
                        title={`${timestamp.absolute} (${timestamp.relative})`}
                      >
                        {timestamp.absolute}
                      </span>
                      <span
                        className="table-supporting-text"
                        suppressHydrationWarning
                        title={`${timestamp.absolute} (${timestamp.relative})`}
                      >
                        {timestamp.relative}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="whitespace-nowrap">
                    <span className="table-emphasis">{actorLabel}</span>
                  </TableCell>

                  <TableCell className="w-[24rem]">
                    <div className="table-meta-stack">
                      <TruncatedTextWithTooltip
                        className="table-emphasis"
                        lines={2}
                        text={actionLabel}
                      />
                      <TruncatedTextWithTooltip
                        className="table-supporting-text"
                        text={entityLabel}
                      />
                    </div>
                  </TableCell>

                  <TableCell>
                    <TruncatedTextWithTooltip
                      className="table-supporting-text"
                      lines={2}
                      text={details}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {page.pageCount > 1 ? (
        <DataListPagination
          currentPage={page.page}
          pageSize={page.pageSize}
          pathname={pathname}
          searchParams={searchParamsRecord}
          totalItems={page.totalCount}
          totalPages={page.pageCount}
        />
      ) : (
        <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="data-list-toolbar-count">
            Showing {firstItemIndex}-{lastItemIndex} of {page.totalCount}{" "}
            {page.totalCount === 1 ? "audit event" : "audit events"}
          </p>
        </div>
      )}
    </>
  );
}
