"use client";

import { Inbox } from "lucide-react";

import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import {
  AdminDataTable,
  type AdminDataTableColumn,
} from "@/features/admin/components/primitives/admin-data-table";
import { formatProductDate } from "@/features/admin/components/product/admin-product-format";
import { getAdminInquiryDetailPath } from "@/features/admin/navigation";
import type { AdminInquiryRow } from "@/features/admin/types";
import { InquiryStatusBadge } from "@/features/inquiries/components/inquiry-status-badge";
import { InquiryRecordStateBadge } from "@/features/inquiries/components/inquiry-record-state-badge";

const adminInquiryColumns: AdminDataTableColumn<AdminInquiryRow>[] = [
  {
    id: "inquiry",
    header: "Inquiry",
    width: "w-[20rem]",
    cell: (row) => {
      const href = getAdminInquiryDetailPath(row.id);

      return (
        <div className="table-meta-stack max-w-full">
          <TruncatedTextWithTooltip
            className="table-link"
            href={href}
            prefetch={true}
            text={row.subject?.trim() || `Inquiry from ${row.customerName}`}
          />
          <TruncatedTextWithTooltip
            className="table-supporting-text"
            href={href}
            prefetch={true}
            text={row.customerEmail || row.customerName}
          />
        </div>
      );
    },
  },
  {
    id: "status",
    header: "Status",
    width: "w-[9rem]",
    cell: (row) =>
      row.recordState === "archived" ? (
        <InquiryRecordStateBadge state="archived" />
      ) : (
        <InquiryStatusBadge status={row.status} />
      ),
  },
  {
    id: "business",
    header: "Business",
    width: "w-[14rem]",
    cell: (row) => (
      <TruncatedTextWithTooltip
        className="table-emphasis"
        href={getAdminInquiryDetailPath(row.id)}
        prefetch={true}
        text={row.businessName}
      />
    ),
  },
  {
    id: "submitted",
    header: "Submitted",
    width: "w-[8rem]",
    cell: (row) => (
      <span className="text-sm text-muted-foreground">
        {formatProductDate(row.submittedAt)}
      </span>
    ),
  },
];

type AdminInquiriesTableProps = {
  items: AdminInquiryRow[];
  hasActiveFilters: boolean;
  toolbar?: React.ReactNode;
  pagination?: React.ReactNode;
};

/**
 * Admin inquiries list on the shared `AdminDataTable`.
 *
 * Fixed `submittedAt DESC` ordering (the list query owns it) — no sortable
 * columns. Status renders through the main app's `InquiryStatusBadge`
 * unchanged. `flush` renders the table edge to edge inside the page's
 * list card (one frame, like the businesses list) instead of nesting a
 * second bordered container. Below `xl` each row becomes a
 * `MobileRecordRow` card.
 */
export function AdminInquiriesTable({
  items,
  hasActiveFilters,
  toolbar,
  pagination,
}: AdminInquiriesTableProps) {
  return (
    <AdminDataTable
      columns={adminInquiryColumns}
      empty={{
        title: hasActiveFilters
          ? "No inquiries match these filters."
          : "No inquiries yet",
        description: hasActiveFilters
          ? "Try a different customer, email, subject, or status filter."
          : "Inbound requests from every business will appear here.",
        icon: Inbox,
      }}
      getRowHref={(row) => getAdminInquiryDetailPath(row.id)}
      getRowId={(row) => row.id}
      flush
      minWidthClass="min-w-[56rem]"
      mobileCard={(row) => ({
        title: row.subject?.trim() || `Inquiry from ${row.customerName}`,
        subtitle: `${row.customerName} · ${row.businessName}`,
        statusBadge: <InquiryStatusBadge status={row.status} />,
        metadata: <span>Submitted {formatProductDate(row.submittedAt)}</span>,
      })}
      pagination={pagination}
      rows={items}
      toolbar={toolbar}
    />
  );
}
