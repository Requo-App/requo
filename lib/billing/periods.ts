/**
 * Calendar-based billing period math.
 *
 * Prepaid (QR Ph) terms must advance by whole calendar months, not fixed
 * millisecond counts: a monthly term bought on 31 January should end on the
 * last day of February, and a yearly term bought on 29 February should end on
 * 28 February the next year. Both helpers clamp the day to the target month.
 */

import type { BillingInterval } from "@/lib/billing/types";

const MONTHS_PER_INTERVAL: Record<BillingInterval, number> = {
  monthly: 1,
  yearly: 12,
};

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Adds one monthly or yearly term to `start`, clamping the day of month.
 * The time of day is preserved.
 */
export function addBillingInterval(
  start: Date,
  interval: BillingInterval,
): Date {
  const months = MONTHS_PER_INTERVAL[interval];
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const targetMonthStart = new Date(
    Date.UTC(year, month + months, 1, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()),
  );
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const clampedDay = Math.min(day, daysInUtcMonth(targetYear, targetMonth));

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      clampedDay,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

/**
 * The start of a purchased term: extend an active same-plan prepaid term from
 * its current end, otherwise start now.
 */
export function getPrepaidTermStart(
  currentPeriodEnd: Date | null | undefined,
  now: Date,
): Date {
  return currentPeriodEnd && currentPeriodEnd > now
    ? currentPeriodEnd
    : now;
}
