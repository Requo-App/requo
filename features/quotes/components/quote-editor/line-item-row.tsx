"use client";

import { useState } from "react";
import { GripVertical, Trash2, Bookmark } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import type { AiQuoteLineItemReview } from "@/features/quotes/types";
import { cn } from "@/lib/utils";
import {
  canSaveLineItemToPricingLibrary,
  getLineItemReviewBadgeLabel,
  shouldShowLineItemReviewBadge,
} from "./line-item-review";
import type { EditorLineItem } from "./types";

const REVIEW_BADGE_TONES = {
  matched: "success",
  calculated: "info",
} as const satisfies Record<"matched" | "calculated", StatusTone>;

export function AiReviewBadge({ review }: { review: AiQuoteLineItemReview }) {
  const label = getLineItemReviewBadgeLabel(review);

  if (!label) {
    return null;
  }

  const tone = review.reviewStatus === "calculated" ? "calculated" : "matched";

  const badge = <StatusBadge tone={REVIEW_BADGE_TONES[tone]} label={label} />;

  if (!review.reason) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{review.reason}</TooltipContent>
    </Tooltip>
  );
}

export function LineItemCard({
  item,
  index,
  currency,
  unitPriceInCents,
  safeQuantity,
  isPending,
  canRemove,
  onUpdate,
  onRemove,
  onSaveToPricing,
  canSaveToPricing,
  formatMoney,
}: {
  item: EditorLineItem;
  index: number;
  currency: string;
  unitPriceInCents: number;
  safeQuantity: number;
  isPending: boolean;
  canRemove: boolean;
  canSaveToPricing: boolean;
  onUpdate: (id: string, patch: Partial<EditorLineItem>) => void;
  onRemove: (id: string) => void;
  onSaveToPricing?: (id: string) => Promise<void>;
  formatMoney: (cents: number, currency: string) => string;
}) {
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [isSavingToPricing, setIsSavingToPricing] = useState(false);
  const showSaveToPricing =
    canSaveToPricing &&
    Boolean(onSaveToPricing) &&
    canSaveLineItemToPricingLibrary({ item, unitPriceInCents });

  async function handleConfirmSaveToPricing() {
    if (!onSaveToPricing) {
      return;
    }

    setIsSavingToPricing(true);

    try {
      await onSaveToPricing(item.id);
      setConfirmSaveOpen(false);
    } finally {
      setIsSavingToPricing(false);
    }
  }
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.95 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/line-item rounded-lg border border-border/60 bg-background px-3 py-2.5 transition-[border-color,box-shadow,background-color] duration-150 hover:border-border",
        isDragging && "border-primary/40 shadow-[var(--overlay-surface-shadow)]",
        item.isAiGenerated && "ai-glow-border",
      )}
    >
      {/* Single-row compact layout */}
      <div className="flex items-center gap-2">
        <button
          aria-label={`Reorder item ${index + 1}`}
          className="shrink-0 cursor-grab touch-none text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>

        <Input
          id={`quote-item-description-${item.id}`}
          aria-label={`Item ${index + 1} description`}
          className="min-w-0 flex-1"
          maxLength={400}
          value={item.description}
          onChange={(event) =>
            onUpdate(item.id, {
              description: event.currentTarget.value,
            })
          }
          placeholder="What are you quoting for?"
          required
          disabled={isPending}
        />

        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            id={`quote-item-quantity-${item.id}`}
            aria-label={`Item ${index + 1} quantity`}
            className="w-14 text-center"
            inputMode="numeric"
            max="999999999"
            type="number"
            min="1"
            required
            step="1"
            value={item.quantity}
            onChange={(event) =>
              onUpdate(item.id, {
                quantity: event.currentTarget.value,
              })
            }
            disabled={isPending}
          />

          <span className="text-xs text-muted-foreground/50">×</span>

          <Input
            id={`quote-item-price-${item.id}`}
            aria-label={`Item ${index + 1} unit price`}
            className="w-24"
            inputMode="decimal"
            type="number"
            max="1000000"
            min="0"
            required
            step="0.01"
            value={item.unitPrice}
            onChange={(event) =>
              onUpdate(item.id, {
                unitPrice: event.currentTarget.value,
              })
            }
            placeholder="0.00"
            disabled={isPending}
          />

          <span className="hidden w-20 text-right text-sm font-medium tabular-nums text-foreground sm:inline-block">
            {formatMoney(safeQuantity * unitPriceInCents, currency)}
          </span>

          {showSaveToPricing ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setConfirmSaveOpen(true)}
                  disabled={isPending || isSavingToPricing}
                >
                  <Bookmark className="size-3.5" />
                  <span className="sr-only">Save to pricing library</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save to pricing library</TooltipContent>
            </Tooltip>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onRemove(item.id)}
            disabled={isPending || !canRemove}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">Remove item {index + 1}</span>
          </Button>
        </div>
      </div>

      {/* AI review badge + reason (only when present) */}
      {(() => {
        const hasBadge = shouldShowLineItemReviewBadge(item.aiReview);
        const reason = item.aiReview?.reason;
        if (!hasBadge && !reason) return null;
        return (
          <div className="mt-1.5 flex items-center gap-2 pl-6">
            {hasBadge && item.aiReview ? (
              <AiReviewBadge review={item.aiReview} />
            ) : null}
            {reason ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {reason}
              </p>
            ) : null}
          </div>
        );
      })()}

      <ConfirmationDialog
        open={confirmSaveOpen}
        onOpenChange={setConfirmSaveOpen}
        title="Save to pricing library?"
        description={
          <>
            This adds a reusable pricing block for &ldquo;
            {item.description.trim().slice(0, 80)}
            {item.description.trim().length > 80 ? "…" : ""}
            &rdquo; at {formatMoney(unitPriceInCents, currency)} per unit. You
            can reuse it on future quotes.
          </>
        }
        confirmLabel="Save to pricing"
        onConfirm={() => void handleConfirmSaveToPricing()}
        isPending={isSavingToPricing}
        tone="neutral"
        icon={Bookmark}
      />
    </div>
  );
}
