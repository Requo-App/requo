/**
 * The pure math behind the analytics KPI strip.
 *
 * Kept apart from the server sections so the numbers can be checked without
 * a database, and so a formula has one home instead of living inline in a
 * component.
 */

/**
 * Average value of the quotes won in a period, in cents.
 *
 * The value and the count must describe the same quotes — the ones accepted
 * inside the period. Mixing a value counted by acceptance date with a count
 * counted by send date produces an average that belongs to no set at all.
 */
export function averageWonInCents(
  revenueInCents: number,
  quotesWon: number,
): number {
  if (quotesWon <= 0) return 0;
  return Math.round(revenueInCents / quotesWon);
}
