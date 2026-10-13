"use client";

import {
  Check,
  Eye,
  FileEdit,
  Inbox,
  Send,
  ThumbsUp,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { InquiryStatus } from "@/features/inquiries/types";
import type {
  QuoteStatus,
} from "@/features/quotes/types";

type StepState = "completed" | "current" | "upcoming" | "failed";

type WorkflowStep = {
  label: string;
  icon: LucideIcon;
  state: StepState;
};

function resolveInquirySteps(status: InquiryStatus): WorkflowStep[] {
  const steps: { label: string; icon: LucideIcon }[] = [
    { label: "Received", icon: Inbox },
    { label: "Quoted", icon: FileEdit },
    { label: "Sent", icon: Send },
    { label: "Accepted", icon: ThumbsUp },
    { label: "Completed", icon: Check },
  ];

  if (status === "lost") {
    return steps.map((step, i) => ({
      ...step,
      state: i === 0 ? "completed" : i === 1 ? "failed" : "upcoming",
    }));
  }

  if (status === "archived") {
    return steps.map((step, i) => ({
      ...step,
      state: i === 0 ? "completed" : "upcoming",
    }));
  }

  let currentIndex: number;
  switch (status) {
    case "new":
    case "waiting":
    case "overdue":
      currentIndex = 0;
      break;
    case "quoted":
      currentIndex = 1;
      break;
    case "won":
      currentIndex = 4;
      break;
    default:
      currentIndex = 0;
  }

  return steps.map((step, i) => ({
    ...step,
    state: i < currentIndex ? "completed" : i === currentIndex ? "current" : "upcoming",
  }));
}

function resolveQuoteSteps(
  status: QuoteStatus,
  publicViewedAt: Date | null | undefined,
): WorkflowStep[] {
  const steps: { label: string; icon: LucideIcon }[] = [
    { label: "Draft", icon: FileEdit },
    { label: "Sent", icon: Send },
    { label: "Viewed", icon: Eye },
    { label: "Accepted", icon: ThumbsUp },
  ];

  if (status === "rejected") {
    const viewedCompleted = publicViewedAt ? 2 : 1;
    return steps.map((step, i) => ({
      ...step,
      state:
        i < viewedCompleted
          ? "completed"
          : i === viewedCompleted
            ? "completed"
            : i === viewedCompleted + 1
              ? "failed"
              : "upcoming",
    }));
  }

  if (status === "expired" || status === "voided") {
    return steps.map((step, i) => ({
      ...step,
      state: i <= 1 ? "completed" : i === 2 ? "failed" : "upcoming",
    }));
  }

  if (status === "revision_requested") {
    return steps.map((step, i) => ({
      ...step,
      state: i === 0 ? "completed" : i === 1 ? "current" : "upcoming",
    }));
  }

  let currentIndex: number;
  switch (status) {
    case "draft":
      currentIndex = 0;
      break;
    case "sent":
      currentIndex = publicViewedAt ? 2 : 1;
      break;
    case "accepted":
      currentIndex = 3;
      break;
    default:
      currentIndex = 0;
  }

  return steps.map((step, i) => ({
    ...step,
    state: i < currentIndex ? "completed" : i === currentIndex ? "current" : "upcoming",
  }));
}

export function InquiryWorkflowSteps({
  status,
  className,
}: {
  status: InquiryStatus;
  className?: string;
}) {
  const steps = resolveInquirySteps(status);
  return <StepsBar steps={steps} className={className} />;
}

export function QuoteWorkflowSteps({
  status,
  publicViewedAt,
  className,
}: {
  status: QuoteStatus;
  publicViewedAt?: Date | null;
  className?: string;
}) {
  const steps = resolveQuoteSteps(status, publicViewedAt);
  return <StepsBar steps={steps} className={className} />;
}

function StepsBar({
  steps,
  className,
}: {
  steps: WorkflowStep[];
  className?: string;
}) {
  return (
    <nav aria-label="Workflow progress" className={cn("w-full", className)}>
      <ol className="flex items-start">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;

          return (
            <li
              className={cn("flex items-start", isLast ? "shrink-0" : "flex-1")}
              key={step.label}
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  aria-current={step.state === "current" ? "step" : undefined}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full sm:size-8",
                    step.state === "completed" &&
                      "bg-primary/10 text-primary",
                    step.state === "current" &&
                      "bg-primary/10 text-primary ring-2 ring-primary/20",
                    step.state === "upcoming" &&
                      "bg-muted text-muted-foreground/50",
                    step.state === "failed" &&
                      "bg-destructive/10 text-destructive",
                  )}
                >
                  {step.state === "completed" ? (
                    <Check className="size-3.5" strokeWidth={2} />
                  ) : step.state === "failed" ? (
                    <X className="size-3.5" strokeWidth={2} />
                  ) : (
                    <Icon className="size-3.5" strokeWidth={1.75} />
                  )}
                </div>
                <span
                  className={cn(
                    "text-center text-xs leading-tight sm:text-xs",
                    step.state === "current" && "font-medium text-primary",
                    step.state === "completed" && "font-medium text-foreground/80",
                    step.state === "upcoming" && "text-muted-foreground/60",
                    step.state === "failed" && "font-medium text-destructive",
                  )}
                >
                  {step.label}
                </span>
              </div>

              {!isLast && (
                <div className="mt-3.5 flex h-px flex-1 px-1 sm:mt-4 sm:px-1.5">
                  <div
                    aria-hidden="true"
                    className={cn(
                      "h-full w-full",
                      step.state === "completed" && steps[index + 1].state !== "upcoming"
                        ? steps[index + 1].state === "failed"
                          ? "bg-destructive/30"
                          : "bg-primary/40"
                        : "bg-border",
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
