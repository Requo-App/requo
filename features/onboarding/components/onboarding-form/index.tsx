"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { toast } from "@/components/shared/notify";

import { FormActions } from "@/components/shared/form-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  clearOnboardingDraft,
  createEmptyOnboardingDraft,
  getRecommendedStarterWorkflowForBusinessType,
  onboardingSessionStorageKey,
  resolveFirstServiceNameOnTypeChange,
  resolveOnboardingCurrencyChange,
  type OnboardingDraft,
} from "@/features/onboarding/helpers";
import { OnboardingStepper } from "@/features/onboarding/components/onboarding-stepper";
import type {
  OnboardingActionState,
  OnboardingFieldName,
} from "@/features/onboarding/types";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import type { BusinessType } from "@/features/inquiries/business-types";
import { slugifyPublicName } from "@/lib/slugs";

import { BusinessStep } from "./business-step";
import { ServicesStep } from "./services-step";
import { SetupLoadingOverlay } from "./setup-loading-overlay";
import { WorkflowStep } from "./workflow-step";
import {
  clampStepIndex,
  getFieldValidationError,
  lastOnboardingStepIndex,
  mapServerFieldErrors,
  onboardingSteps,
  sanitizeDraft,
  type OnboardingFormProps,
} from "./types";

const initialState: OnboardingActionState = {};

export function OnboardingForm({
  action,
  detectedCountryCode,
  initialProfile,
  plan = "free",
  lastNameOptional = false,
}: OnboardingFormProps) {
  const [state, formAction, isPending] = useActionStateWithSonner(
    action,
    initialState,
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(() => ({
    ...createEmptyOnboardingDraft(),
    ...(detectedCountryCode
      ? {
          countryCode: detectedCountryCode,
          defaultCurrency: resolveOnboardingCurrencyChange({
            currentCurrency: "",
            previousCountryCode: "",
            nextCountryCode: detectedCountryCode,
          }),
        }
      : {}),
    ...(initialProfile
      ? {
          firstName: initialProfile.firstName,
          lastName: initialProfile.lastName,
        }
      : {}),
  }));
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(
    initialProfile?.avatarUrl ?? null,
  );
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const businessAvatarInputRef = useRef<HTMLInputElement>(null);
  const [businessAvatarPreviewUrl, setBusinessAvatarPreviewUrl] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugAvailability, setSlugAvailability] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");
  const slugCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<OnboardingFieldName, string>>
  >({});
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const currentStepMeta = onboardingSteps[currentStep];
  const currentStepId = currentStepMeta.id;
  const recommendedWorkflow = useMemo(
    () => getRecommendedStarterWorkflowForBusinessType(draft.businessType),
    [draft.businessType],
  );

  useEffect(() => {
    try {
      const storedValue = window.sessionStorage.getItem(
        onboardingSessionStorageKey,
      );

      if (storedValue) {
        const parsedValue = JSON.parse(storedValue) as {
          currentStep?: number;
          draft?: Partial<OnboardingDraft>;
        };

        setDraft((currentDraft) => ({
          ...currentDraft,
          ...sanitizeDraft(parsedValue.draft),
        }));
        setCurrentStep(
          clampStepIndex(parsedValue.currentStep ?? 0, lastOnboardingStepIndex),
        );
      }
    } catch (error) {
      console.error("Failed to restore onboarding draft.", error);
    } finally {
      setIsDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isDraftHydrated) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        onboardingSessionStorageKey,
        JSON.stringify({
          currentStep,
          draft,
        }),
      );
    } catch (error) {
      console.error("Failed to save onboarding draft.", error);
    }
  }, [currentStep, draft, isDraftHydrated]);

  useEffect(() => {
    if (!state.fieldErrors) {
      return;
    }

    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      ...mapServerFieldErrors(state.fieldErrors),
    }));
  }, [state.fieldErrors]);

  // Re-persist draft to sessionStorage if the server action returned an error
  // (we clear sessionStorage optimistically before submit).
  useEffect(() => {
    if (!isDraftHydrated) {
      return;
    }

    if (state.error || state.fieldErrors) {
      try {
        window.sessionStorage.setItem(
          onboardingSessionStorageKey,
          JSON.stringify({ currentStep, draft }),
        );
      } catch {
        // Ignore write failures
      }
    }
  }, [state.error, state.fieldErrors, isDraftHydrated, currentStep, draft]);

  function updateField<FieldName extends OnboardingFieldName>(
    field: FieldName,
    value: OnboardingDraft[FieldName],
  ) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));

    setFieldErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  function handleCountryChange(countryCode: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      countryCode,
      defaultCurrency: resolveOnboardingCurrencyChange({
        currentCurrency: currentDraft.defaultCurrency,
        previousCountryCode: currentDraft.countryCode,
        nextCountryCode: countryCode,
      }),
    }));

    clearFieldErrors("countryCode", "defaultCurrency");
  }

  function handleBusinessTypeChange(value: string) {
    const nextBusinessType = value as BusinessType;
    const previousRecommendation = getRecommendedStarterWorkflowForBusinessType(
      draft.businessType,
    );
    const nextRecommendation =
      getRecommendedStarterWorkflowForBusinessType(nextBusinessType);

    setDraft((currentDraft) => ({
      ...currentDraft,
      businessType: nextBusinessType,
      starterWorkflow:
        !currentDraft.starterWorkflow ||
        currentDraft.starterWorkflow === previousRecommendation
          ? nextRecommendation
          : currentDraft.starterWorkflow,
      services: resolveFirstServiceNameOnTypeChange({
        services: currentDraft.services,
        previousBusinessType: currentDraft.businessType,
        nextBusinessType,
      }),
    }));

    clearFieldErrors("businessType", "starterWorkflow", "services");
  }

  function handleServiceNameChange(index: number, name: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      services: currentDraft.services.map((service, serviceIndex) =>
        serviceIndex === index ? { name } : service,
      ),
    }));

    clearFieldErrors("services");
  }

  function handleAddService() {
    setDraft((currentDraft) => ({
      ...currentDraft,
      services: [...currentDraft.services, { name: "" }],
    }));
  }

  function handleRemoveService(index: number) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      services:
        currentDraft.services.length > 1
          ? currentDraft.services.filter((_, serviceIndex) => serviceIndex !== index)
          : currentDraft.services,
    }));
  }

  function clearFieldErrors(...fields: OnboardingFieldName[]) {
    setFieldErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };

      for (const field of fields) {
        delete nextErrors[field];
      }

      return nextErrors;
    });
  }

  function validateFields(fields: readonly OnboardingFieldName[]) {
    const nextErrors: Partial<Record<OnboardingFieldName, string>> = {};

    for (const field of fields) {
      const error = getFieldValidationError(field, draft, {
        lastNameOptional,
      });

      if (error) {
        nextErrors[field] = error;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        ...nextErrors,
      }));

      const firstError = Object.values(nextErrors)[0];

      if (firstError) {
        toast.error(firstError);
      }

      return false;
    }

    return true;
  }

  function getFirstInvalidStepIndex() {
    for (const [index, step] of onboardingSteps.entries()) {
      if (!validateFields(step.fields)) {
        return index;
      }
    }

    return -1;
  }

  function handleContinue() {
    if (!validateFields(currentStepMeta.fields)) {
      return;
    }

    if (currentStepId === "business" && slugAvailability === "taken") {
      toast.error("That URL is already taken. Choose a different one.");
      return;
    }

    setCurrentStep((step) => Math.min(step + 1, lastOnboardingStepIndex));
  }

  function handleBack() {
    setCurrentStep((step) => Math.max(step - 1, 0));
  }

  function handleStepSelect(nextStep: number) {
    if (nextStep >= currentStep) {
      return;
    }

    setCurrentStep(nextStep);
  }

  function handleAvatarSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Profile photo must be under 2 MB.");
      event.currentTarget.value = "";
      return;
    }

    const url = URL.createObjectURL(file);
    setAvatarPreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
  }

  function handleBusinessAvatarSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Business logo must be under 2 MB.");
      event.currentTarget.value = "";
      return;
    }

    const url = URL.createObjectURL(file);
    setBusinessAvatarPreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
  }

  function checkSlugAvailability(slug: string) {
    if (slugCheckTimeoutRef.current) {
      clearTimeout(slugCheckTimeoutRef.current);
    }

    if (!slug || slug.length < 2) {
      setSlugAvailability("idle");
      return;
    }

    setSlugAvailability("checking");

    slugCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/business/check-slug?slug=${encodeURIComponent(slug)}`,
        );
        const data = await response.json();
        setSlugAvailability(data.available ? "available" : "taken");
      } catch {
        setSlugAvailability("idle");
      }
    }, 400);
  }

  return (
    <>
      <form
        action={formAction}
        className="mx-auto w-full max-w-5xl"
        onSubmit={(event) => {
          if (currentStep < lastOnboardingStepIndex) {
            event.preventDefault();
            handleContinue();
            return;
          }

          const firstInvalidStepIndex = getFirstInvalidStepIndex();

          if (firstInvalidStepIndex >= 0) {
            event.preventDefault();
            setCurrentStep(firstInvalidStepIndex);
            return;
          }

          // Clear session storage before submitting so the draft doesn't
          // persist for the next user session on this browser.
          clearOnboardingDraft();
        }}
      >
        <input name="firstName" type="hidden" value={draft.firstName} />
        <input name="lastName" type="hidden" value={draft.lastName} />
        <input name="businessName" type="hidden" value={draft.businessName} />
        <input name="businessSlug" type="hidden" value={draft.businessSlug} />
        <input name="businessType" type="hidden" value={draft.businessType} />
        <input name="countryCode" type="hidden" value={draft.countryCode} />
        <input
          name="defaultCurrency"
          type="hidden"
          value={draft.defaultCurrency}
        />
        <input
          name="customerContactChannel"
          type="hidden"
          value={draft.customerContactChannel}
        />
        <input
          name="starterWorkflow"
          type="hidden"
          value={draft.starterWorkflow}
        />
        <input
          name="services"
          type="hidden"
          value={JSON.stringify(draft.services)}
        />
        <input name="jobTitle" type="hidden" value={draft.jobTitle} />
        <input name="companySize" type="hidden" value={draft.companySize} />
        <input
          name="referralSource"
          type="hidden"
          value={draft.referralSource}
        />

        <div className="flex w-full flex-col gap-5">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {currentStepMeta.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {currentStepMeta.body}
            </p>
          </div>

          <OnboardingStepper
            currentStep={currentStep}
            items={onboardingSteps}
            onStepSelect={handleStepSelect}
          />

          {state.error ? (
            <Alert className="mx-auto w-full max-w-3xl">
              <AlertTitle>Setup hit a problem</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="motion-enter min-w-0" key={currentStepId}>
            {currentStepId === "business" ? (
              <BusinessStep
                avatarInputRef={avatarInputRef}
                avatarPreviewUrl={avatarPreviewUrl}
                businessAvatarInputRef={businessAvatarInputRef}
                businessAvatarPreviewUrl={businessAvatarPreviewUrl}
                checkSlugAvailability={checkSlugAvailability}
                draft={draft}
                fieldErrors={fieldErrors}
                handleAvatarSelection={handleAvatarSelection}
                handleBusinessAvatarSelection={handleBusinessAvatarSelection}
                handleBusinessTypeChange={handleBusinessTypeChange}
                handleCountryChange={handleCountryChange}
                isDraftHydrated={isDraftHydrated}
                isPending={isPending}
                lastNameOptional={lastNameOptional}
                setSlugManuallyEdited={setSlugManuallyEdited}
                slugAvailability={slugAvailability}
                slugManuallyEdited={slugManuallyEdited}
                slugifyPublicName={slugifyPublicName}
                updateField={updateField}
              />
            ) : null}

            {currentStepId === "workflow" ? (
              <WorkflowStep
                draft={draft}
                fieldErrors={fieldErrors}
                isPending={isPending}
                recommendedWorkflow={recommendedWorkflow}
                updateField={updateField}
              />
            ) : null}

            {currentStepId === "services" ? (
              <ServicesStep
                draft={draft}
                fieldError={fieldErrors.services}
                isPending={isPending}
                onAddService={handleAddService}
                onNameChange={handleServiceNameChange}
                onRemoveService={handleRemoveService}
                plan={plan}
              />
            ) : null}
          </div>

          <FormActions
            align={currentStep === 0 ? "end" : "between"}
            className="pt-0"
          >
            {currentStep > 0 ? (
              <Button
                disabled={isPending}
                onClick={handleBack}
                size="sm"
                type="button"
                variant="ghost"
              >
                Back
              </Button>
            ) : null}

            {currentStep < lastOnboardingStepIndex ? (
              <Button
                key="continue"
                disabled={isPending}
                onClick={handleContinue}
                size="sm"
                type="button"
              >
                Continue
              </Button>
            ) : (
              <Button key="finish" disabled={isPending} size="sm" type="submit">
                {isPending ? (
                  <>
                    <Spinner data-icon="inline-start" aria-hidden="true" />
                    Finishing setup...
                  </>
                ) : (
                  "Finish setup"
                )}
              </Button>
            )}
          </FormActions>
        </div>
      </form>

      {isPending && currentStep === lastOnboardingStepIndex ? (
        <SetupLoadingOverlay />
      ) : null}
    </>
  );
}
