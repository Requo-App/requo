import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";

import {
  DashboardActionsRow,
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import {
  getActivationChecklist,
} from "@/features/onboarding/activation-checklist";
import { getBusinessDashboardSummaryData } from "@/features/businesses/queries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActivationLaunchpadProps = {
  businessName: string;
  businessSlug: string;
  businessId: string;
  publicInquiryEnabled: boolean;
};

export async function ActivationLaunchpad({
  businessName,
  businessSlug,
  businessId,
  publicInquiryEnabled,
}: ActivationLaunchpadProps) {
  const summary = await getBusinessDashboardSummaryData(businessId);

  const hasInquiry = summary.totalInquiries > 0;
  const hasQuote = summary.totalQuotes > 0;

  // Launchpad is complete when first inquiry and first quote exist
  const isComplete = hasInquiry && hasQuote;

  // Don't show launchpad if activation is complete
  if (isComplete) {
    return null;
  }

  const launchpadItems = getActivationChecklist({
    businessSlug,
    publicInquiryEnabled,
    totalInquiries: summary.totalInquiries,
    totalQuotes: summary.totalQuotes,
  });

  const completedSteps = launchpadItems.filter((item) => item.complete).length;
  const totalSteps = launchpadItems.length;
  const remainingSteps = totalSteps - completedSteps;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  // First incomplete, non-disabled step is the current focus.
  const currentStepId = launchpadItems.find(
    (item) => !item.complete && !item.disabled,
  )?.id;
  const nextStep = launchpadItems.find(
    (item) => !item.complete && !item.disabled && item.href,
  );

  return (
    <DashboardSection
      action={
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {completedSteps} of {totalSteps} done
          </span>
          <span
            aria-hidden="true"
            className="h-1 w-16 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${progressPercent}%` }}
            />
          </span>
        </div>
      }
      description={`Get ${businessName} live — ${remainingSteps} step${remainingSteps === 1 ? "" : "s"} to activate your inquiry-to-quote workflow.`}
      footer={
        nextStep ? (
          <DashboardActionsRow>
            <Button asChild size="sm">
              <Link
                href={nextStep.href}
                prefetch={!nextStep.external}
                {...(nextStep.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {nextStep.actionLabel}
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </DashboardActionsRow>
        ) : undefined
      }
      title="Getting started"
      headerClassName="pb-3"
    >
      <ol className="flex flex-col divide-y divide-border/60">
        {launchpadItems.map((item, index) => {
          const isCurrent = item.id === currentStepId;
          const stepNumber = index + 1;

          const rowBody = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold tabular-nums",
                  item.complete &&
                    "bg-primary text-primary-foreground",
                  !item.complete &&
                    isCurrent &&
                    "border border-primary text-primary-ink",
                  !item.complete &&
                    !isCurrent &&
                    "border border-border text-muted-foreground",
                )}
              >
                {item.complete ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : (
                  stepNumber
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm leading-5 font-medium",
                    item.complete || item.disabled
                      ? "text-muted-foreground"
                      : "text-foreground",
                  )}
                >
                  {item.title}
                </span>
                <span className="block truncate text-xs leading-5 text-muted-foreground">
                  {item.detail}
                </span>
              </span>
              {item.complete ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  Done
                </span>
              ) : item.disabled ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  Locked
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  <span className="hidden sm:inline">{item.actionLabel}</span>
                  {item.external ? (
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  )}
                </span>
              )}
            </>
          );

          const rowClassName = cn(
            "group flex items-center gap-3 px-2 py-2.5 text-left",
            !item.disabled && "transition-colors hover:bg-accent/60 rounded-lg",
            item.disabled && "opacity-60",
            isCurrent && "rounded-lg bg-accent/40",
          );

          if (item.disabled || !item.href) {
            return (
              <li key={item.id}>
                <div className={rowClassName} aria-disabled={item.disabled}>
                  {rowBody}
                </div>
              </li>
            );
          }

          return (
            <li key={item.id}>
              <Link
                href={item.href}
                prefetch={!item.external}
                {...(item.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className={rowClassName}
                aria-label={`${item.title} — ${item.actionLabel}`}
              >
                {rowBody}
              </Link>
            </li>
          );
        })}
      </ol>
    </DashboardSection>
  );
}
