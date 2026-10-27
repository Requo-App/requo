"use client";

import { AlertTriangle } from "lucide-react";

import type { QuoteEditorLineItemValue } from "@/features/quotes/types";

type AiPricingReviewPanelProps = {
  itemCount: number;
  items: QuoteEditorLineItemValue[];
};

export function AiPricingReviewPanel({
  itemCount,
  items,
}: AiPricingReviewPanelProps) {
  return (
    <div
      aria-live="polite"
      className="alert-surface relative flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3.5 text-sm text-foreground"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-warning-ink"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {itemCount === 1
              ? "1 line item needs your pricing review"
              : `${itemCount} line items need your pricing review`}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            The assistant didn&apos;t find approved pricing for these. Set a
            price from your saved pricing or update it inline before sending
            this quote.
          </p>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          if (!item.aiReview) return null;

          const label =
            item.aiReview.name?.trim() ||
            item.description?.trim() ||
            "Untitled item";

          return (
            <li
              className="rounded-lg border border-warning/20 bg-background/70 px-3 py-2.5"
              key={item.id}
            >
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {item.aiReview.reason ||
                  (item.aiReview.reviewStatus === "no_pricing_found"
                    ? "No approved pricing source found."
                    : "Confirm pricing before sending.")}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
