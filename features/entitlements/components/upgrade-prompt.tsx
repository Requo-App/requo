"use client";

import { ArrowUpRight, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UpgradeButton } from "@/features/billing/components/upgrade-button";
import type { PlanTier } from "@/lib/plans/plans";
import type { PlanFeature } from "@/lib/plans/entitlements";
import { cn } from "@/lib/utils";

import { getUpgradeCtaText, getRequiredPlanLabel, getRequiredPlanForUpgrade } from "../lib/utils";
import type {
  UpgradeActionProps,
  UpgradePromptSize,
  UpgradePromptVariant,
} from "../types";

type UpgradePromptProps = {
  /** Layout variant */
  variant: UpgradePromptVariant;
  /** Size scale, defaults to "md" */
  size?: UpgradePromptSize;
  /** Benefit description shown as secondary text */
  description: string;
  /** Current business plan — used to determine CTA text and whether to render */
  plan: PlanTier;
  /** Feature identifier for plan badge display */
  feature?: PlanFeature;
  /** Whether to show the plan badge */
  showBadge?: boolean;
  /** Upgrade action props for UpgradeButton integration */
  upgradeAction?: UpgradeActionProps;
  /** Optional trigger element for modal variant */
  trigger?: React.ReactNode;
  /** Additional className */
  className?: string;
};

// ── Size mappings ────────────────────────────────────────────────────────────

const sizeTextClasses: Record<UpgradePromptSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

const sizeButtonSize: Record<UpgradePromptSize, "sm" | "default" | "lg"> = {
  sm: "sm",
  md: "sm",
  lg: "default",
};

const sizeIconClasses: Record<UpgradePromptSize, string> = {
  sm: "size-8",
  md: "size-8",
  lg: "size-12",
};

// ── CTA rendering ────────────────────────────────────────────────────────────

function UpgradeCta({
  upgradeAction,
  size,
  ctaText,
}: {
  upgradeAction?: UpgradeActionProps;
  size: UpgradePromptSize;
  ctaText: string;
}) {
  const buttonSize = sizeButtonSize[size];
  const touchTargetClasses = "min-h-11 min-w-11 md:min-h-0 md:min-w-0";

  // Without upgradeAction we can't render an UpgradeButton (it needs ids and
  // current plan). Render nothing rather than a dead link. Callers should
  // always pass upgradeAction; the optional type is preserved only for
  // in-flight migration callers.
  if (!upgradeAction) {
    return null;
  }

  return (
    <UpgradeButton
      userId={upgradeAction.userId}
      businessId={upgradeAction.businessId}
      businessSlug={upgradeAction.businessSlug}
      currentPlan={upgradeAction.currentPlan}
      size={buttonSize}
      className={touchTargetClasses}
    >
      <ArrowUpRight data-icon="inline-start" />
      {ctaText}
    </UpgradeButton>
  );
}

// ── Variant renderers ────────────────────────────────────────────────────────

function InlineVariant({
  description,
  feature,
  showBadge,
  upgradeAction,
  size,
  ctaText,
  className,
}: {
  description: string;
  feature?: PlanFeature;
  showBadge?: boolean;
  upgradeAction?: UpgradeActionProps;
  size: UpgradePromptSize;
  ctaText: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <p
        className={cn(
          "leading-snug text-muted-foreground",
          sizeTextClasses[size],
        )}
      >
        {description}
      </p>
      {showBadge && feature && (
        <Badge variant="secondary">{getRequiredPlanLabel(feature)}</Badge>
      )}
      <UpgradeCta
        upgradeAction={upgradeAction}
        size={size}
        ctaText={ctaText}
      />
    </div>
  );
}

function CardVariant({
  description,
  feature,
  showBadge,
  upgradeAction,
  size,
  ctaText,
  className,
}: {
  description: string;
  feature?: PlanFeature;
  showBadge?: boolean;
  upgradeAction?: UpgradeActionProps;
  size: UpgradePromptSize;
  ctaText: string;
  className?: string;
}) {
  return (
    <Card
      className={cn("border-border/70 bg-card/50", className)}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={size === "sm" ? "text-sm" : undefined}>
            {ctaText}
          </CardTitle>
          {showBadge && feature && (
            <Badge variant="secondary">{getRequiredPlanLabel(feature)}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p
          className={cn(
            "leading-snug text-muted-foreground",
            sizeTextClasses[size],
          )}
        >
          {description}
        </p>
        <UpgradeCta
          upgradeAction={upgradeAction}
          size={size}
          ctaText={ctaText}
        />
      </CardContent>
    </Card>
  );
}

function BannerVariant({
  description,
  feature,
  showBadge,
  upgradeAction,
  size,
  ctaText,
  className,
}: {
  description: string;
  feature?: PlanFeature;
  showBadge?: boolean;
  upgradeAction?: UpgradeActionProps;
  size: UpgradePromptSize;
  ctaText: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-4 py-3.5 sm:px-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={cn(
            "leading-snug text-muted-foreground",
            sizeTextClasses[size],
          )}
        >
          {description}
        </p>
        {showBadge && feature && (
          <Badge variant="secondary">{getRequiredPlanLabel(feature)}</Badge>
        )}
      </div>
      <UpgradeCta
        upgradeAction={upgradeAction}
        size={size}
        ctaText={ctaText}
      />
    </div>
  );
}

function EmptyStateVariant({
  description,
  feature,
  showBadge,
  upgradeAction,
  size,
  ctaText,
  className,
}: {
  description: string;
  feature?: PlanFeature;
  showBadge?: boolean;
  upgradeAction?: UpgradeActionProps;
  size: UpgradePromptSize;
  ctaText: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 p-8 text-center text-balance",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-border/70 bg-muted/40",
          sizeIconClasses[size],
        )}
        aria-hidden="true"
      >
        <Sparkles className="size-4 text-muted-foreground" />
      </div>
      <div className="flex max-w-md flex-col items-center gap-1.5">
        <p
          className={cn(
            "leading-snug text-muted-foreground",
            sizeTextClasses[size],
          )}
        >
          {description}
        </p>
        {showBadge && feature && (
          <Badge variant="secondary" className="mt-1">
            {getRequiredPlanLabel(feature)}
          </Badge>
        )}
      </div>
      <UpgradeCta
        upgradeAction={upgradeAction}
        size={size}
        ctaText={ctaText}
      />
    </div>
  );
}

function ModalVariant({
  description,
  feature,
  showBadge,
  upgradeAction,
  size,
  ctaText,
  trigger,
  className,
}: {
  description: string;
  feature?: PlanFeature;
  showBadge?: boolean;
  upgradeAction?: UpgradeActionProps;
  size: UpgradePromptSize;
  ctaText: string;
  trigger?: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={cn(
          "max-w-md motion-reduce:!duration-0 motion-reduce:!animate-none",
          className,
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {ctaText}
            {showBadge && feature && (
              <Badge variant="secondary">
                {getRequiredPlanLabel(feature)}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <UpgradeCta
            upgradeAction={upgradeAction}
            size={size}
            ctaText={ctaText}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function UpgradePrompt({
  variant,
  size = "md",
  description,
  plan,
  feature,
  showBadge,
  upgradeAction,
  trigger,
  className,
}: UpgradePromptProps) {
  // Business plan users never see upgrade prompts
  if (plan === "business") {
    return null;
  }

  const requiredPlan = feature ? getRequiredPlanForUpgrade(feature) : undefined;
  const ctaText = getUpgradeCtaText(plan, requiredPlan);
  if (!ctaText) {
    return null;
  }

  const sharedProps = {
    description,
    feature,
    showBadge,
    upgradeAction,
    size,
    ctaText,
    className,
  };

  switch (variant) {
    case "inline":
      return <InlineVariant {...sharedProps} />;
    case "card":
      return <CardVariant {...sharedProps} />;
    case "banner":
      return <BannerVariant {...sharedProps} />;
    case "empty-state":
      return <EmptyStateVariant {...sharedProps} />;
    case "modal":
      return <ModalVariant {...sharedProps} trigger={trigger} />;
  }
}
