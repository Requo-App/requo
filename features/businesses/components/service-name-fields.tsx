"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FeatureGate } from "@/features/entitlements";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import type { PlanTier } from "@/lib/plans/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";

export type ServiceNameEntry = {
  name: string;
};

type ServiceNameFieldsProps = {
  services: ServiceNameEntry[];
  plan: PlanTier;
  /** Field-level error shown under the rows. */
  fieldError?: string;
  isPending: boolean;
  onNameChange: (index: number, name: string) => void;
  onAddService: () => void;
  onRemoveService: (index: number) => void;
  /** Placeholder for the first (default) service row. */
  firstPlaceholder?: string;
  /** Placeholder for extra service rows. */
  extraPlaceholder?: string;
  /** Extra classes for the name inputs (e.g. onboarding's shared input style). */
  inputClassName?: string;
};

/**
 * Live services allowed by the plan. Extras beyond the cap stay visible but
 * locked for plans without `multipleServices` (entitlement-visibility rule);
 * the server trims beyond-limit rows on submit.
 */
function resolvePlanServiceCap(plan: PlanTier) {
  return getUsageLimit(plan, "liveServicesPerBusiness") ?? 10;
}

/**
 * Named service rows shared by onboarding and the businesses hub create form.
 * The first row is the default service; extras get their own public URL.
 */
export function ServiceNameFields({
  services,
  plan,
  fieldError,
  isPending,
  onNameChange,
  onAddService,
  onRemoveService,
  firstPlaceholder = "e.g. Deep cleaning",
  extraPlaceholder = "e.g. Move-out cleaning",
  inputClassName,
}: ServiceNameFieldsProps) {
  const cap = resolvePlanServiceCap(plan);
  const hasMultipleServicesFeature = hasFeatureAccess(plan, "multipleServices");
  const canAddMore = services.length < cap;
  const isAddLocked = !hasMultipleServicesFeature;
  const isAddDisabled = isPending || (!isAddLocked && !canAddMore);

  const addButton = (
    <Button
      className="w-fit"
      disabled={isAddDisabled}
      onClick={onAddService}
      size="sm"
      type="button"
      variant="outline"
    >
      <Plus data-icon="inline-start" />
      Add another service
    </Button>
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {services.length} of {cap} live services on your plan.
      </p>
      <div className="flex flex-col gap-2">
        {services.map((service, index) => {
          const isFirst = index === 0;

          return (
            <div className="flex items-center gap-2" key={index}>
              <Input
                aria-label={`Service ${index + 1} name`}
                autoComplete="off"
                className={inputClassName}
                disabled={isPending}
                maxLength={80}
                onChange={(event) =>
                  onNameChange(index, event.currentTarget.value)
                }
                placeholder={isFirst ? firstPlaceholder : extraPlaceholder}
                value={service.name}
              />
              {!isFirst ? (
                <Button
                  aria-label={`Remove service ${index + 1}`}
                  disabled={isPending}
                  onClick={() => onRemoveService(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {fieldError ? (
        <p className="text-xs text-destructive" role="alert">
          {fieldError}
        </p>
      ) : null}

      {isAddLocked ? (
        <FeatureGate variant="action" className="w-fit" feature="multipleServices" plan={plan}>
          {addButton}
        </FeatureGate>
      ) : canAddMore ? (
        addButton
      ) : (
        <div>{addButton}</div>
      )}

      {!isAddLocked && !canAddMore ? (
        <p className="text-xs text-muted-foreground">
          You have reached your plan limit of {cap} live services. Manage or
          archive services in settings.
        </p>
      ) : null}
    </div>
  );
}
