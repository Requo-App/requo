import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getCustomerScheduleForQuote } from "@/features/payment-schedules/queries";
import { resolveRequiredScopeKinds } from "@/features/scope-blocks/required-kinds";
import { db } from "@/lib/db/client";
import {
  quoteScopeBlocks,
  type QuoteScopeBlock,
  type ScopeBlockKind,
} from "@/lib/db/schema";

export async function listScopeBlocksForQuote(input: {
  businessId: string;
  quoteId: string;
}): Promise<QuoteScopeBlock[]> {
  return db
    .select()
    .from(quoteScopeBlocks)
    .where(
      and(
        eq(quoteScopeBlocks.businessId, input.businessId),
        eq(quoteScopeBlocks.quoteId, input.quoteId),
      ),
    )
    .orderBy(asc(quoteScopeBlocks.position));
}

/**
 * Customer-visible scope: complete blocks only. Incomplete sections are
 * still being authored; waived sections were explicitly omitted.
 */
export async function listCustomerVisibleScopeBlocksForQuote(input: {
  businessId: string;
  quoteId: string;
}) {
  return db
    .select({
      kind: quoteScopeBlocks.kind,
      content: quoteScopeBlocks.content,
    })
    .from(quoteScopeBlocks)
    .where(
      and(
        eq(quoteScopeBlocks.businessId, input.businessId),
        eq(quoteScopeBlocks.quoteId, input.quoteId),
        eq(quoteScopeBlocks.state, "complete"),
      ),
    )
    .orderBy(asc(quoteScopeBlocks.position));
}

export type ScopeSendBlocker = {
  blockId: string;
  kind: ScopeBlockKind;
  reason: string;
};

export type ScopeSendGate = {
  ok: boolean;
  blocking: ScopeSendBlocker[];
};

/**
 * P3 send gate: incomplete required blocks hard-block sending with a
 * specific message — including required kinds with no block row at all (a
 * missing required section is incomplete). Optional and waived blocks never
 * block. Legacy/unpacked quotes without required kinds pass (NULL-tolerant).
 *
 * Requiredness is evaluated against the same recipe resolver as the owner
 * editor, not only the `required` flag stamped at write time. A row written
 * before a recipe became required — or by a legacy path that stamped
 * `required = false` — must still block sending.
 */
export async function evaluateScopeSendGate(input: {
  businessId: string;
  quoteId: string;
}): Promise<ScopeSendGate> {
  const [blocks, requiredKinds] = await Promise.all([
    listScopeBlocksForQuote(input),
    resolveRequiredScopeKinds({ businessId: input.businessId }),
  ]);
  const required = new Set(requiredKinds);
  const blocking: ScopeSendBlocker[] = [];

  for (const block of blocks) {
    if (!block.required && !required.has(block.kind)) continue;
    if (block.state !== "incomplete") continue;

    blocking.push({
      blockId: block.id,
      kind: block.kind,
      reason: `Required scope section "${block.kind}" is incomplete. Complete it or waive it with manager approval before sending.`,
    });
  }

  const presentKinds = new Set(blocks.map((block) => block.kind));

  // Required kinds declared by the active scope recipe but never added.
  for (const kind of requiredKinds) {
    if (presentKinds.has(kind)) continue;

    blocking.push({
      blockId: "",
      kind,
      reason: `Required scope section "${kind}" is missing. Add it or waive it with manager approval before sending.`,
    });
  }

  // A completed pointer to the payment schedule is only meaningful when a
  // schedule actually exists. A missing block is already reported above.
  if (required.has("payment_schedule")) {
    const paymentBlock = blocks.find((block) => block.kind === "payment_schedule");

    if (paymentBlock && paymentBlock.state === "complete") {
      const schedule = await getCustomerScheduleForQuote(input);

      if (!schedule) {
        blocking.push({
          blockId: paymentBlock.id,
          kind: "payment_schedule",
          reason:
            "Required payment schedule is missing. Attach a payment schedule or waive the section with manager approval before sending.",
        });
      }
    }
  }

  return { ok: blocking.length === 0, blocking };
}
