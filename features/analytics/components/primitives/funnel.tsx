import { formatNumber, formatPercent } from "@/features/analytics/lib/format";
import type { AnalyticsFunnelStep } from "@/features/analytics/types";

import { BarList, type BarListItem } from "./bar-list";

/**
 * Funnel stages fade through a single hue, from the accent at full strength
 * down to ~40% at the last stage, so the sequence reads as one progression
 * instead of a categorical palette. Bar widths are proportional to the first
 * stage; the step conversion is the muted meta under each label.
 */
const FILL_LADDER = [
  "bg-primary",
  "bg-primary/85",
  "bg-primary/70",
  "bg-primary/55",
  "bg-primary/40",
];

function fillFor(index: number, total: number): string {
  if (total <= 1) return FILL_LADDER[0]!;
  const step = (index * (FILL_LADDER.length - 1)) / (total - 1);
  return FILL_LADDER[Math.round(step)]!;
}

/**
 * The funnel: a `BarList` in one hue. Stage widths are proportional to the
 * first stage, and every stage after it carries its step conversion.
 */
export function Funnel({
  steps,
  emptyLabel = "No funnel activity in this period yet.",
  ariaLabel,
  className,
}: {
  steps: AnalyticsFunnelStep[];
  emptyLabel?: string;
  ariaLabel?: string;
  className?: string;
}) {
  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const first = steps[0]?.count ?? 0;
  const total = steps.reduce((sum, step) => sum + step.count, 0);
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const items: BarListItem[] = steps.map((step, index) => {
    const prior = index > 0 ? steps[index - 1]!.count : null;
    const stepShare = prior !== null && prior > 0 ? step.count / prior : null;

    return {
      key: step.key,
      label: step.label,
      value: formatNumber(step.count),
      share: first > 0 ? step.count / first : 0,
      href: step.href,
      fillClassName: fillFor(index, steps.length),
      meta:
        stepShare !== null
          ? `${formatPercent(stepShare)} of ${steps[index - 1]!.label.toLowerCase()}`
          : `${formatPercent(first > 0 ? step.count / first : 0)} of ${steps[0]!.label.toLowerCase()}`,
    };
  });

  return (
    <div className={className} role="group" aria-label={ariaLabel}>
      <BarList items={items} />
    </div>
  );
}
