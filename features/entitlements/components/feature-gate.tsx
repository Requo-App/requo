"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { ArrowUpRight, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UpgradeButton } from "@/features/billing/components/upgrade-button";
import type { PlanTier } from "@/lib/plans/plans";
import {
  hasFeatureAccess,
  type PlanFeature,
} from "@/lib/plans/entitlements";
import { cn } from "@/lib/utils";

import {
  getRequiredPlanLabel,
  getUpgradeCtaText,
  getUpgradeDescription,
  getFeatureLabel,
  getRequiredPlanForUpgrade,
} from "../lib/utils";
import type { UpgradeActionProps } from "../types";

type FeatureGateVariant = "action" | "block" | "page";

type FeatureGateProps = {
  /** Feature to check entitlement against */
  feature: PlanFeature;
  /** Current business plan */
  plan: PlanTier;
  /** Gating variant - determines UI behavior */
  variant: FeatureGateVariant;
  /** Value description for upgrade messaging (falls back to planFeatureDescriptions) */
  description?: string;
  /** Upgrade action props for checkout integration */
  upgradeAction?: UpgradeActionProps;
  /** The content to gate */
  children: ReactNode;
  /** Additional className */
  className?: string;
  /** For 'action' variant: whether to show tooltip (default: true) */
  showTooltip?: boolean;
  /** For 'page' variant: optional preview/demo content */
  previewContent?: ReactNode;
};

/**
 * FeatureGate - Unified component for all feature gating and upgrade UI
 * 
 * Three variants:
 * 
 * 1. **action** - For buttons, links, interactive elements
 *    - Disables element with 50% opacity
 *    - Shows tooltip on hover: "Requires [Plan] plan"
 *    - Click opens popover with upgrade CTA
 * 
 * 2. **block** - For content sections/cards
 *    - Shows upgrade card with lock icon, description, CTA
 *    - Does NOT render children in DOM when locked (secure)
 * 
 * 3. **page** - For full pages/features
 *    - With previewContent: Shows demo + "Demo data" badge + upgrade banner
 *    - Without previewContent: Shows empty-state upgrade card
 * 
 * @example
 * // Button gating
 * <FeatureGate feature="members" plan={plan} variant="action" upgradeAction={props}>
 *   <Button>Invite Member</Button>
 * </FeatureGate>
 * 
 * @example
 * // Content block gating
 * <FeatureGate feature="analyticsPerformance" plan={plan} variant="block" upgradeAction={props}>
 *   <AnalyticsChart data={data} />
 * </FeatureGate>
 * 
 * @example
 * // Page gating with preview
 * <FeatureGate 
 *   feature="exports" 
 *   plan={plan} 
 *   variant="page" 
 *   upgradeAction={props}
 *   previewContent={<DemoExport />}
 * >
 *   <RealExport />
 * </FeatureGate>
 */
export function FeatureGate({
  feature,
  plan,
  variant,
  description,
  upgradeAction,
  children,
  className,
  showTooltip = true,
  previewContent,
}: FeatureGateProps) {
  // If user has access, always render children normally
  if (hasFeatureAccess(plan, feature)) {
    return <>{children}</>;
  }

  // Locked state - render based on variant
  switch (variant) {
    case "action":
      return (
        <ActionGate
          feature={feature}
          plan={plan}
          description={description}
          upgradeAction={upgradeAction}
          showTooltip={showTooltip}
          className={className}
        >
          {children as ReactElement}
        </ActionGate>
      );

    case "block":
      return (
        <BlockGate
          feature={feature}
          plan={plan}
          description={description}
          upgradeAction={upgradeAction}
          className={className}
        />
      );

    case "page":
      return (
        <PageGate
          feature={feature}
          plan={plan}
          description={description}
          upgradeAction={upgradeAction}
          previewContent={previewContent}
          className={className}
        />
      );

    default:
      return <>{children}</>;
  }
}

/* -------------------------------------------------------------------------- */
/*  Action Variant (Buttons, Links, Interactive Elements)                     */
/* -------------------------------------------------------------------------- */

function ActionGate({
  feature,
  plan,
  description,
  upgradeAction,
  showTooltip,
  className,
  children,
}: {
  feature: PlanFeature;
  plan: PlanTier;
  description?: string;
  upgradeAction?: UpgradeActionProps;
  showTooltip: boolean;
  className?: string;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);

  const requiredPlanLabel = getRequiredPlanLabel(feature);
  const featureDescription = description ?? getUpgradeDescription(feature);
  const ctaText =
    upgradeAction?.ctaLabel ??
    getUpgradeCtaText(plan, getRequiredPlanForUpgrade(feature));

  const trigger = (
    <div
      role="group"
      aria-label={`${requiredPlanLabel} plan required`}
      aria-disabled="true"
      tabIndex={0}
      className={cn(
        "relative inline-flex min-h-11 min-w-11 cursor-not-allowed items-center justify-center md:min-h-0 md:min-w-0",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }
      }}
    >
      <div className="pointer-events-none opacity-50" aria-hidden="true" inert={true}>
        {children}
      </div>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {showTooltip ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">
              <Lock className="mr-1 inline size-3" aria-hidden="true" />
              Requires {requiredPlanLabel} plan
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}

      <PopoverContent
        align="center"
        className="w-72 motion-reduce:!animate-none motion-reduce:!duration-0"
      >
        <PopoverHeader>
          <PopoverTitle>{requiredPlanLabel} Plan</PopoverTitle>
          <PopoverDescription>{featureDescription}</PopoverDescription>
        </PopoverHeader>
        {ctaText && upgradeAction ? (
          <UpgradeButton
            userId={upgradeAction.userId}
            businessId={upgradeAction.businessId}
            businessSlug={upgradeAction.businessSlug}
            currentPlan={upgradeAction.currentPlan}
            size="sm"
            className="min-h-11 min-w-11 md:min-h-0 md:min-w-0"
          >
            <ArrowUpRight data-icon="inline-start" />
            {ctaText}
          </UpgradeButton>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/*  Block Variant (Content Sections, Cards)                                   */
/* -------------------------------------------------------------------------- */

function BlockGate({
  feature,
  plan,
  description,
  upgradeAction,
  className,
}: {
  feature: PlanFeature;
  plan: PlanTier;
  description?: string;
  upgradeAction?: UpgradeActionProps;
  className?: string;
}) {
  const featureLabel = getFeatureLabel(feature);
  const planLabel = getRequiredPlanLabel(feature);
  const featureDescription = description ?? getUpgradeDescription(feature);
  const ctaText =
    upgradeAction?.ctaLabel ??
    getUpgradeCtaText(plan, getRequiredPlanForUpgrade(feature));

  return (
    <div
      role="region"
      aria-label={`Premium feature: ${featureLabel} — requires ${planLabel} plan`}
      className={cn("flex flex-col gap-6", className)}
    >
      <Card className="border-border/70 bg-card/50">
        <CardHeader className="gap-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
              <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{featureLabel}</CardTitle>
                <Badge variant="secondary">{planLabel}</Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <p className="text-sm leading-6 text-muted-foreground">
            {featureDescription}
          </p>
          {ctaText && upgradeAction ? (
            <div>
              <UpgradeButton
                userId={upgradeAction.userId}
                businessId={upgradeAction.businessId}
                businessSlug={upgradeAction.businessSlug}
                currentPlan={upgradeAction.currentPlan}
                size="default"
              >
                <ArrowUpRight data-icon="inline-start" />
                {ctaText}
              </UpgradeButton>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page Variant (Full Pages, Major Features)                                 */
/* -------------------------------------------------------------------------- */

function PageGate({
  feature,
  plan,
  description,
  upgradeAction,
  previewContent,
  className,
}: {
  feature: PlanFeature;
  plan: PlanTier;
  description?: string;
  upgradeAction?: UpgradeActionProps;
  previewContent?: ReactNode;
  className?: string;
}) {
  const featureLabel = getFeatureLabel(feature);
  const planLabel = getRequiredPlanLabel(feature);
  const featureDescription = description ?? getUpgradeDescription(feature);
  const ctaText =
    upgradeAction?.ctaLabel ??
    getUpgradeCtaText(plan, getRequiredPlanForUpgrade(feature));

  // With preview content: show demo + badge + banner
  if (previewContent) {
    return (
      <div
        className={cn("flex flex-col gap-4", className)}
        role="region"
        aria-label={`${featureDescription} — requires ${planLabel} plan`}
      >
        <div className="relative">
          <div className="absolute right-2 top-2 z-10">
            <Badge variant="secondary">Demo data</Badge>
          </div>
          <div aria-hidden="true">{previewContent}</div>
        </div>
        <Card className="border-border/70 bg-card/50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
                <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{featureLabel}</p>
                  <Badge variant="secondary" className="text-xs">
                    {planLabel}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {featureDescription}
                </p>
              </div>
            </div>
            {ctaText && upgradeAction ? (
              <UpgradeButton
                userId={upgradeAction.userId}
                businessId={upgradeAction.businessId}
                businessSlug={upgradeAction.businessSlug}
                currentPlan={upgradeAction.currentPlan}
                size="sm"
                className="shrink-0"
              >
                <ArrowUpRight data-icon="inline-start" />
                {ctaText}
              </UpgradeButton>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Without preview: show empty-state upgrade card
  return (
    <div
      className={cn("flex min-h-[400px] items-center justify-center p-6", className)}
      role="region"
      aria-label={`${featureDescription} — requires ${planLabel} plan`}
    >
      <Card className="w-full max-w-md border-border/70 bg-card/50">
        <CardHeader className="gap-4 pb-4 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-xl border border-border/70 bg-muted/40">
            <Lock className="size-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-center gap-2">
              <CardTitle className="text-lg">{featureLabel}</CardTitle>
              <Badge variant="secondary">{planLabel}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{featureDescription}</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pt-0">
          {ctaText && upgradeAction ? (
            <UpgradeButton
              userId={upgradeAction.userId}
              businessId={upgradeAction.businessId}
              businessSlug={upgradeAction.businessSlug}
              currentPlan={upgradeAction.currentPlan}
              size="default"
            >
              <ArrowUpRight data-icon="inline-start" />
              {ctaText}
            </UpgradeButton>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
