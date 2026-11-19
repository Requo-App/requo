"use client";

import { TriangleAlert } from "lucide-react";

import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import {
  AdminDataTable,
  type AdminDataTableColumn,
} from "@/features/admin/components/primitives/admin-data-table";
import { formatAiDateTime } from "@/features/admin/components/ai/admin-ai-format";
import type { AdminAiErrorRow } from "@/features/admin/types";

const aiErrorColumns: AdminDataTableColumn<AdminAiErrorRow>[] = [
  {
    id: "created",
    header: "Time",
    width: "w-[11rem]",
    cell: (row) => (
      <span className="text-sm whitespace-nowrap text-muted-foreground">
        {formatAiDateTime(row.createdAt)}
      </span>
    ),
  },
  {
    id: "provider",
    header: "Provider",
    width: "w-[8rem]",
    cell: (row) => (
      <span className="text-sm font-medium text-foreground">{row.provider}</span>
    ),
  },
  {
    id: "model",
    header: "Model",
    width: "w-[14rem]",
    cell: (row) => (
      <TruncatedTextWithTooltip
        className="font-mono text-xs text-foreground"
        text={row.model}
      />
    ),
  },
  {
    id: "task",
    header: "Task",
    width: "w-[9rem]",
    cell: (row) => (
      <TruncatedTextWithTooltip
        className="font-mono text-xs text-muted-foreground"
        text={row.taskType}
      />
    ),
  },
  {
    id: "error",
    header: "Error",
    width: "w-[24rem]",
    cell: (row) => (
      <TruncatedTextWithTooltip
        className="text-sm text-muted-foreground"
        lines={2}
        text={row.errorMessage || "No error message recorded."}
      />
    ),
  },
];

type AdminAiErrorsTableProps = {
  items: AdminAiErrorRow[];
  hasActiveFilters: boolean;
  pagination?: React.ReactNode;
};

/**
 * Admin AI error log on the shared `AdminDataTable`.
 *
 * Client component by necessity: `AdminDataTable` is a client component and
 * column definitions carry `cell` render functions, which cannot cross the
 * server/client boundary. The server section fetches and passes plain rows.
 *
 * Fixed `createdAt DESC` ordering — no sortable columns, no row detail page.
 * Only persisted failed token logs appear here; fallback routing and security
 * events render in their own sections on the same page. `flush` renders the
 * table edge to edge inside the page's list card (one frame, like the
 * inquiries list) instead of nesting a second bordered container.
 */
export function AdminAiErrorsTable({
  items,
  hasActiveFilters,
  pagination,
}: AdminAiErrorsTableProps) {
  return (
    <AdminDataTable
      columns={aiErrorColumns}
      empty={{
        title: hasActiveFilters
          ? "No errors match these filters."
          : "No failed calls",
        description: hasActiveFilters
          ? "Try widening the provider, model, or task filters."
          : "Failed AI calls from the last 90 days will appear here.",
        icon: TriangleAlert,
      }}
      getRowId={(row) => row.id}
      flush
      minWidthClass="min-w-[68rem]"
      pagination={pagination}
      rows={items}
    />
  );
}
