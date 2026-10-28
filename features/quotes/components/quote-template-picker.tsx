"use client";

import { useState } from "react";
import { FileText, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatQuoteMoney } from "@/features/quotes/utils";
import type { DashboardQuoteLibraryEntry } from "@/features/quotes/types";
import { cn } from "@/lib/utils";

type QuoteTemplatePickerProps = {
  templates: DashboardQuoteLibraryEntry[];
  currency: string;
  onSelect: (template: DashboardQuoteLibraryEntry) => void;
  onStartFromScratch: () => void;
};

export function QuoteTemplatePicker({
  templates,
  currency,
  onSelect,
  onStartFromScratch,
}: QuoteTemplatePickerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (templates.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium text-foreground">
            Start from a template
          </h3>
          <p className="text-xs text-muted-foreground">
            Pick a template to pre-fill your quote, or start from scratch.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onStartFromScratch}
        >
          <Plus data-icon="inline-start" />
          Start from scratch
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => {
          const isExpanded = expandedId === template.id;
          const hasCurrencyMismatch = template.currency !== currency;

          return (
            <div
              key={template.id}
              className={cn(
                "group surface-card relative flex flex-col gap-2 rounded-xl p-4 transition-colors",
                "hover:border-[var(--control-border-hover)]",
                hasCurrencyMismatch && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                    <FileText className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {template.name}
                    </p>
                    {template.title ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {template.title}
                      </p>
                    ) : null}
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {formatQuoteMoney(template.totalInCents, template.currency)}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {template.itemCount}{" "}
                  {template.itemCount === 1 ? "item" : "items"}
                </span>
                {template.validityDays ? (
                  <>
                    <span>·</span>
                    <span>{template.validityDays} day validity</span>
                  </>
                ) : null}
              </div>

              {/* Preview expand */}
              {isExpanded ? (
                <div className="mt-1 flex flex-col gap-1.5 border-t border-border/60 pt-2">
                  {template.items.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate text-muted-foreground">
                        {item.description}
                      </span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        {formatQuoteMoney(
                          item.quantity * item.unitPriceInCents,
                          template.currency,
                        )}
                      </span>
                    </div>
                  ))}
                  {template.items.length > 5 ? (
                    <p className="text-xs text-muted-foreground">
                      +{template.items.length - 5} more
                    </p>
                  ) : null}
                  {template.notes ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground italic">
                      Notes: {template.notes}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-auto flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  disabled={hasCurrencyMismatch}
                  onClick={() => onSelect(template)}
                >
                  Use template
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : template.id)
                  }
                >
                  {isExpanded ? "Less" : "Preview"}
                </Button>
              </div>

              {hasCurrencyMismatch ? (
                <p className="text-xs text-destructive-ink">
                  Saved in {template.currency} — doesn&apos;t match {currency}.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
