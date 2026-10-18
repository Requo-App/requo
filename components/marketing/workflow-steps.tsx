"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  MarketingFeatureMock,
  MarketingMockFrame,
} from "@/components/marketing/marketing-feature-mocks";
import { Button } from "@/components/ui/button";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";
import { usePageVisible } from "@/hooks/use-page-visible";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/** Fraction of the stepper that must be visible before the cycle runs. */
const IN_VIEW_THRESHOLD = 0.25;

const steps = [
  {
    label: "Capture",
    title: "Request comes in",
    description:
      "Customer fills out your form, or you add it from a call. Everything is captured in seconds.",
    preview: "inquiries",
  },
  {
    label: "Quote",
    title: "Quote sent same day",
    description:
      "AI drafts line items from your pricing library. Review, adjust, and send in minutes.",
    preview: "quotes",
  },
  {
    label: "Follow up",
    title: "Nothing slips through",
    description: "Scheduled reminders keep the next step from being forgotten.",
    preview: "followUps",
  },
  {
    label: "Accepted",
    title: "Ready for what's next",
    description:
      "See accepted quotes instantly and keep the customer, scope, and pricing together for the next step.",
    preview: "accepted",
  },
] as const;

function AcceptedPreview() {
  return (
    <MarketingMockFrame title="Quote Q-1048">
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CheckCircle2 className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">
              Sarah accepted your quote
            </p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              Kitchen remodel · Today
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div data-padding="none" className="soft-panel px-4 py-3">
          <p className="meta-label">Quote total</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            $8,220
          </p>
        </div>
        <div
          data-padding="none"
          className="soft-panel flex flex-col justify-between px-4 py-3"
        >
          <p className="meta-label">Status</p>
          <div className="mt-2">
            <QuoteStatusBadge status="accepted" />
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" tabIndex={-1} type="button">
          View quote
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </MarketingMockFrame>
  );
}

function StepPreview({ step }: { step: (typeof steps)[number] }) {
  if (step.preview === "accepted") {
    return <AcceptedPreview />;
  }

  return <MarketingFeatureMock featureId={step.preview} />;
}

/**
 * "How it works" stepper: the four-step journey with the active step on stage
 * and every step's copy readable underneath.
 *
 * Each column owns a hairline bar. The active bar fills in primary over the
 * token duration in `app/globals.css` (`--animate-workflow-progress`) and the
 * browser's own `animationend` hands the cycle to the next step, so React
 * state can never disagree with what the bar shows. The listener stays
 * attached whenever motion is allowed — not only while cycling — so a fill
 * that ends exactly as the gate closes still advances instead of stranding a
 * full bar.
 *
 * - The cycle runs only while the stepper is in view on a visible tab.
 * - Selecting a column shows that step and starts its bar fresh; clicking the
 *   current step restarts its five seconds.
 * - Reduced motion keeps the manual stepper: no cycle, and the active bar
 *   settled full.
 * - Inactive columns keep their copy at full contrast — only the label and
 *   title tone soften — so the whole journey stays readable at every step.
 * - Titles stay short enough to hold one line in the four-column row.
 */
export function WorkflowSteps() {
  const [active, setActive] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const pageVisible = usePageVisible();
  const motionAllowed = !prefersReducedMotion;
  const cycling = motionAllowed && inView && pageVisible;
  const currentStep = steps[active];

  useEffect(() => {
    const root = rootRef.current;

    if (!root || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.intersectionRatio >= IN_VIEW_THRESHOLD);
        }
      },
      { threshold: [0, IN_VIEW_THRESHOLD] },
    );

    observer.observe(root);

    return () => observer.disconnect();
  }, []);

  const selectStep = useCallback((index: number) => {
    setActive(index);
    // A fresh key remounts the selected bar, so re-selecting the current step
    // restarts its five seconds instead of leaving it mid-fill.
    setRunKey((current) => current + 1);
  }, []);

  const advance = useCallback(() => {
    setActive((current) => (current + 1) % steps.length);
  }, []);

  return (
    <div className="flex flex-col gap-8 sm:gap-10" ref={rootRef}>
      <div className="flex items-center justify-center rounded-xl bg-muted px-4 py-8 sm:px-10 sm:py-12">
        <div
          className="w-full max-w-xl animate-[subtle-fade-up_var(--motion-duration-slow)_var(--motion-ease-standard)] overflow-hidden rounded-xl border border-border/60 bg-background"
          key={active}
        >
          <StepPreview step={currentStep} />
        </div>
      </div>

      <div className="grid gap-y-10 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-4">
        {steps.map((step, index) => {
          const isActive = index === active;
          const progressState = motionAllowed
            ? cycling
              ? "running"
              : "paused"
            : "static";

          return (
            <button
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "group flex cursor-pointer flex-col items-start gap-4 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                index > 0 && "lg:border-l lg:border-border/50 lg:pl-8",
              )}
              key={step.label}
              onClick={() => selectStep(index)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="relative block h-0.5 w-full overflow-hidden bg-border"
              >
                {isActive ? (
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 w-full origin-left bg-primary",
                      motionAllowed && "animate-workflow-progress",
                    )}
                    data-workflow-progress={progressState}
                    key={runKey}
                    onAnimationEnd={motionAllowed ? advance : undefined}
                    style={
                      motionAllowed
                        ? {
                            animationPlayState: cycling ? "running" : "paused",
                          }
                        : undefined
                    }
                  />
                ) : null}
              </span>

              <span className="flex flex-col gap-3">
                <span
                  className={cn(
                    "meta-label-plain transition-colors duration-300",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
                <span
                  className={cn(
                    "font-heading text-xl font-semibold tracking-tight transition-colors duration-300",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {step.title}
                </span>
                <span className="text-sm leading-snug text-muted-foreground sm:text-base sm:leading-6">
                  {step.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
