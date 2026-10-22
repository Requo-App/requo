"use client";

import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { ServiceNameFields } from "@/features/businesses/components/service-name-fields";
import type { PlanTier } from "@/lib/plans/plans";

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
