import { describe, expect, it } from "vitest";

import {
  buildAcceptanceSnapshot,
  hashAcceptanceSnapshot,
  type AcceptanceSnapshotInput,
} from "@/features/quotes/acceptance";
import type { QuoteAcceptanceSnapshot } from "@/lib/db/schema/quote-acceptances";

function input(
  overrides: Partial<AcceptanceSnapshotInput> = {},
): AcceptanceSnapshotInput {
  return {
    quoteNumber: "Q-1042",
    quoteVersion: 2,
    title: "Storefront refresh",
    businessName: "Foundry Labs",
    customerName: "Taylor Nguyen",
    customerEmail: "taylor@example.com",
    currency: "USD",
    notes: "Install included.",
    terms: "50% deposit due on acceptance.",
    validUntil: "2099-12-31",
    subtotalInCents: 20_000,
    discountInCents: 0,
    taxInCents: 2_000,
    taxLabel: "Tax",
    totalInCents: 22_000,
    items: [
      {
        description: "Window graphics",
        quantity: 1,
        unitPriceInCents: 20_000,
        lineTotalInCents: 20_000,
        position: 0,
      },
    ],
    scopeBlocks: [
      {
        kind: "deliverables",
        content: { items: [{ label: "Design and install" }] },
      },
    ],
    paymentSchedule: {
      version: 1,
      items: [
        {
          label: "Deposit",
          category: "deposit",
          amountCents: 11_000,
          dueDate: null,
          dueCondition: "On acceptance",
        },
        {
          label: "Balance",
          category: "balance",
          amountCents: 11_000,
          dueDate: null,
          dueCondition: "On install",
        },
      ],
    },
    ...overrides,
  };
}

describe("acceptance snapshot", () => {
  it("covers scope and the payment schedule in the stored hash", () => {
    const base = hashAcceptanceSnapshot(buildAcceptanceSnapshot(input()));

    const changedScope = hashAcceptanceSnapshot(
      buildAcceptanceSnapshot(
        input({
          scopeBlocks: [
            {
              kind: "deliverables",
              content: { items: [{ label: "Design only" }] },
            },
          ],
        }),
      ),
    );
    const changedSchedule = hashAcceptanceSnapshot(
      buildAcceptanceSnapshot(
        input({
          paymentSchedule: {
            version: 1,
            items: [
              {
                label: "Full payment",
                category: "balance",
                amountCents: 22_000,
                dueDate: null,
                dueCondition: "On acceptance",
              },
            ],
          },
        }),
      ),
    );
    const removedSchedule = hashAcceptanceSnapshot(
      buildAcceptanceSnapshot(input({ paymentSchedule: null })),
    );

    expect(changedScope).not.toBe(base);
    expect(changedSchedule).not.toBe(base);
    expect(removedSchedule).not.toBe(base);
  });

  it("stores customer-visible scope in display order and sorts line items", () => {
    const snapshot = buildAcceptanceSnapshot(
      input({
        items: [
          {
            description: "Install",
            quantity: 1,
            unitPriceInCents: 5_000,
            lineTotalInCents: 5_000,
            position: 1,
          },
          {
            description: "Design",
            quantity: 1,
            unitPriceInCents: 15_000,
            lineTotalInCents: 15_000,
            position: 0,
          },
        ],
        scopeBlocks: [
          {
            kind: "exclusions",
            content: { items: [{ label: "Permits" }] },
          },
          {
            kind: "deliverables",
            content: { items: [{ label: "Design and install" }] },
          },
        ],
      }),
    );

    expect(snapshot.items.map((item) => item.description)).toEqual([
      "Design",
      "Install",
    ]);
    expect(snapshot.scopeBlocks.map((block) => block.kind)).toEqual([
      "exclusions",
      "deliverables",
    ]);
    expect(snapshot.paymentSchedule?.items).toHaveLength(2);
  });

  it("hashes deterministically regardless of object key order", () => {
    const ordered = buildAcceptanceSnapshot(
      input({
        scopeBlocks: [
          {
            kind: "exclusions",
            content: { items: [{ label: "Permits" }] },
          },
        ],
      }),
    );
    // Same values, different insertion order at the top level and inside the
    // schedule/item objects. The canonical form sorts object keys.
    const reordered = {
      scopeBlocks: ordered.scopeBlocks,
      paymentSchedule: ordered.paymentSchedule
        ? {
            items: ordered.paymentSchedule.items.map((item) => ({
              dueCondition: item.dueCondition,
              dueDate: item.dueDate,
              amountCents: item.amountCents,
              category: item.category,
              label: item.label,
            })),
            version: ordered.paymentSchedule.version,
          }
        : null,
      items: ordered.items,
      totalInCents: ordered.totalInCents,
      quoteNumber: ordered.quoteNumber,
      quoteVersion: ordered.quoteVersion,
      title: ordered.title,
      businessName: ordered.businessName,
      customerName: ordered.customerName,
      customerEmail: ordered.customerEmail,
      currency: ordered.currency,
      notes: ordered.notes,
      terms: ordered.terms,
      validUntil: ordered.validUntil,
      subtotalInCents: ordered.subtotalInCents,
      discountInCents: ordered.discountInCents,
      taxInCents: ordered.taxInCents,
      taxLabel: ordered.taxLabel,
      acceptanceText: ordered.acceptanceText,
      acceptanceTextVersion: ordered.acceptanceTextVersion,
    } satisfies QuoteAcceptanceSnapshot;

    expect(hashAcceptanceSnapshot(reordered)).toBe(
      hashAcceptanceSnapshot(ordered),
    );
  });
});
