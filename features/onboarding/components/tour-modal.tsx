"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  FileText,
  Home,
  Inbox,
  Package,
  PencilRuler,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type TourModalStep = {
  title: string;
  description: string;
  preview: React.ReactNode;
};

type TourModalProps = {
  show: boolean;
  steps: TourModalStep[];
  onComplete: () => Promise<void>;
  /** localStorage key for client-side dismissal. */
  storageKey?: string;
  /** When true, never auto-open (server says tour already completed). */
  completed?: boolean;
  /** Bump to force-open for dev preview (ignores localStorage once). */
  replayToken?: number;
};

/* -------------------------------------------------------------------------- */
/*  Tour Modal                                                                */
/* -------------------------------------------------------------------------- */

export function TourModal({
  show,
  steps,
  onComplete,
  storageKey,
  completed = false,
  replayToken = 0,
}: TourModalProps) {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!show || completed) {
      return;
    }

    // Skip on mobile viewports
    const mq = window.matchMedia("(min-width: 768px)");
    if (!mq.matches) {
      return;
    }

    const isReplay = replayToken > 0;

    if (!isReplay && storageKey) {
      try {
        if (localStorage.getItem(storageKey)) {
          return;
        }
      } catch {
        // localStorage unavailable — show tour anyway
      }
    }

    const timer = window.setTimeout(() => {
      setCurrentStep(0);
      setOpen(true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [show, completed, storageKey, replayToken]);

  const completeTour = useCallback(() => {
    setOpen(false);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, new Date().toISOString());
      } catch {
        // localStorage unavailable
      }
    }
    startTransition(async () => {
      try {
        await onComplete();
      } catch {
        // Silently fail — tour still dismissed locally
      }
    });
  }, [onComplete, storageKey]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      completeTour();
    }
  }, [currentStep, completeTour, steps.length]);

  const step = steps[currentStep];
  if (!step) return null;

  const isLast = currentStep === steps.length - 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) completeTour();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="meta-label">
                Step {currentStep + 1} of {steps.length}
              </p>
              <DialogTitle>{step.title}</DialogTitle>
            </div>
          </div>
          <DialogDescription>{step.description}</DialogDescription>
        </DialogHeader>

        {/* Preview area */}
        <div className="my-2 overflow-hidden rounded-xl border border-border/60 bg-muted/30">
          <div className="p-4">
            {step.preview}
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-1">
          {steps.map((_, i) => (
            <button
              aria-label={`Go to step ${i + 1}`}
              className={cn(
                "[transition:background-color_var(--motion-duration-fast)_var(--motion-ease-standard),scale_var(--motion-duration-fast)_var(--motion-ease-spring)] size-2 rounded-full",
                i === currentStep
                  ? "scale-125 bg-primary"
                  : i < currentStep
                    ? "bg-primary/40"
                    : "bg-border",
              )}
              key={i}
              onClick={() => setCurrentStep(i)}
              type="button"
            />
          ))}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between">
          <Button
            disabled={isPending}
            onClick={completeTour}
            size="sm"
            type="button"
            variant="ghost"
          >
            Skip tour
          </Button>
          <Button
            disabled={isPending}
            onClick={handleNext}
            size="sm"
            type="button"
          >
            {isLast ? "Get started" : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Preview components for dashboard tour                                     */
/* -------------------------------------------------------------------------- */

function PreviewNavItem({
  icon: Icon,
  label,
  active,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]",
        active
          ? "border border-primary/12 bg-primary/10 font-medium text-primary-ink"
          : "text-muted-foreground",
      )}
    >
      <Icon className={cn("size-3.5", active && "text-primary-ink")} />
      <span>{label}</span>
    </div>
  );
}

function PreviewSidebar({ highlight }: { highlight?: string }) {
  const items = [
    { icon: Home, label: "Home" },
    { icon: Inbox, label: "Inquiries" },
    { icon: FileText, label: "Quotes" },
    { icon: BellRing, label: "Follow-ups" },
    { icon: Sparkles, label: "Assistant" },
    { icon: PencilRuler, label: "Services" },
    { icon: Package, label: "Quote library" },
    { icon: Users, label: "Members" },
    { icon: BarChart3, label: "Analytics" },
  ];

  return (
    <div className="flex w-[7.5rem] shrink-0 flex-col gap-0.5 rounded-lg border border-border/50 bg-card p-1.5">
      <div className="mb-1.5 flex items-center gap-2 rounded-md border border-border/40 px-2 py-1.5">
        <div className="flex size-5 items-center justify-center rounded bg-primary/10 text-[8px] font-bold text-primary-ink">
          AB
        </div>
        <div className="min-w-0">
          <p className="truncate text-[9px] font-medium text-foreground">Acme Business</p>
        </div>
      </div>
      {items.map((item) => (
        <PreviewNavItem
          active={item.label === highlight}
          icon={item.icon}
          key={item.label}
          label={item.label}
        />
      ))}
    </div>
  );
}

function PreviewAttentionRow({
  icon: Icon,
  title,
  description,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tone: "urgent" | "normal" | "positive";
}) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          tone === "urgent" && "bg-destructive/10 text-destructive-ink",
          tone === "normal" && "bg-primary/10 text-primary-ink",
          tone === "positive" && "bg-success/10 text-success-ink",
        )}
      >
        <Icon className="size-3" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-foreground">{title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Exported preview scenes                                                   */
/* -------------------------------------------------------------------------- */

export function HomeOverviewPreview() {
  return (
    <div className="flex gap-3">
      <PreviewSidebar highlight="Home" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="rounded-lg border border-border/50 bg-card p-2.5">
          <p className="text-[11px] font-semibold text-foreground">Welcome back, Alex</p>
          <p className="text-[10px] text-muted-foreground">3 items need attention today.</p>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
            <Sparkles className="size-3.5 shrink-0 text-primary-ink" />
            <span className="text-[10px] text-muted-foreground">
              Ask Requo to draft a follow-up or summarize an inquiry…
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">NEEDS ATTENTION</p>
          <p className="mt-0.5 text-[9px] text-muted-foreground">Quotes and inquiries waiting on the next step.</p>
          <div className="mt-2 flex flex-col divide-y divide-border/50">
            <PreviewAttentionRow
              icon={FileText}
              title="Q-1042 viewed, no reply in 2 days"
              description="Sarah Jenkins · Kitchen remodel"
              tone="urgent"
            />
            <PreviewAttentionRow
              icon={BellRing}
              title="Follow-up due today"
              description="Maya Fields · Studio fit-out"
              tone="normal"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function InquiriesPreview() {
  return (
    <div className="flex gap-3">
      <PreviewSidebar highlight="Inquiries" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-foreground">Inquiries</p>
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary-ink">3 new</span>
          </div>
          <div className="mt-2 flex flex-col divide-y divide-border/50">
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warning/10">
                <Inbox className="size-3 text-warning-ink" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">Sarah Jenkins</p>
                <p className="truncate text-[10px] text-muted-foreground">Kitchen remodel · 10:24 AM</p>
              </div>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-primary-ink">New</span>
            </div>
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success/10">
                <Inbox className="size-3 text-success-ink" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">Leo Park</p>
                <p className="truncate text-[10px] text-muted-foreground">Tile repair · 9:02 AM</p>
              </div>
              <span className="rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">Qualified</span>
            </div>
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-info/10">
                <Inbox className="size-3 text-info-ink" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">Maya Fields</p>
                <p className="truncate text-[10px] text-muted-foreground">Studio fit-out · Yesterday</p>
              </div>
              <span className="rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">Quoted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuotesPreview() {
  return (
    <div className="flex gap-3">
      <PreviewSidebar highlight="Quotes" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-foreground">Quotes</p>
          </div>
          <div className="mt-2 flex flex-col divide-y divide-border/50">
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warning/10">
                <FileText className="size-3 text-warning-ink" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">Kitchen remodel</p>
                <p className="truncate text-[10px] text-muted-foreground">Sarah Jenkins · $4,850</p>
              </div>
              <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[8px] font-medium text-warning-ink">Draft</span>
            </div>
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-info/10">
                <FileText className="size-3 text-info-ink" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">Studio fit-out</p>
                <p className="truncate text-[10px] text-muted-foreground">Maya Fields · $12,200</p>
              </div>
              <span className="rounded-full bg-info/15 px-1.5 py-0.5 text-[8px] font-medium text-info-ink">Sent</span>
            </div>
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success/10">
                <FileText className="size-3 text-success-ink" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">Tile repair</p>
                <p className="truncate text-[10px] text-muted-foreground">Leo Park · $1,350</p>
              </div>
              <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[8px] font-medium text-success-ink">Accepted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FollowUpsPreview() {
  return (
    <div className="flex gap-3">
      <PreviewSidebar highlight="Follow-ups" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-foreground">Follow-ups</p>
            <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium text-warning-ink">2 due</span>
          </div>
          <div className="mt-2 flex flex-col divide-y divide-border/50">
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warning/10">
                <BellRing className="size-3 text-warning-ink" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">Follow up on Q-1042</p>
                <p className="truncate text-[10px] text-muted-foreground">Sarah Jenkins · Viewed 2 days ago</p>
              </div>
              <span className="text-[9px] text-muted-foreground">Today</span>
            </div>
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <BellRing className="size-3 text-primary-ink" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">Check in with Maya</p>
                <p className="truncate text-[10px] text-muted-foreground">Studio fit-out · Sent last week</p>
              </div>
              <span className="text-[9px] text-muted-foreground">Tomorrow</span>
            </div>
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <BellRing className="size-3 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">Deposit reminder</p>
                <p className="truncate text-[10px] text-muted-foreground">Leo Park · Accepted</p>
              </div>
              <span className="text-[9px] text-muted-foreground">In 3 days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AiDraftingPreview() {
  return (
    <div className="flex gap-3">
      <PreviewSidebar highlight="Quotes" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <p className="text-[11px] font-medium text-foreground">Draft with AI</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Turn an inquiry into a polished quote in seconds.
          </p>
          <div className="mt-2 flex items-center gap-2.5 rounded-md border border-primary/15 bg-primary/[0.04] px-2.5 py-2">
            <Sparkles className="size-4 shrink-0 text-primary-ink" />
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium text-foreground">
                Build a quote from this inquiry
              </p>
              <p className="truncate text-[9px] text-muted-foreground">
                Uses your quote library and business knowledge for context
              </p>
            </div>
          </div>
          <div className="mt-1.5 flex flex-col gap-1.5">
            <div className="rounded-md border border-border/50 px-2.5 py-2">
              <p className="text-[10px] font-medium text-foreground">Line items suggested from your quote library</p>
              <p className="text-[9px] text-muted-foreground">Edit, add, or remove before sending</p>
            </div>
            <div className="rounded-md border border-border/50 px-2.5 py-2">
              <p className="text-[10px] font-medium text-foreground">Follow-up message drafted for you</p>
              <p className="text-[9px] text-muted-foreground">Ready to send when a quote goes quiet</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssistantPreview() {
  return (
    <div className="flex gap-3">
      <PreviewSidebar highlight="Assistant" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <p className="text-[11px] font-medium text-foreground">Assistant</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Ask about your business — it can search, draft, and run operations.
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="rounded-md border border-border/50 px-2.5 py-2">
              <p className="text-[10px] font-medium text-foreground">
                You: Which quotes are waiting on a response?
              </p>
            </div>
            <div className="rounded-md border border-primary/15 bg-primary/[0.04] px-2.5 py-2">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 size-3 shrink-0 text-primary-ink" />
                <p className="text-[10px] text-muted-foreground">
                  3 sent quotes haven&apos;t been viewed yet — want me to draft
                  follow-ups?
                </p>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5">
            <span className="text-[10px] text-muted-foreground">
              Ask your assistant…
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuoteLibraryPreview() {
  return (
    <div className="flex gap-3">
      <PreviewSidebar highlight="Quote library" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <p className="text-[11px] font-medium text-foreground">Quote library</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Save reusable items so quotes come together fast.
          </p>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between rounded-md border border-border/50 px-2.5 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <Package className="size-3.5 shrink-0 text-primary-ink" />
                <span className="truncate text-[10px] font-medium text-foreground">Design consultation</span>
              </span>
              <span className="text-[9px] text-muted-foreground">$150</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/50 px-2.5 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <Package className="size-3.5 shrink-0 text-primary-ink" />
                <span className="truncate text-[10px] font-medium text-foreground">Standard install</span>
              </span>
              <span className="text-[9px] text-muted-foreground">$850</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/50 px-2.5 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <Package className="size-3.5 shrink-0 text-primary-ink" />
                <span className="truncate text-[10px] font-medium text-foreground">Monthly retainer</span>
              </span>
              <span className="text-[9px] text-muted-foreground">$2,400</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MembersPreview() {
  return (
    <div className="flex gap-3">
      <PreviewSidebar highlight="Members" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-foreground">Members</p>
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary-ink">Invite</span>
          </div>
          <div className="mt-2 flex flex-col divide-y divide-border/50">
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary-ink">
                AJ
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">Alex Johnson</p>
                <p className="truncate text-[10px] text-muted-foreground">alex@acme.co</p>
              </div>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-primary-ink">Owner</span>
            </div>
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-info/10 text-[9px] font-bold text-info-ink">
                SM
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">Sam Morgan</p>
                <p className="truncate text-[10px] text-muted-foreground">sam@acme.co</p>
              </div>
              <span className="rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">Member</span>
            </div>
            <div className="flex items-center gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border/60 text-muted-foreground">
                <span className="text-[9px]">+</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-muted-foreground">Invite a teammate</p>
                <p className="truncate text-[10px] text-muted-foreground">They&apos;ll get an email invitation</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPreview() {
  return (
    <div className="flex gap-3">
      <PreviewSidebar highlight="Analytics" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <p className="text-[11px] font-medium text-foreground">Analytics</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            See conversion and where leads drop off.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <div className="rounded-md border border-border/50 px-2 py-2 text-center">
              <p className="text-[13px] font-semibold text-foreground">68%</p>
              <p className="text-[9px] text-muted-foreground">Quote rate</p>
            </div>
            <div className="rounded-md border border-border/50 px-2 py-2 text-center">
              <p className="text-[13px] font-semibold text-foreground">41%</p>
              <p className="text-[9px] text-muted-foreground">Accepted</p>
            </div>
            <div className="rounded-md border border-border/50 px-2 py-2 text-center">
              <p className="text-[13px] font-semibold text-foreground">2.1d</p>
              <p className="text-[9px] text-muted-foreground">Response</p>
            </div>
          </div>
          <div className="mt-1.5 rounded-md border border-border/50 px-2.5 py-2">
            <p className="text-[10px] font-medium text-foreground">Where leads stall</p>
            <p className="text-[9px] text-muted-foreground">Quotes viewed but not replied — nudge with a follow-up</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ServicesPreview() {
  return (
    <div className="flex gap-3">
      <PreviewSidebar highlight="Services" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <p className="text-[11px] font-medium text-foreground">Services</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Each service has its own form, public page, and link.
          </p>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between rounded-md border border-border/50 px-2.5 py-2">
              <span className="text-[10px] font-medium text-foreground">Deep cleaning</span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-medium text-primary-ink">Live</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/50 px-2.5 py-2">
              <span className="text-[10px] font-medium text-foreground">Window washing</span>
              <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[8px] text-muted-foreground">Draft</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
