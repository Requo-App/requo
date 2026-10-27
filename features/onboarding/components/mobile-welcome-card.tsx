"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  FileText,
  Inbox,
  Package,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type MobileWelcomeCardProps = {
  businessId: string;
  completed: boolean;
  onComplete: () => Promise<void>;
};

const MOBILE_TOUR_STORAGE_PREFIX = "requo:tour:mobile:";

const features = [
  {
    icon: Inbox,
    title: "Inquiries",
    description: "Capture and qualify leads",
  },
  {
    icon: FileText,
    title: "Quotes",
    description: "Send professional quotes",
  },
  {
    icon: BellRing,
    title: "Follow-ups",
    description: "Never miss a reply",
  },
  {
    icon: Sparkles,
    title: "AI drafting",
    description: "Draft quotes in seconds",
  },
  {
    icon: Package,
    title: "Quote library",
    description: "Reuse your price book",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Track what converts",
  },
];

export function MobileWelcomeCard({
  businessId,
  completed,
  onComplete,
}: MobileWelcomeCardProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (completed) return;

    // Only show on mobile viewports
    const mq = window.matchMedia("(max-width: 767px)");
    if (!mq.matches) return;

    const storageKey = `${MOBILE_TOUR_STORAGE_PREFIX}${businessId}`;
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch {
      // localStorage unavailable — show anyway
    }

    const timer = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(timer);
  }, [businessId, completed]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    const storageKey = `${MOBILE_TOUR_STORAGE_PREFIX}${businessId}`;
    try {
      localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      // localStorage unavailable
    }
    onComplete().catch(() => {
      // Silently fail
    });
  }, [businessId, onComplete]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 md:hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-2xl border border-border/80 bg-popover p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-semibold text-foreground">
              Welcome to Requo
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Here&apos;s what you can do from your dashboard.
            </p>
          </div>
          <button
            aria-label="Dismiss"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={handleDismiss}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5"
            >
              <feature.icon className="size-4 shrink-0 text-primary-ink" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {feature.title}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <Button
          className="mt-4 w-full"
          onClick={handleDismiss}
          size="sm"
          type="button"
        >
          Got it
          <ArrowRight className="ml-1 size-3.5" />
        </Button>
      </div>
    </div>
  );
}
