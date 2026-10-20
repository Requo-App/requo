import { formatMoney, formatNumber } from "@/features/analytics/lib/format";
import type { AnalyticsAgingBucket } from "@/features/analytics/types";

import { BarList, type BarListItem } from "./bar-list";

/**
 * Aging buckets shift from the accent for the newest bucket to warning and
 * then danger as records age, so the list carries its own severity signal.
 * The colour never stands alone — the bucket label states the age.
 *
 * The colour follows the bucket's age, not its position among the buckets
 * that have something in them: a 90-day bucket stays danger-red even when
 * every younger bucket is empty.
 */
const AGE_LADDER = ["bg-primary", "bg-warning", "bg-destructive"];

function fillFor(index: number, total: number): string {
  if (total <= 1) return AGE_LADDER[0]!;
  const age = index / (total - 1);
  if (age < 0.34) return AGE_LADDER[0]!;
  if (age < 0.67) return AGE_LADDER[1]!;
  return AGE_LADDER[2]!;
}

/**
 * Aging list for quote backlogs and receivables: one bar per bucket, sized by
 * the bucket's value, with the count and balance as the row's meta.
 *
 * Buckets with nothing in them are dropped — four empty rows say less than
 * one line of copy, and the card's footer already states the totals.
 */
export function AgingList({
  buckets,
  currency,
  emptyLabel = "Nothing outstanding.",
  className,
}: {
  buckets: AnalyticsAgingBucket[];
  currency: string;
  emptyLabel?: string;
  className?: string;
}) {
  const filled = buckets
    .map((bucket, index) => ({ bucket, index }))
    .filter(
      ({ bucket }) => bucket.count > 0 || bucket.valueInCents > 0,
    );
  const total = filled.reduce(
    (sum, { bucket }) => sum + bucket.valueInCents,
    0,
  );

  if (filled.length === 0 || total === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const items: BarListItem[] = filled.map(({ bucket, index }) => ({
    key: bucket.label,
    label: bucket.label,
    value: formatMoney(bucket.valueInCents, currency),
    share: total > 0 ? bucket.valueInCents / total : 0,
    // The ladder spans every bucket, so the colour tracks the age.
    fillClassName: fillFor(index, buckets.length),
    meta: `${formatNumber(bucket.count)} ${
      bucket.count === 1 ? "record" : "records"
    }`,
  }));

  return <BarList items={items} className={className} />;
}
