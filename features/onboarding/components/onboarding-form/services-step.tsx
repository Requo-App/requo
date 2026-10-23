"use client";

import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { ServiceNameFields } from "@/features/businesses/components/service-name-fields";
import { PRO_TRIAL_DAYS, type PlanTier } from "@/lib/plans/plans";

import type { OnboardingDraftService } from "@/features/onboarding/helpers";
import { onboardingInputClassName } from "./types";

type ServicesStepProps = {
  draft: {
    services: OnboardingDraftService[];
  };
  plan: PlanTier;
  fieldError?: string;
  isPending: boolean;
  onNameChange: (index: number, name: string) => void;
  onAddService: () => void;
  onRemoveService: (index: number) => void;
};

export function ServicesStep({
  draft,
  plan,
  fieldError,
  isPending,
  onNameChange,
  onAddService,
  onRemoveService,
}: ServicesStepProps) {
  return (
    <div className="mx-auto w-full max-w-xl py-4">
      {plan === "pro" ? (
        <p className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Your first {PRO_TRIAL_DAYS} days are on Pro, with no card required.
        </p>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel className="text-sm font-medium text-foreground">
            Service name
          </FieldLabel>
          <FieldContent>
            <ServiceNameFields
              extraPlaceholder="e.g. Move-out cleaning"
              fieldError={fieldError}
              firstPlaceholder="e.g. Deep cleaning"
              inputClassName={onboardingInputClassName}
              isPending={isPending}
              onAddService={onAddService}
              onNameChange={onNameChange}
              onRemoveService={onRemoveService}
              plan={plan}
              services={draft.services}
            />
          </FieldContent>
        </Field>
      </FieldGroup>
    </div>
  );
}
