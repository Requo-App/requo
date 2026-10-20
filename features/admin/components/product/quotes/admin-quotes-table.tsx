"use client";

import { FileText } from "lucide-react";

import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import {
  AdminDataTable,
  type AdminDataTableColumn,
} from "@/features/admin/components/primitives/admin-data-table";
import {
  formatAdminMoney,
  formatProductDate,
} from "@/features/admin/components/product/admin-product-format";
import { getAdminQuoteDetailPath } from "@/features/admin/navigation";
import type { AdminQuoteRow } from "@/features/admin/types";
import { QuoteRecordStateBadge } from "@/features/quotes/components/quote-record-state-badge";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";

const adminQuoteColumns: AdminDataTableColumn<AdminQuoteRow>[] = [
  {
    id: "quote",
    header: "Quote",
    width: "w-[16rem]",
    cell: (row) => {
      const href = getAdminQuoteDetailPath(row.id);

      return (
        <div className="table-meta-stack max-w-full">
          <TruncatedTextWithTooltip
            className="table-link"
            href={href}
            prefetch={true}
            text={row.quoteNumber}
          />
          <TruncatedTextWithTooltip
            className="table-supporting-text"
            href={href}
            prefetch={true}
            text={row.title}
          />
        </div>
      );
    },
  },
  {
    id: "customer",
    header: "Customer",
    width: "w-[14rem]",
    cell: (row) => (
      <TruncatedTextWithTooltip
        className="table-emphasis"
        href={getAdminQuoteDetailPath(row.id)}
        prefetch={true}
        text={row.customerName}
      />
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "w-[12rem]",
    align: "center",
    cell: (row) =>
      row.recordState === "archived" ? (
        <QuoteRecordStateBadge state="archived" />
      ) : (
        <QuoteStatusBadge status={row.status} />
      ),
  },
  {
    id: "total",
    header: "Total",
    width: "w-[7rem]",
    align: "right",
    cell: (row) => (
      <span className="text-sm font-medium tabular-nums text-foreground">
        {formatAdminMoney(row.totalInCents, row.currency)}
      </span>
    ),
  },
  {
    id: "business",
    header: "Business",
    width: "w-[12rem]",
    cell: (row) => (
      <TruncatedTextWithTooltip
        className="table-emphasis"
        href={getAdminQuoteDetailPath(row.id)}
        prefetch={true}
        text={row.businessName}
      />
    ),
  },
  {
    id: "created",
    header: "Created",
    width: "w-[8rem]",
    cell: (row) => (
      <span className="text-sm text-muted-foreground">
        {formatProductDate(row.createdAt)}
      </span>
    ),
  },
];

type AdminQuotesTableProps = {
  items: AdminQuoteRow[];
  hasActiveFilters: boolean;
  toolbar?: React.ReactNode;
  pagination?: React.ReactNode;
};

/**
 * Admin quotes list on the shared `AdminDataTable`.
 *
 * Fixed `createdAt DESC` ordering (the list query owns it) — no sortable
 * columns. Status renders through the main app's `QuoteStatusBadge`
 * unchanged. `flush` renders the table edge to edge inside the page's
 * list card (one frame, like the businesses list) instead of nesting a
 * second bordered container. Below `xl` each row becomes a
 * `MobileRecordRow` card.
 */
export function AdminQuotesTable({
  items,
  hasActiveFilters,
  toolbar,
  pagination,
}: AdminQuotesTableProps) {
  return (
    <AdminDataTable
      columns={adminQuoteColumns}
      empty={{
        title: hasActiveFilters
          ? "No quotes match these filters."
          : "No quotes yet",
        description: hasActiveFilters
          ? "Try a different number, customer, email, or status filter."
          : "Quotes drafted by every business will appear here.",
        icon: FileText,
      }}
      getRowHref={(row) => getAdminQuoteDetailPath(row.id)}
      getRowId={(row) => row.id}
      flush
      minWidthClass="min-w-[72rem]"
      mobileCard={(row) => ({
        title: `${row.quoteNumber} · ${row.customerName}`,
        subtitle: row.businessName,
        statusBadge:
          row.recordState === "archived" ? (
            <QuoteRecordStateBadge state="archived" />
          ) : (
            <QuoteStatusBadge status={row.status} />
          ),
        metadata: (
          <span>
            {formatAdminMoney(row.totalInCents, row.currency)} · Created{" "}
            {formatProductDate(row.createdAt)}
          </span>
        ),
      })}
      pagination={pagination}
      rows={items}
      toolbar={toolbar}
    />
  );
}
