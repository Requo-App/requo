"use client";

import { type ComponentType } from "react";
import {
  RiBox3Line,
  RiChatSmile2Line,
  RiCoinsFill,
  RiGroupFill,
  RiGroupLine,
  RiInformationFill,
  RiRefund2Fill,
  RiShoppingBasket2Fill,
  RiShoppingBasketLine,
} from "@remixicon/react";
import { cva } from "class-variance-authority";

import {
  DeltaPill,
  deltaToneClass,
  type DeltaPillSentiment,
} from "@/components/shared/delta-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * KPI stat cards in two looks, rendered on Requo surfaces and type utilities:
 *
 *   plain   icon tile, label, value, delta chip — the compact dashboard row
 *   footer  tinted gradient icon tile beside the label (plus an optional
 *           info tooltip), a display-size value, and a muted footer band
 *           carrying the comparison caption and a delta pill
 */

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type StatCardsVariant = "plain" | "footer";

/** Kept for call-site compat; the footer tile is a single neutral style. */
export type StatTone = "blue" | "orange" | "purple" | "pink" | "sky" | "emerald";

export type Stat = {
  icon: IconComponent;
  label: string;
  value: string;
  /** Omit to hide the delta pill (e.g. stock metrics with a self-explanatory caption). */
  delta?: string;
  /** Pill sentiment; the arrow glyph follows `deltaDirection` (falling back
   *  to the sign of `delta`). Defaults to neutral when omitted. */
  deltaColor?: "lime" | "rose" | "neutral";
  /** Which way the underlying metric moved — drives the arrow glyph, so
   *  prose labels like "20% slower" can still point the right way. */
  deltaDirection?: "up" | "down" | "flat";
  /** Unused — kept so existing callers still typecheck; tile is neutral. */
  tone?: StatTone;
  /** Footer variant: comparison caption in the band ("From last month"). */
  caption?: string;
  /** Footer variant: shows an info glyph with this text on hover. */
  hint?: string;
};

const DEFAULT_STATS: Stat[] = [
  { icon: RiGroupLine, label: "Customers", value: "14,592", delta: "+5.3%", deltaColor: "lime" },
  { icon: RiBox3Line, label: "Unit sold", value: "385", delta: "-2.1%", deltaColor: "rose" },
  { icon: RiShoppingBasketLine, label: "Orders", value: "1,394", delta: "0.00%", deltaColor: "neutral" },
  { icon: RiChatSmile2Line, label: "Support tickets", value: "708", delta: "+12.8%", deltaColor: "lime" },
];

const DEFAULT_FOOTER_STATS: Stat[] = [
  {
    icon: RiCoinsFill,
    label: "Total revenue",
    value: "$152,313.92",
    delta: "16%",
    deltaColor: "lime",
    tone: "blue",
    hint: "Gross revenue across every channel this month, before refunds. The change is against the same days last month.",
  },
  {
    icon: RiShoppingBasket2Fill,
    label: "Total orders",
    value: "25,162",
    delta: "20%",
    deltaColor: "lime",
    tone: "orange",
    hint: "Checkouts completed this month, repeat purchases included. The change is against the same days last month.",
  },
  {
    icon: RiGroupFill,
    label: "New customers",
    value: "3,847",
    delta: "8.1%",
    deltaColor: "lime",
    tone: "purple",
    hint: "People who bought for the first time this month. The change is against the same days last month.",
  },
  {
    icon: RiRefund2Fill,
    label: "Refunds",
    value: "$4,209.44",
    delta: "2.4%",
    deltaColor: "rose",
    tone: "pink",
    hint: "Value of orders refunded this month. Down is good here, so the change reads in red when refunds rise.",
  },
];

/** Single neutral tile for the footer variant — matches the plain cards
 *  and the rest of the dashboard (`bg-muted` + `text-foreground`).
 *  `StatTone` is kept for call-site compat but no longer affects color. */

/** Maps the legacy pill color prop to the shared delta sentiment. */
function sentimentFromDeltaColor(
  deltaColor: Stat["deltaColor"],
): DeltaPillSentiment {
  if (deltaColor === "lime") return "positive";
  if (deltaColor === "rose") return "negative";
  return "neutral";
}

const statCardsGridVariants = cva("grid w-full gap-4", {
  variants: {
    // The footer cards carry a display-size value, so they go one per
    // row on phones where the plain cards still fit two up.
    look: {
      plain: "",
      footer: "",
    },
    columns: {
      "1": "",
      "2": "",
      "4": "",
    },
  },
  compoundVariants: [
    { columns: "1", className: "grid-cols-1" },
    { look: "plain", columns: "2", className: "grid-cols-2" },
    { look: "plain", columns: "4", className: "grid-cols-2 lg:grid-cols-4" },
    { look: "footer", columns: "2", className: "grid-cols-1 sm:grid-cols-2" },
    { look: "footer", columns: "4", className: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" },
  ],
  defaultVariants: {
    look: "plain",
    columns: "4",
  },
});

/** Bare info glyph with a tooltip — the footer header's trailing control. */
function StatHint({ label, hint }: { label: string; hint: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`About ${label}`}
            className="flex shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RiInformationFill className="size-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px]">{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PlainStatCard({ stat }: { stat: Stat }) {
  return (
    <section className="flex h-[132px] min-w-0 flex-col items-start justify-between rounded-xl border border-border/60 bg-card p-4">
      <span className="flex items-center rounded-md bg-muted p-1.5">
        <stat.icon className="size-5 shrink-0 text-foreground" aria-hidden />
      </span>
      <div className="flex w-full flex-col gap-0.5">
        <p className="w-full text-sm font-medium text-muted-foreground">{stat.label}</p>
        <div className="flex w-full flex-wrap items-center gap-2">
          <p className="whitespace-nowrap text-2xl font-semibold tracking-tight text-foreground">
            {stat.value}
          </p>
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
              deltaToneClass(sentimentFromDeltaColor(stat.deltaColor)),
            )}
          >
            {stat.delta}
          </span>
        </div>
      </div>
    </section>
  );
}

function FooterStatCard({ stat }: { stat: Stat }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-border/60 bg-card p-2">
      {/* Icon tile + optional info glyph, both hanging from the same top inset */}
      <div className="flex w-full items-start justify-between gap-2.5 p-2">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <stat.icon className="size-5 shrink-0" aria-hidden />
        </span>
        {stat.hint && <StatHint label={stat.label} hint={stat.hint} />}
      </div>

      {/* Label sits directly over the number, as on the plain cards */}
      <div className="flex flex-col gap-0.5 px-2 pt-2.5 pb-3.5">
        <p className="truncate text-sm font-medium text-muted-foreground">{stat.label}</p>
        <p className="whitespace-nowrap text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {stat.value}
        </p>
      </div>

      {/* Footer band: comparison caption + delta pill on an inner tile */}
      <div className="mt-auto flex w-full items-center justify-between gap-2 rounded-xl bg-muted py-1.5 pr-1.5 pl-2.5">
        <p className="truncate text-xs text-muted-foreground">
          {stat.caption ?? "From last month"}
        </p>
        <DeltaPill
          delta={stat.delta}
          direction={stat.deltaDirection}
          sentiment={sentimentFromDeltaColor(stat.deltaColor)}
        />
      </div>
    </section>
  );
}

export function StatCards({
  variant = "plain",
  stats,
  count,
  columns = 4,
  className,
}: {
  variant?: StatCardsVariant;
  /** KPI cards to render; defaults to demo metrics matching the variant. */
  stats?: Stat[];
  /** How many KPI cards to render (from the start of the list). */
  count?: number;
  /** Columns at the widest breakpoint - 2 keeps the grid two-up for
   *  narrower hosts (docs previews, split layouts), 1 pins a single
   *  column at every width. */
  columns?: 1 | 2 | 4;
  className?: string;
} = {}) {
  const items = stats ?? (variant === "footer" ? DEFAULT_FOOTER_STATS : DEFAULT_STATS);
  return (
    <div
      className={cn(
        statCardsGridVariants({ look: variant, columns: `${columns}` as "1" | "2" | "4" }),
        className,
      )}
    >
      {items.slice(0, count ?? items.length).map((stat) =>
        variant === "footer" ? (
          <FooterStatCard key={stat.label} stat={stat} />
        ) : (
          <PlainStatCard key={stat.label} stat={stat} />
        ),
      )}
    </div>
  );
}
