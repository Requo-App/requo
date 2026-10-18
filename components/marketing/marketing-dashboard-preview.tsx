import {
  ArrowRight,
  Astroid,
  BarChart3,
  Bell,
  BellRing,
  CheckCircle2,
  ChevronsUpDown,
  Clock,
  FileText,
  Home,
  Inbox,
  Package,
  PencilRuler,
  Receipt,
  Send,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ComponentType } from "react";
import {
  RiArrowDownCircleFill,
  RiArrowUpCircleFill,
  RiCustomerServiceLine,
  RiIndeterminateCircleFill,
  RiInformationFill,
  RiMoonLine,
  RiSearchLine,
  RiSettings4Line,
  RiSideBarFill,
  RiSunLine,
} from "@remixicon/react";

import { MarketingHomeComposer } from "@/components/marketing/marketing-home-composer";
import { BusinessAvatar } from "@/components/shared/business-avatar";
import { ChevronDownSmall } from "@/components/shared/chevrons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Static, pixel-accurate recreation of the real /home dashboard at a canonical
 * 1440px desktop reference. Every class string below is transcribed from the
 * live components (`DashboardSidebar`, `DashboardShellFrame`, `Dashboard-
 * Greeting`, `ChatComposer`, `StatCards`, `NeedsAttentionTabs`) with the
 * responsive branches resolved to their desktop values, so the composition is
 * deterministic inside the scaled hero stage at any visitor viewport.
 *
 * The stage is inert decoration: no links, state, or handlers.
 */

const BUSINESS_NAME = "Riverside Contractors";
const USER_FIRST_NAME = "Jamie";
const USER_EMAIL = "jamie@riverside.com";

type PreviewIcon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

const primaryNavItems: readonly {
  label: string;
  icon: PreviewIcon;
  selected?: boolean;
}[] = [
  { label: "Home", icon: Home, selected: true },
  { label: "Inquiries", icon: Inbox },
  { label: "Quotes", icon: FileText },
  { label: "Invoices", icon: Receipt },
  { label: "Payments", icon: Wallet },
  { label: "Follow-ups", icon: BellRing },
  { label: "Assistant", icon: Astroid },
  { label: "Services", icon: PencilRuler },
  { label: "Products", icon: Package },
  { label: "Analytics", icon: BarChart3 },
];

const secondaryNavItems: readonly { label: string; icon: PreviewIcon }[] = [
  { label: "Support", icon: RiCustomerServiceLine },
  { label: "Settings", icon: RiSettings4Line },
];

type KpiPreviewStat = {
  icon: PreviewIcon;
  label: string;
  value: string;
  caption: string;
  hint: string;
  delta?: {
    label: string;
    tone: "lime" | "rose" | "neutral";
    direction: "up" | "down" | "flat";
  };
};

// Labels, captions, hints, and delta formats mirror `buildHomeKpiStats`.
const kpiStats: readonly KpiPreviewStat[] = [
  {
    icon: TrendingUp,
    label: "Revenue won",
    value: "$18,450",
    caption: "vs previous 30 days",
    hint: "Total value of quotes your customers accepted in the last 30 days. The delta compares against the 30 days before that.",
    delta: { label: "+32%", tone: "lime", direction: "up" },
  },
  {
    icon: Send,
    label: "Awaiting reply",
    value: "$12,200",
    caption: "4 open quotes",
    hint: "Value of sent quotes that haven't expired and are still waiting on a customer reply.",
  },
  {
    icon: Target,
    label: "Acceptance rate",
    value: "68%",
    caption: "vs previous 30 days",
    hint: "Share of sent quotes that customers accepted in the last 30 days. The delta compares against the 30 days before that.",
    delta: { label: "+9 pts", tone: "lime", direction: "up" },
  },
  {
    icon: Clock,
    label: "Time to quote",
    value: "45m",
    caption: "vs previous 30 days",
    hint: "Average time from an inquiry arriving to your first quote going out. The delta compares against the 30 days before that.",
    delta: { label: "42% faster", tone: "lime", direction: "down" },
  },
];

type QueuePreviewItem = {
  key: string;
  category: "Follow-up" | "Inquiry" | "Quote";
  icon: PreviewIcon;
  iconStyle: string;
  title: string;
  description: string;
  meta: string;
  actionLabel: string;
  urgent?: boolean;
};

// Mirrors `buildNeedsAttentionItems` sampling: an overdue follow-up, a new
// inquiry, a draft quote, and a freshly accepted quote.
const queueItems: readonly QueuePreviewItem[] = [
  {
    key: "overdue-follow-up",
    category: "Follow-up",
    icon: BellRing,
    iconStyle: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    title: "Follow up on Kitchen Renovation Quote",
    description: "Sarah Jenkins · Sent quote 3 days ago",
    meta: "Due Oct 16, 2026",
    actionLabel: "Follow up now",
    urgent: true,
  },
  {
    key: "new-inquiry",
    category: "Inquiry",
    icon: Inbox,
    iconStyle: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    title: "Marcus Vance",
    description: "Commercial HVAC Assessment",
    meta: "Submitted Oct 18, 2026",
    actionLabel: "Create quote",
  },
  {
    key: "draft-quote",
    category: "Quote",
    icon: FileText,
    iconStyle: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    title: "Electrical Panel Upgrade & Rewiring",
    description: "David Chen",
    meta: "Updated Oct 17, 2026",
    actionLabel: "Finish & send",
  },
  {
    key: "accepted-quote",
    category: "Quote",
    icon: CheckCircle2,
    iconStyle: "bg-green-500/10 text-green-600 dark:text-green-400",
    title: "Full Roof Replacement & Gutters",
    description: "Oakridge Property Management",
    meta: "Accepted Oct 18, 2026",
    actionLabel: "View quote",
  },
];

const queueTabs: readonly { label: string; count: number }[] = [
  { label: "All", count: 4 },
  { label: "Inquiries", count: 1 },
  { label: "Quotes", count: 2 },
  { label: "Follow-ups", count: 1 },
];

/** Expanded primary/secondary sidebar row (`NavItem` in DashboardSidebar). */
function SidebarNavRow({
  icon: Icon,
  label,
  selected = false,
}: {
  icon: PreviewIcon;
  label: string;
  selected?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-2 overflow-hidden rounded-md px-2 py-1.5 text-muted-foreground transition-[width,background-color] duration-300 ease-in-out hover:bg-sidebar-accent hover:text-sidebar-foreground",
        selected &&
          "bg-black/[0.08] font-medium text-sidebar-foreground dark:bg-white/10",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon
          aria-hidden
          className={cn(
            "size-4.5 shrink-0",
            selected ? "text-sidebar-foreground" : "text-muted-foreground",
          )}
        />
        <span
          className={cn(
            "text-sm leading-6 font-medium whitespace-nowrap",
            selected ? "text-sidebar-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      </span>
    </div>
  );
}

/** `ThemeToggle` with `appearance="sidebar-segmented"`, light mode selected. */
function SidebarThemeToggle() {
  return (
    <div
      aria-label="Theme"
      className="relative inline-flex w-fit items-center gap-1 rounded-full bg-sidebar-accent p-1"
      role="group"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 left-1 size-8 rounded-full border border-border bg-card shadow-xs transition-transform duration-200 ease"
      />
      <button
        aria-label="Use light mode"
        aria-pressed
        className="relative z-10 grid size-8 cursor-pointer place-items-center rounded-full text-foreground transition-colors duration-150 ease outline-none"
        type="button"
      >
        <RiSunLine aria-hidden className="size-4" />
      </button>
      <button
        aria-label="Use dark mode"
        className="relative z-10 grid size-8 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-150 ease outline-none hover:text-foreground"
        type="button"
      >
        <RiMoonLine aria-hidden className="size-4" />
      </button>
    </div>
  );
}

/** `DeltaPill` from StatCards, with the direction driving the arrow glyph. */
function KpiDeltaPill({
  delta,
}: {
  delta: NonNullable<KpiPreviewStat["delta"]>;
}) {
  const Icon =
    delta.direction === "down"
      ? RiArrowDownCircleFill
      : delta.direction === "up"
        ? RiArrowUpCircleFill
        : RiIndeterminateCircleFill;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full py-0.5 pr-2 pl-1",
        delta.tone === "lime" && "bg-success/10 text-success",
        delta.tone === "rose" && "bg-destructive/10 text-destructive",
        delta.tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="text-xs font-medium whitespace-nowrap tabular-nums">
        {delta.label}
      </span>
    </span>
  );
}

/** `FooterStatCard` from StatCards. */
function KpiCard({ stat }: { stat: KpiPreviewStat }) {
  const Icon = stat.icon;

  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-border/60 bg-card p-2">
      <div className="flex w-full items-start justify-between gap-2.5 p-2">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <Icon aria-hidden className="size-5 shrink-0" />
        </span>
        <button
          aria-label={`About ${stat.label}`}
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground"
          title={stat.hint}
          type="button"
        >
          <RiInformationFill aria-hidden className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 px-2 pt-2.5 pb-3.5">
        <p className="truncate text-sm font-medium text-muted-foreground">
          {stat.label}
        </p>
        <p className="text-2xl font-semibold tracking-tight whitespace-nowrap text-foreground tabular-nums">
          {stat.value}
        </p>
      </div>

      <div className="mt-auto flex w-full items-center justify-between gap-2 rounded-xl bg-muted py-1.5 pr-1.5 pl-2.5">
        <p className="truncate text-xs text-muted-foreground">{stat.caption}</p>
        {stat.delta ? <KpiDeltaPill delta={stat.delta} /> : null}
      </div>
    </section>
  );
}

/** `NeedsAttentionMinimalRow` from NeedsAttentionTabs. */
function QueueRow({ item }: { item: QueuePreviewItem }) {
  const Icon = item.icon;

  return (
    <div className="group flex items-center justify-between gap-4 border-b border-border/40 px-2 py-2.5 transition-colors first:pt-2 last:border-b-0 hover:bg-accent/15">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
            item.iconStyle,
          )}
        >
          <Icon aria-hidden className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              {item.title}
            </span>
            <span className="shrink-0 rounded-md bg-secondary/80 px-1.5 py-0.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {item.category}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.description}
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <span
              className={cn(
                item.urgent
                  ? "font-medium text-destructive"
                  : "text-muted-foreground/80",
              )}
            >
              {item.meta}
            </span>
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="inline-flex text-xs font-semibold text-primary/95 transition-colors group-hover:text-primary group-hover:underline">
          {item.actionLabel}
        </span>
        <ArrowRight
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </div>
    </div>
  );
}

export function MarketingDashboardPreview() {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-full w-full overflow-hidden bg-background text-left font-sans antialiased select-none"
      inert
    >
      {/* Sidebar — `DashboardSidebar` (expanded) inside the fixed shell rail */}
      <aside className="flex h-full w-[14.5rem] shrink-0 flex-col overflow-hidden rounded-l-none rounded-r-3xl border border-l-0 border-sidebar-border bg-sidebar p-3 shadow-[var(--surface-shadow-md)]">
        {/* Pinned header: business switcher + search */}
        <div className="-mx-2 flex w-[calc(100%+1rem)] shrink-0 flex-col gap-3 px-2 pt-2 pb-1">
          <div className="flex w-full flex-row items-center justify-between">
            <div className="-m-2 max-w-[12.875rem] min-w-0 flex-1 overflow-hidden p-2">
              {/* `BusinessSwitcher` compact trigger */}
              <button
                aria-label={`Switch business — current business ${BUSINESS_NAME}`}
                className="group/business-switcher flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
                title={BUSINESS_NAME}
                type="button"
              >
                <BusinessAvatar loading="eager" name={BUSINESS_NAME} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground">
                  {BUSINESS_NAME}
                </span>
                <ChevronsUpDown
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </button>
            </div>
            <button
              aria-label="Collapse sidebar"
              className="cursor-pointer text-muted-foreground transition-transform duration-300 ease-in-out"
              type="button"
            >
              <RiSideBarFill aria-hidden className="size-5 -scale-x-100" />
            </button>
          </div>

          <div className="flex w-full flex-col gap-3">
            {/* Quick search */}
            <button
              aria-label="Search"
              className="flex w-full cursor-pointer items-center gap-2 rounded-full bg-sidebar-accent px-2 py-1.5 transition-[width,border-radius,background-color] duration-300 ease-in-out hover:bg-sidebar-accent/70"
              type="button"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <RiSearchLine
                  aria-hidden
                  className="size-5 shrink-0 text-muted-foreground"
                />
                <span className="text-sm leading-6 font-medium whitespace-nowrap text-muted-foreground">
                  Search
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* Primary nav scroller */}
        <div className="-mx-2 flex min-h-0 w-[calc(100%+1rem)] flex-1 flex-col overflow-y-auto px-2 py-2 [scrollbar-width:none]">
          <nav aria-label="Primary" className="flex w-full flex-col gap-1 px-0.5">
            {primaryNavItems.map((item) => (
              <SidebarNavRow
                icon={item.icon}
                key={item.label}
                label={item.label}
                selected={item.selected}
              />
            ))}
          </nav>
        </div>

        {/* Pinned footer: theme, secondary nav, user menu */}
        <div className="flex w-full shrink-0 flex-col gap-3">
          <SidebarThemeToggle />

          <nav className="flex w-full flex-col gap-1">
            {secondaryNavItems.map((item) => (
              <SidebarNavRow icon={item.icon} key={item.label} label={item.label} />
            ))}
          </nav>

          <div className="w-full min-w-0">
            <div className="flex w-full flex-col gap-2">
              {/* Checklist slot — always mounted, empty in the steady state */}
              <div className="w-full" />
              {/* `DashboardUserMenu` trigger (SidebarMenuButton, expanded) */}
              <ul className="flex w-full min-w-0 flex-col gap-0.5">
                <li className="group/menu-item relative">
                  <button
                    aria-label={USER_FIRST_NAME}
                    className="peer/menu-button group/menu-button motion-sidebar-panel group/user-menu flex h-auto w-full cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-xl border-2 border-transparent bg-sidebar-accent py-2 pr-3 pl-2.5 text-left text-sm font-medium text-sidebar-foreground/75 ring-sidebar-ring transition-[width,height,padding,background-color,color,transform] outline-hidden hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground [&>span:last-child]:truncate [&_svg]:size-4.5 [&_svg]:shrink-0"
                    type="button"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <Avatar className="rounded-full border-0 bg-transparent">
                        <AvatarFallback className="border-0 bg-transparent text-foreground">
                          {USER_FIRST_NAME.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex min-w-0 flex-1 flex-col items-start justify-center">
                        <span className="w-full truncate text-body-medium text-foreground">
                          {USER_FIRST_NAME}
                        </span>
                        <span className="w-full truncate text-body-regular text-muted-foreground">
                          {USER_EMAIL}
                        </span>
                      </span>
                    </span>
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-xs text-muted-foreground transition-colors">
                      <ChevronDownSmall className="size-4" />
                    </span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop topbar: breadcrumb + notification bell */}
        <div className="flex h-12 shrink-0 items-stretch bg-background">
          <header className="flex min-w-0 flex-1 items-center">
            <div className="mx-auto w-full max-w-[92rem] py-2 pr-8 pl-4">
              <div className="flex min-h-9 min-w-0 items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <nav
                    aria-label="Pages"
                    className="flex w-full items-center overflow-x-auto [scrollbar-width:none]"
                  >
                    <ol className="flex items-center gap-2.5 px-1">
                      <li
                        aria-current="page"
                        className="flex items-center gap-1.5 text-sm font-normal whitespace-nowrap text-foreground"
                      >
                        <Home aria-hidden className="size-4 shrink-0" />
                        Home
                      </li>
                    </ol>
                  </nav>
                </div>
                <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
                  <Button
                    aria-label="3 unread notifications"
                    className="relative"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Bell className="size-4" />
                    <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-xs leading-none font-semibold text-background shadow-sm">
                      3
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          </header>
        </div>

        {/* Content (`dashboard-main` + `dashboard-content` at desktop) */}
        <main className="flex flex-1 flex-col overflow-x-clip px-6 py-6">
          <div className="mx-auto flex w-full max-w-[92rem] min-w-0 flex-1 flex-col overflow-x-clip">
            <div className="-mx-6 -mt-8 -mb-8 flex min-w-0 flex-col overflow-x-clip px-10 pt-8 pb-8">
              {/* Greeting + assistant composer */}
              <section className="mx-auto w-full max-w-5xl">
                <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 py-6 text-center">
                  <div className="flex flex-col gap-1">
                    <h1 className="font-heading text-[1.75rem] font-semibold tracking-tight text-foreground">
                      Good morning, {USER_FIRST_NAME}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      2 urgent items and 3 new items since your last visit.
                    </p>
                  </div>
                  <MarketingHomeComposer />
                </div>
              </section>

              {/* Activation launchpad — empty in the steady state, 16px offset */}
              <section className="mx-auto mt-4 w-full max-w-5xl" />

              {/* KPI row */}
              <section className="mx-auto mt-5 w-full max-w-5xl">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                      Last 30 days
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      Full analytics
                      <ArrowRight aria-hidden className="size-3" />
                    </span>
                  </div>
                  <div className="grid w-full grid-cols-4 gap-4">
                    {kpiStats.map((stat) => (
                      <KpiCard key={stat.label} stat={stat} />
                    ))}
                  </div>
                </div>
              </section>

              {/* Priority queue */}
              <section className="mx-auto mt-8 w-full max-w-5xl pb-24">
                <div className="flex flex-col">
                  <div className="flex items-center justify-between pb-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-foreground">
                        Priority queue
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Follow up, finish drafts, and confirm wins.
                      </p>
                    </div>
                    <Badge className="text-xs" variant="secondary">
                      {queueItems.length}
                    </Badge>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 pb-2">
                      {queueTabs.map((tab, index) => (
                        <Button
                          className={cn(
                            "h-7 gap-1 px-2.5 text-xs",
                            index === 0 && "font-semibold",
                          )}
                          key={tab.label}
                          size="sm"
                          type="button"
                          variant={index === 0 ? "secondary" : "ghost"}
                        >
                          {tab.label}
                          <span className="text-xs text-muted-foreground">
                            {tab.count}
                          </span>
                        </Button>
                      ))}
                    </div>

                    <div className="flex flex-col">
                      {queueItems.map((item) => (
                        <QueueRow item={item} key={item.key} />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
