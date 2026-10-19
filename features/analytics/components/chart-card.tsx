import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { DashboardSection } from "@/components/shared/dashboard-layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Titled chart container used by every analytics card.
 *
 * Wraps `DashboardSection` so chart cards inherit the app's card chrome, and
 * pairs each chart with an optional accessible table alternative
 * (`ChartDataTable`) behind a "View as table" disclosure. Chart cards never
 * re-declare padding; the section body owns it.
 */
export function AnalyticsChartCard({
  title,
  description,
  action,
  footer,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <DashboardSection
      title={title}
      description={description}
      action={action}
      footer={footer}
      className={className}
      contentClassName={contentClassName}
    >
      {children}
    </DashboardSection>
  );
}

export type ChartDataTableColumn = {
  key: string;
  header: string;
  align?: "start" | "end";
};

export type ChartDataTableRow = Record<string, ReactNode>;

/**
 * Accessible text alternative for a chart, revealed by a disclosure. Charts
 * stay visual; the same numbers can always be read as a table or copied out.
 */
export function ChartDataTable({
  label = "View as table",
  columns,
  rows,
  className,
}: {
  label?: string;
  columns: ChartDataTableColumn[];
  rows: ChartDataTableRow[];
  className?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <details className={cn("group/chart-table", className)}>
      <summary
        className={cn(
          "flex w-fit cursor-pointer list-none items-center gap-1 rounded-full text-xs text-muted-foreground",
          "outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <ChevronRight
          className="size-3.5 transition-transform group-open/chart-table:rotate-90"
          aria-hidden
        />
        {label}
      </summary>
      <div className="mt-3 overflow-hidden rounded-lg border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(column.align === "end" ? "text-right" : undefined)}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      "tabular-nums",
                      column.align === "end" ? "text-right" : undefined,
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
    </details>
  );
}
