import { DashboardListResultsSkeleton } from "@/components/shared/dashboard-list-results-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared progressive-region fallbacks for the audit-log settings surface.
 *
 * Imported by both `settings/audit-log/page.tsx` (inner Suspense) and
 * `settings/audit-log/loading.tsx` (hard load) so the two show identical
 * UI. Static copy — filter labels, placeholders, button labels, table
 * headers — paints instantly like (main) PageHeader titles; only DB-backed
 * controls and rows render as skeletons. Copy duplicated from
 * business-audit-log-filters.tsx / business-audit-log-table.tsx — keep in
 * sync.
 */

export function AuditLogFiltersFallback() {
  return (
    <div
      className="dashboard-table-shell mx-auto w-full max-w-2xl"
      aria-hidden="true"
    >
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3">
            <span className="text-sm font-medium leading-[1.35] text-foreground">
              Actor
            </span>
            <Skeleton className="h-9 w-full rounded-md sm:h-8" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-3">
              <span className="text-sm font-medium leading-[1.35] text-foreground">
                Entity
              </span>
              <Skeleton className="h-9 w-full rounded-md sm:h-8" />
            </div>
            <div className="grid gap-3">
              <span className="text-sm font-medium leading-[1.35] text-foreground">
                Action
              </span>
              <Skeleton className="h-9 w-full rounded-md sm:h-8" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium leading-none">Period</span>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-3">
                <span className="text-sm font-medium leading-[1.35] text-foreground">
                  Start date
                </span>
                <Skeleton className="h-9 w-full rounded-md sm:h-8" />
              </div>
              <div className="grid gap-3">
                <span className="text-sm font-medium leading-[1.35] text-foreground">
                  End date
                </span>
                <Skeleton className="h-9 w-full rounded-md sm:h-8" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Skeleton className="h-9 w-full rounded-md sm:h-8 sm:w-28" />
            <Skeleton className="h-9 w-full rounded-md sm:h-8 sm:w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuditLogTableFallback() {
  return (
    <div className="dashboard-table-shell" aria-hidden="true">
      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full min-w-[60rem] caption-bottom">
          <thead>
            <tr className="border-b border-border/70">
              {["When", "Actor", "Action", "Details"].map((header, index) => (
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                  key={header}
                  scope="col"
                  style={index === 2 ? { width: "24rem" } : undefined}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, index) => (
              <tr className="border-b border-border/70 last:border-0" key={index}>
                <td className="px-4 py-4">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-36 rounded-md" />
                    <Skeleton className="h-3 w-20 rounded-md" />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <Skeleton className="h-4 w-24 rounded-md" />
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32 rounded-md" />
                    <Skeleton className="h-3 w-20 rounded-md" />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <Skeleton className="h-4 w-full max-w-md rounded-md" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="xl:hidden">
        <DashboardListResultsSkeleton variant="inquiries" />
      </div>
      <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-48 rounded-md" />
      </div>
    </div>
  );
}
