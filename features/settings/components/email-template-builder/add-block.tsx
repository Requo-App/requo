"use client";

import { useState } from "react";
import { Minus, MoveVertical, Plus, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MAX_EMAIL_TEMPLATE_BLOCKS } from "@/features/settings/email-templates";

type RepeatableType = "text" | "divider" | "spacer";

const INSERT_OPTIONS: Array<{ type: RepeatableType; label: string; icon: typeof Type }> = [
  { type: "text", label: "Text", icon: Type },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: MoveVertical },
];

type AddBlockProps = {
  index: number;
  blockCount: number;
  disabled?: boolean;
  variant?: "gap" | "end";
  onInsert: (type: RepeatableType, index: number) => void;
};

/**
 * Lightweight insertion UI. A subtle `── + ──` row between blocks (revealed
 * on hover/focus) plus an end-of-canvas button. Clicking `+` opens Text /
 * Divider / Spacer and inserts at that exact position.
 */
export function AddBlock({
  index,
  blockCount,
  disabled,
  variant = "gap",
  onInsert,
}: AddBlockProps) {
  const [open, setOpen] = useState(false);
  const remaining = MAX_EMAIL_TEMPLATE_BLOCKS - blockCount;
  const atLimit = remaining <= 0;
  const isDisabled = disabled || atLimit;

  if (variant === "end") {
    return (
      <div className="flex flex-col items-center gap-2 pt-1">
        {open && !isDisabled ? (
          <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={`Add block at position ${index + 1}`}>
            {INSERT_OPTIONS.map((option) => (
              <Button
                key={option.type}
                onClick={() => {
                  onInsert(option.type, index);
                  setOpen(false);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                <option.icon className="size-3.5" aria-hidden="true" />
                {option.label}
              </Button>
            ))}
          </div>
        ) : null}
        <Button
          aria-expanded={open}
          aria-label={open ? "Close add block menu" : "Add block"}
          disabled={isDisabled}
          onClick={() => setOpen((current) => !current)}
          size="sm"
          type="button"
          variant="outline"
          className="rounded-full"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {open ? "Close" : "Add"}
        </Button>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {atLimit
            ? `Block limit reached (${MAX_EMAIL_TEMPLATE_BLOCKS} blocks). Remove a block to add another.`
            : `${blockCount} of ${MAX_EMAIL_TEMPLATE_BLOCKS} blocks used.`}
        </p>
      </div>
    );
  }

  return (
    <div
      className="group relative flex min-h-[10px] items-center gap-2"
      data-testid={`add-block-${index}`}
    >
      <div className="h-px flex-1 bg-border/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" aria-hidden="true" />
      <Button
        aria-expanded={open}
        aria-label={`Add block at position ${index + 1}`}
        disabled={isDisabled}
        onClick={() => setOpen((current) => !current)}
        size="icon-xs"
        type="button"
        variant="outline"
        className="h-5 w-5 rounded-full opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
      >
        <Plus className="size-3" aria-hidden="true" />
      </Button>
      <div className="h-px flex-1 bg-border/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" aria-hidden="true" />
      {open && !isDisabled ? (
        <div
          className="absolute top-full left-1/2 z-20 flex -translate-x-1/2 gap-1.5 rounded-lg border border-border/70 bg-background p-1.5 shadow-lg"
          role="group"
          aria-label={`Add block at position ${index + 1}`}
        >
          {INSERT_OPTIONS.map((option) => (
            <Button
              key={option.type}
              onClick={() => {
                onInsert(option.type, index);
                setOpen(false);
              }}
              size="sm"
              type="button"
              variant="ghost"
              className="h-7 px-2 text-xs"
            >
              <option.icon className="size-3.5" aria-hidden="true" />
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
