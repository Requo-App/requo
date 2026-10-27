"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";

import { cn } from "@/lib/utils";

type FirstVisitTipProps = {
  /** Unique key for this tip — used for localStorage persistence. */
  tipKey: string;
  /** Main tip text. */
  title: string;
  /** Supporting description. */
  description: string;
  /** Optional className for positioning. */
  className?: string;
};

const TIP_PREFIX = "requo:tip:";

/**
 * A lightweight contextual tip shown on first visit to a feature page.
 * Dismisses permanently via localStorage.
 */
export function FirstVisitTip({
  tipKey,
  title,
  description,
  className,
}: FirstVisitTipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const key = `${TIP_PREFIX}${tipKey}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      // localStorage unavailable — show tip
    }

    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, [tipKey]);

  function handleDismiss() {
    setVisible(false);
    const key = `${TIP_PREFIX}${tipKey}`;
    try {
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      // localStorage unavailable
    }
  }

  if (!visible) return null;

  return (
    <div
      className={cn(
        "animate-in fade-in-0 slide-in-from-top-2 duration-300",
        "rounded-lg border border-primary/15 bg-primary/[0.03] px-4 py-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary-ink" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <button
          aria-label="Dismiss tip"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={handleDismiss}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
