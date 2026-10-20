import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { MetricHint } from "../kpi/metric-hint";

export type DataTableColumn = {
  key: string;
  header: string;
  /** Numeric columns are right-aligned and rendered with tabular figures. */
  align?: "start" | "end";
  /** Hides the column below the `sm` breakpoint. */
  hideBelowSm?: boolean;
  /** Formula shown in a tooltip next to the header. */
  headerHint?: string;
};

export type DataTableRow = Record<string, ReactNode>;

/**
 * The one table shape in analytics: 40–44px rows, hairline dividers, small
 * uppercase muted headers, and right-aligned tabular numerics. The table
 * scrolls horizontally inside its card on small screens instead of pushing the
 * page wide.
 */
export function DataTable({
  columns,
  rows,
  className,
  minWidthClassName = "min-w-[32rem]",
}: {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  className?: string;
  /** Minimum width before the table starts scrolling. */
  minWidthClassName?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div className={cn("min-w-0", className)}>
      <Table className={minWidthClassName}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  "h-8 px-3 font-semibold",
                  column.align === "end" && "text-right",
                  column.hideBelowSm && "hidden sm:table-cell",
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {column.header}
                  {column.headerHint ? (
                    <MetricHint label={column.header} hint={column.headerHint} />
                  ) : null}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={index}
              className="h-11 border-border/50 transition-colors hover:bg-accent/40"
            >
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    "px-3 py-2 align-middle text-sm text-foreground",
                    column.align === "end" &&
                      "text-right tabular-nums text-foreground",
                    column.hideBelowSm && "hidden sm:table-cell",
                  )}
                >
                  {row[column.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
