"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

type DismissibleQuoteAlertProps = {
  id: string;
  title: string;
  description: string;
};

export function DismissibleQuoteAlert({
  id,
  title,
  description,
}: DismissibleQuoteAlertProps) {
  const [dismissed, setDismissed] = useState(false);
  const hydrated = useHydrated();
  const storageKey = `requo_dismissed_alert_${id}`;

  useEffect(() => {
    setDismissed(localStorage.getItem(storageKey) === "true");
  }, [storageKey]);

  // The alert is rendered on the server so the page does not shift when the
  // client resolves the dismissal state. A previously dismissed alert hides
  // itself once the client has hydrated.
  if (hydrated && dismissed) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(storageKey, "true");
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className={cn(
        "alert-surface relative flex items-start gap-3 rounded-xl border border-primary/12 px-4 py-3.5 text-sm text-foreground",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm font-semibold leading-6">
          {title}
        </p>
        <p className="leading-6 text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss alert"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
