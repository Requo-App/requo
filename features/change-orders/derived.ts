import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  changeOrderLines,
  changeOrders,
  paymentScheduleItems,
  paymentSchedules,
  quoteItems,
  quoteScopeBlocks,
  quotes,
} from "@/lib/db/schema";

export type DerivedLine = {
  id: string;
  description: string;
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
  position: number;
  source: "accepted" | "change_order";
  changeOrderId?: string;
};

export type DerivedBlock = {
  id: string;
  kind: string;
  content: Record<string, unknown>;
  required: boolean;
  state: string;
  source: "accepted" | "change_order";
  changeOrderId?: string;
};

export type DerivedSchedule = {
  scheduleId: string;
  version: number;
  state: string;
  items: Array<{
    id: string;
    position: number;
    category: string;
    label: string;
    computedAmountCents: number;
    dueDate: string | null;
    dueCondition: string | null;
  }>;
} | null;

export type DerivedCommercialState = {
  quoteId: string;
  quoteVersion: number;
  lines: DerivedLine[];
  blocks: DerivedBlock[];
  schedule: DerivedSchedule;
  /** Recomputed from line math — delta fields are display only. */
  totalInCents: number;
  appliedChangeOrders: string[];
};

function recomputeLineTotal(quantity: number, unitPriceInCents: number) {
  return Math.max(0, quantity) * Math.max(0, unitPriceInCents);
}

/**
 * Derived current commercial state (P2): accepted items/blocks adjusted by
 * approved deltas in (CO number, position) order; value recomputed from
 * line math; schedule = latest approved version. Zero approved changes
 * yields the accepted snapshot byte-identical.
 */
export async function getDerivedCommercialState(input: {
  businessId: string;
  quoteId: string;
}): Promise<DerivedCommercialState | null> {
  const [quote] = await db
    .select({ id: quotes.id, version: quotes.version, status: quotes.status })
    .from(quotes)
    .where(and(eq(quotes.id, input.quoteId), eq(quotes.businessId, input.businessId)))
    .limit(1);

  if (!quote) return null;

  const [acceptedLines, acceptedBlocks, approvedCOs] = await Promise.all([
    db
      .select()
      .from(quoteItems)
      .where(and(eq(quoteItems.quoteId, quote.id), eq(quoteItems.businessId, input.businessId)))
      .orderBy(asc(quoteItems.position)),
    db
      .select()
      .from(quoteScopeBlocks)
      .where(
        and(
          eq(quoteScopeBlocks.quoteId, quote.id),
          eq(quoteScopeBlocks.businessId, input.businessId),
        ),
      )
      .orderBy(asc(quoteScopeBlocks.position)),
    db
      .select()
      .from(changeOrders)
      .where(
        and(
          eq(changeOrders.quoteId, quote.id),
          eq(changeOrders.businessId, input.businessId),
          eq(changeOrders.state, "approved"),
        ),
      )
      .orderBy(asc(changeOrders.coNumber)),
  ]);

  const lines = new Map<string, DerivedLine>();
  for (const line of acceptedLines) {
    lines.set(line.id, {
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPriceInCents: line.unitPriceInCents,
      lineTotalInCents: line.lineTotalInCents,
      position: line.position,
      source: "accepted",
    });
  }

  const blocks = new Map<string, DerivedBlock>();
  for (const block of acceptedBlocks) {
    blocks.set(block.id, {
      id: block.id,
      kind: block.kind,
      content: block.content,
      required: block.required,
      state: block.state,
      source: "accepted",
    });
  }

  const appliedChangeOrders: string[] = [];

  for (const co of approvedCOs) {
    appliedChangeOrders.push(co.id);
    const deltas = await db
      .select()
      .from(changeOrderLines)
      .where(eq(changeOrderLines.changeOrderId, co.id))
      .orderBy(asc(changeOrderLines.position));

    for (const delta of deltas) {
      if (delta.targetKind === "line") {
        applyLineDelta(lines, delta, co.id);
      } else if (delta.targetKind === "block") {
        applyBlockDelta(blocks, delta, co.id);
      }
      // Schedule deltas resolve through schedule versions (latest approved),
      // never by mutating v1 rows — see getLatestApprovedSchedule below.
    }
  }

  const orderedLines = [...lines.values()].sort((a, b) => a.position - b.position);
  const totalInCents = orderedLines.reduce((sum, line) => sum + line.lineTotalInCents, 0);
  const schedule = await getLatestApprovedSchedule(input.businessId, quote.id);

  return {
    quoteId: quote.id,
    quoteVersion: quote.version,
    lines: orderedLines,
    blocks: [...blocks.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    schedule,
    totalInCents,
    appliedChangeOrders,
  };
}

function applyLineDelta(
  lines: Map<string, DerivedLine>,
  delta: typeof changeOrderLines.$inferSelect,
  coId: string,
) {
  const after = (delta.afterSnapshot ?? {}) as Record<string, unknown>;

  if (delta.change === "add") {
    const payload = (delta.payload ?? after) as Record<string, unknown>;
    const id = String(payload["id"] ?? delta.id);
    const quantity = Number(payload["quantity"] ?? 1);
    const unitPriceInCents = Number(payload["unitPriceInCents"] ?? 0);

    lines.set(id, {
      id,
      description: String(payload["description"] ?? "Added line"),
      quantity,
      unitPriceInCents,
      lineTotalInCents: recomputeLineTotal(quantity, unitPriceInCents),
      position: Number(payload["position"] ?? 0),
      source: "change_order",
      changeOrderId: coId,
    });
    return;
  }

  const targetId = delta.targetQuoteItemId;
  if (!targetId) return;
  const current = lines.get(targetId);
  if (!current) return;

  if (delta.change === "remove") {
    lines.delete(targetId);
    return;
  }

  const quantity = after["quantity"] !== undefined ? Number(after["quantity"]) : current.quantity;
  const unitPriceInCents =
    after["unitPriceInCents"] !== undefined ? Number(after["unitPriceInCents"]) : current.unitPriceInCents;

  lines.set(targetId, {
    ...current,
    description: after["description"] !== undefined ? String(after["description"]) : current.description,
    quantity,
    unitPriceInCents,
    lineTotalInCents: recomputeLineTotal(quantity, unitPriceInCents),
    source: "change_order",
    changeOrderId: coId,
  });
}

function applyBlockDelta(
  blocks: Map<string, DerivedBlock>,
  delta: typeof changeOrderLines.$inferSelect,
  coId: string,
) {
  const after = (delta.afterSnapshot ?? {}) as Record<string, unknown>;

  if (delta.change === "add") {
    const payload = (delta.payload ?? after) as Record<string, unknown>;
    const id = String(payload["id"] ?? delta.id);

    blocks.set(id, {
      id,
      kind: String(payload["kind"] ?? "deliverables"),
      content: (payload["content"] as Record<string, unknown>) ?? {},
      required: Boolean(payload["required"] ?? false),
      state: "complete",
      source: "change_order",
      changeOrderId: coId,
    });
    return;
  }

  const targetId = delta.targetBlockId;
  if (!targetId) return;
  const current = blocks.get(targetId);
  if (!current) return;

  if (delta.change === "remove") {
    blocks.delete(targetId);
    return;
  }

  blocks.set(targetId, {
    ...current,
    content: (after["content"] as Record<string, unknown>) ?? current.content,
    source: "change_order",
    changeOrderId: coId,
  });
}

async function getLatestApprovedSchedule(
  businessId: string,
  quoteId: string,
): Promise<DerivedSchedule> {
  const schedules = await db
    .select()
    .from(paymentSchedules)
    .where(
      and(
        eq(paymentSchedules.businessId, businessId),
        eq(paymentSchedules.quoteId, quoteId),
      ),
    )
    .orderBy(asc(paymentSchedules.version));

  const approved = schedules.filter((row) => row.state === "accepted");
  const latest = approved[approved.length - 1] ?? null;

  if (!latest) return null;

  const items = await db
    .select()
    .from(paymentScheduleItems)
    .where(eq(paymentScheduleItems.scheduleId, latest.id))
    .orderBy(asc(paymentScheduleItems.position));

  return {
    scheduleId: latest.id,
    version: latest.version,
    state: latest.state,
    items: items.map((item) => ({
      id: item.id,
      position: item.position,
      category: item.category,
      label: item.label,
      computedAmountCents: item.computedAmountCents,
      dueDate: item.dueDate,
      dueCondition: item.dueCondition,
    })),
  };
}
