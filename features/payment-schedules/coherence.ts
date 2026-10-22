import type { PaymentScheduleItemCategory } from "@/lib/db/schema/payment-schedules";
import { paymentScheduleItemCategories } from "@/lib/db/schema/payment-schedules";

export type ScheduleItemInput = {
  category: string;
  label: string;
  amountCents?: number | null;
  percentBps?: number | null;
  dueDate?: string | null;
  dueCondition?: string | null;
};

export type CoherentScheduleItem = {
  category: PaymentScheduleItemCategory;
  label: string;
  amountCents: number | null;
  percentBps: number | null;
  computedAmountCents: number;
  dueDate: string | null;
  dueCondition: string | null;
};

export type ScheduleCoherence = {
  ok: boolean;
  errors: string[];
  items: CoherentScheduleItem[];
  totalCents: number;
};

function isCategory(value: string): value is PaymentScheduleItemCategory {
  return (paymentScheduleItemCategories as readonly string[]).includes(value);
}

/**
 * P5 coherence (single semantic model): percentages are always percentages
 * of the quote total. All-fixed Σ == quote total; all-percentage Σ ==
 * 10000bps; mixed: fixed-Σ + Σ(percentBpsᵢ × quoteTotal / 10000, floored per
 * item in position order, remainder to the last percentage item) ==
 * quote total. Integer basis points throughout, never floats.
 */
export function computeScheduleCoherence(
  items: ScheduleItemInput[],
  quoteTotalCents: number,
): ScheduleCoherence {
  const errors: string[] = [];

  if (items.length === 0) {
    return { ok: false, errors: ["A schedule needs at least one item."], items: [], totalCents: 0 };
  }

  if (items.length > 50) {
    return { ok: false, errors: ["A schedule holds at most 50 items."], items: [], totalCents: 0 };
  }

  const normalized: CoherentScheduleItem[] = [];

  items.forEach((item, position) => {
    if (!isCategory(item.category)) {
      errors.push(`Item ${position + 1}: unknown category.`);
      return;
    }

    const label = item.label?.trim().slice(0, 200);

    if (!label) {
      errors.push(`Item ${position + 1}: a label is required.`);
      return;
    }

    const hasAmount = item.amountCents !== null && item.amountCents !== undefined;
    const hasPercent = item.percentBps !== null && item.percentBps !== undefined;

    if (hasAmount === hasPercent) {
      errors.push(`Item ${position + 1}: set exactly one of fixed amount or percentage.`);
      return;
    }

    if (hasAmount && !(Number.isInteger(item.amountCents) && (item.amountCents as number) >= 0)) {
      errors.push(`Item ${position + 1}: fixed amount must be a non-negative integer.`);
      return;
    }

    if (hasPercent && !(Number.isInteger(item.percentBps) && (item.percentBps as number) >= 0 && (item.percentBps as number) <= 10000)) {
      errors.push(`Item ${position + 1}: percentage must be 0–10000 basis points.`);
      return;
    }

    if (!item.dueCondition?.trim() && !item.dueDate?.trim()) {
      errors.push(`Item ${position + 1}: a due date or due condition is required.`);
      return;
    }

    normalized.push({
      category: item.category,
      label,
      amountCents: hasAmount ? (item.amountCents as number) : null,
      percentBps: hasPercent ? (item.percentBps as number) : null,
      computedAmountCents: 0,
      dueDate: item.dueDate?.trim() || null,
      dueCondition: item.dueCondition?.trim().slice(0, 200) || null,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors, items: [], totalCents: 0 };
  }

  const fixedSum = normalized
    .filter((item) => item.amountCents !== null)
    .reduce((sum, item) => sum + (item.amountCents as number), 0);

  const percentItems = normalized.filter((item) => item.percentBps !== null);

  if (percentItems.length === 0) {
    if (fixedSum !== quoteTotalCents) {
      return {
        ok: false,
        errors: [`Fixed amounts sum to ${fixedSum} but the quote total is ${quoteTotalCents}.`],
        items: [],
        totalCents: 0,
      };
    }

    for (const item of normalized) {
      item.computedAmountCents = item.amountCents as number;
    }

    return { ok: true, errors: [], items: normalized, totalCents: fixedSum };
  }

  // Floor per item in position order; remainder lands on the last
  // percentage item so the customer-visible cents always sum exactly.
  let flooredSum = fixedSum;

  percentItems.forEach((item, index) => {
    const exact = ((item.percentBps as number) * quoteTotalCents) / 10000;

    if (index < percentItems.length - 1) {
      item.computedAmountCents = Math.floor(exact);
      flooredSum += item.computedAmountCents;
    } else {
      item.computedAmountCents = quoteTotalCents - flooredSum;
    }
  });

  for (const item of normalized) {
    if (item.amountCents !== null) {
      item.computedAmountCents = item.amountCents;
    }

    if (item.computedAmountCents < 0) {
      return {
        ok: false,
        errors: ["Percentages exceed the quote total after fixed amounts."],
        items: [],
        totalCents: 0,
      };
    }
  }

  const percentSum = percentItems.reduce((sum, item) => sum + (item.percentBps as number), 0);

  if (fixedSum === 0 && percentSum !== 10000) {
    return {
      ok: false,
      errors: [`Percentages sum to ${percentSum}bps; all-percentage schedules must total 10000bps.`],
      items: [],
      totalCents: 0,
    };
  }

  if (fixedSum > 0 && fixedSum + percentItems.reduce((sum, item) => sum + item.computedAmountCents, 0) !== quoteTotalCents) {
    return {
      ok: false,
      errors: ["Fixed amounts plus percentages do not equal the quote total."],
      items: [],
      totalCents: 0,
    };
  }

  return { ok: true, errors: [], items: normalized, totalCents: quoteTotalCents };
}
