"use client";

import { ArrowRight, CheckCircle2, Pause, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  MarketingFeatureMock,
  MarketingMockFrame,
} from "@/components/marketing/marketing-feature-mocks";
import {
  MockBadge,
  MockButton,
} from "@/components/marketing/marketing-mock-primitives";
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
    <MarketingMockFrame
      action={<MockBadge label="Accepted" tone="success" />}
      compact
      flush
      title="Quote Q-1048"
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 p-4">
        <div className="flex items-center gap-3 rounded-lg bg-accent/60 px-3 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card text-success-ink">
            <CheckCircle2 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm leading-5 font-semibold tracking-tight text-foreground">
              Sarah accepted your quote
            </p>
            <p className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
              Kitchen remodel · Today
            </p>
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-3">
          <p className="text-[0.6875rem] leading-4 font-medium tracking-[0.12em] text-muted-foreground uppercase">
            Quote total
          </p>
          <p className="font-mono text-base leading-5 font-semibold tabular-nums tracking-tight text-foreground">
            $8,220
          </p>
        </div>

        <div className="flex justify-end">
          <MockButton icon={ArrowRight}>View quote</MockButton>
        </div>
      </div>
    </MarketingMockFrame>
  );
}

function StepPreview({ step }: { step: (typeof steps)[number] }) {
  if (step.preview === "accepted") {
    return <AcceptedPreview />;
  }

  return <MarketingFeatureMock compact featureId={step.preview} />;
}

/**
 * "How it works" tour: the four-step journey is a vertical tab list beside a
 * fixed-height product stage.
 *
 * The active rail fills in the marketing accent over the token duration in
 * `app/globals.css` (`--animate-workflow-progress`) and the browser's own
 * `animationend` hands the cycle to the next tab, so React state can never
 * disagree with what the rail shows. Unless explicitly paused, the listener
 * stays attached whenever motion is allowed so a fill that ends exactly as
 * the tour leaves view or the page hides still advances.
 *
 * - The cycle always runs while the tour is in view on a visible tab; hovering
 *   or focusing does not pause it, and picking a tab restarts the fill at that
 *   step. A Pause tour toggle gives touch and keyboard visitors a mechanism
 *   that does not depend on hover (WCAG 2.2.2).
 * - Reduced motion keeps the manual tour: no cycle, no crossfade, and the
 *   active rail settled full.
 * - The stage renders all four mocks in place and crossfades between them, so
 *   every step keeps the same height; the mocks themselves are decorative.
 * - Every description reserves the tallest copy's three-line height, so
 *   advancing the tour never changes the tab list height.
 */
export function WorkflowSteps() {
  const [active, setActive] = useState(0);
  const [railVersion, setRailVersion] = useState(0);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();
  const prefersReducedMotion = usePrefersReducedMotion();
  const pageVisible = usePageVisible();
  const motionAllowed = !prefersReducedMotion;
  const cycling = motionAllowed && inView && pageVisible && !paused;
  const progressState = !motionAllowed
    ? "static"
    : cycling
      ? "running"
      : "paused";
  /* `motion-reduce:animate-none` also covers the server render, before the
     media-query hook has hydrated. */
  const railAnimated = motionAllowed;

  const tabId = useCallback(
    (index: number) => `${baseId}-tab-${index}`,
    [baseId],
  );
  const panelId = `${baseId}-panel`;
  const descriptionId = useCallback(
    (index: number) => `${baseId}-description-${index}`,
    [baseId],
  );

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

  const advance = useCallback(() => {
    setActive((current) => (current + 1) % steps.length);
  }, []);

  function moveToStep(index: number) {
    setActive(index);
    setRailVersion((current) => current + 1);
    tabRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const lastIndex = steps.length - 1;
    const targetIndex = tabRefs.current.findIndex((tab) => tab === event.target);
    const currentIndex = targetIndex === -1 ? active : targetIndex;
    let nextIndex: number;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    moveToStep(nextIndex);
  }

  return (
    <div
      className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start lg:gap-x-5 lg:gap-y-0"
      data-workflow-root
      ref={rootRef}
    >
      <div className="order-2 flex flex-col items-start gap-4 lg:order-1 lg:col-span-1">
        <div
          aria-label="How it works"
          aria-orientation="vertical"
          className="marketing-step-list flex w-full flex-col gap-5 lg:gap-6"
          onKeyDown={handleKeyDown}
          role="tablist"
        >
          {steps.map((step, index) => {
            const isActive = index === active;
            const tabElementId = tabId(index);
            const labelElementId = `${tabElementId}-label`;
            const titleElementId = `${tabElementId}-title`;

            return (
              <button
                aria-controls={panelId}
                aria-describedby={isActive ? descriptionId(index) : undefined}
                aria-labelledby={`${labelElementId} ${titleElementId}`}
                aria-selected={isActive}
                className="marketing-step group relative flex w-full cursor-pointer flex-col items-start rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                id={tabElementId}
                key={step.label}
                onClick={() => moveToStep(index)}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="marketing-step-node"
                  data-active={isActive ? "true" : "false"}
                />
                <span
                  aria-hidden="true"
                  className="marketing-step-progress-track"
                >
                  {isActive ? (
                    <span
                      className={cn(
                        "marketing-step-progress marketing-accent-bg motion-reduce:animate-none",
                        railAnimated && "animate-workflow-progress",
                      )}
                      data-workflow-progress={progressState}
                      key={railVersion}
                      onAnimationEnd={railAnimated && !paused ? advance : undefined}
                      style={
                        railAnimated
                          ? {
                              animationPlayState: cycling ? "running" : "paused",
                            }
                          : undefined
                      }
                    />
                  ) : null}
                </span>

                <span
                  className={cn(
                    "text-marketing-label transition-colors duration-200",
                    isActive
                      ? "marketing-accent-text"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                  id={labelElementId}
                >
                  {step.label}
                </span>

                <span
                  className="mt-1 text-marketing-card-title text-foreground"
                  id={titleElementId}
                >
                  {step.title}
                </span>

                <span
                  className={cn(
                    "grid w-full transition-[grid-template-rows] duration-[250ms] ease-out motion-reduce:transition-none",
                    isActive ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <span className="min-h-0 overflow-hidden">
                    <span
                      aria-hidden={!isActive}
                      className="marketing-step-description block pt-2 text-marketing-body text-pretty text-muted-foreground"
                      data-workflow-description
                      id={descriptionId(index)}
                    >
                      {step.description}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {motionAllowed ? (
          <button
            className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => setPaused((current) => !current)}
            type="button"
          >
            {paused ? (
              <Play aria-hidden="true" className="size-3" />
            ) : (
              <Pause aria-hidden="true" className="size-3" />
            )}
            {paused ? "Play tour" : "Pause tour"}
          </button>
        ) : null}
      </div>

      <div
        aria-labelledby={tabId(active)}
        className="order-1 flex h-[22rem] items-center justify-center p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-[24rem] sm:p-8 lg:order-2 lg:col-span-2 lg:h-[26rem] lg:p-10"
        id={panelId}
        role="tabpanel"
        tabIndex={0}
      >
        <div className="relative h-full w-full lg:w-[94%]">
          {steps.map((step, index) => {
            const isActive = index === active;

            return (
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-0 flex items-center transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none",
                  isActive
                    ? "z-10 translate-y-0 opacity-100"
                    : "z-0 translate-y-1.5 opacity-0",
                )}
                data-workflow-preview={isActive ? "active" : "inactive"}
                key={step.label}
              >
                <StepPreview step={step} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
