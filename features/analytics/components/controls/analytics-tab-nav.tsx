import Link from "next/link";
import { LayoutDashboard, Lock, TrendingUp, Users, Workflow } from "lucide-react";

import { getAnalyticsTabHref } from "@/features/analytics/lib/links";
import {
  analyticsTabs,
  type AnalyticsTab,
} from "@/features/analytics/lib/window";
import { cn } from "@/lib/utils";

const tabMeta: Record<
  AnalyticsTab,
  { label: string; icon: typeof LayoutDashboard }
> = {
  overview: { label: "Overview", icon: LayoutDashboard },
  performance: { label: "Performance", icon: TrendingUp },
  operations: { label: "Operations", icon: Workflow },
  team: { label: "Team", icon: Users },
};

/**
 * URL-driven tab bar. Locked tabs stay visible with a lock glyph — hiding
 * them would hide the upgrade path — but selecting one renders the static
 * demo preview instead of running premium queries (the page decides that
 * server-side before any data function is called).
 */
export function AnalyticsTabNav({
  businessSlug,
  activeTab,
  lockedTabs,
  range,
  from,
  to,
  compare,
}: {
  businessSlug: string;
  activeTab: AnalyticsTab;
  lockedTabs: AnalyticsTab[];
  range: string;
  from: string | null;
  to: string | null;
  compare: string | null;
}) {
  return (
    <nav aria-label="Analytics sections" className="overflow-x-auto no-scrollbar">
      <ul className="flex w-max items-center gap-1">
        {analyticsTabs.map((tab) => {
          const meta = tabMeta[tab];
          const Icon = meta.icon;
          const isActive = tab === activeTab;
          const isLocked = lockedTabs.includes(tab);

          return (
            <li key={tab}>
              <Link
                href={getAnalyticsTabHref(businessSlug, tab, {
                  range,
                  from,
                  to,
                  compare,
                })}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {meta.label}
                {isLocked ? (
                  <>
                    <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="sr-only">(requires a higher plan)</span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
