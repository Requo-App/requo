"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { CountryCombobox } from "@/components/shared/country-combobox";
import { Combobox } from "@/components/ui/combobox";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  businessCurrencyOptions,
  getBusinessCurrencyOption,
} from "@/features/businesses/locale";
import {
  getDefaultOnboardingServiceName,
  resolveFirstServiceNameOnTypeChange,
  resolveOnboardingCurrencyChange,
} from "@/features/onboarding/helpers";
import {
  starterTemplateOptions,
} from "@/features/businesses/starter-templates";
import { validateBusinessSlug } from "@/features/businesses/validation";
import type { CreateBusinessActionState } from "@/features/businesses/types";
import type { BusinessType } from "@/features/inquiries/business-types";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import type { PlanTier } from "@/lib/plans/plans";
import { slugifyPublicName } from "@/lib/slugs";
import { cn } from "@/lib/utils";

import { ServiceNameFields, type ServiceNameEntry } from "./service-name-fields";

type CreateBusinessFormProps = {
  action: (
    state: CreateBusinessActionState,
    formData: FormData,
  ) => Promise<CreateBusinessActionState>;
  businessId: string;
  /** When true, renders without dialog wrappers for standalone page use. */
  standalone?: boolean;
  /** Resolved plan for the new business; drives the service cap UI. */
  plan?: PlanTier;
};

const initialState: CreateBusinessActionState = {};

export function CreateBusinessForm({
  action,
  businessId,
  standalone = false,
  plan = "free",
}: CreateBusinessFormProps) {
  const [state, formAction, isPending] = useActionStateWithSonner(
    action,
    initialState,
  );
  const [businessType, setBusinessType] = useState<BusinessType>(
    "general_project_services",
  );
  const [services, setServices] = useState<ServiceNameEntry[]>([
    { name: "" },
  ]);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [countryCode, setCountryCode] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugAvailability, setSlugAvailability] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");
  const slugCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slugError, setSlugError] = useState<string | undefined>(undefined);
  const nameError = state.fieldErrors?.name?.[0];
  const slugServerError = state.fieldErrors?.slug?.[0];
  const countryCodeError = state.fieldErrors?.countryCode?.[0];
  const businessTypeError = state.fieldErrors?.businessType?.[0];
  const defaultCurrencyError = state.fieldErrors?.defaultCurrency?.[0];
  const selectedCurrency = getBusinessCurrencyOption(defaultCurrency);

  const checkSlugAvailability = useCallback((value: string) => {
    if (slugCheckTimeoutRef.current) {
      clearTimeout(slugCheckTimeoutRef.current);
    }

    if (!value || value.length < 2) {
      setSlugAvailability("idle");
      return;
    }

    const validation = validateBusinessSlug(value);
    if (!validation.valid) {
      setSlugAvailability("idle");
      return;
    }

    setSlugAvailability("checking");

    slugCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/business/check-slug?slug=${encodeURIComponent(value)}`,
        );
        const data = await response.json();
        setSlugAvailability(data.available ? "available" : "taken");
      } catch {
        setSlugAvailability("idle");
      }
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (slugCheckTimeoutRef.current) {
        clearTimeout(slugCheckTimeoutRef.current);
      }
    };
  }, []);

  function applySlug(value: string) {
    setSlug(value);
    if (!value) {
      setSlugError(undefined);
      setSlugAvailability("idle");
      return;
    }
    const validation = validateBusinessSlug(value);
    setSlugError(validation.valid ? undefined : validation.error);
    checkSlugAvailability(value);
  }

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (slugManuallyEdited) {
        return;
      }
      const name = e.target.value;
      if (!name.trim()) {
        applySlug("");
        return;
      }
      applySlug(slugifyPublicName(name, { fallback: "business" }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slugManuallyEdited, checkSlugAvailability],
  );

  const handleNameBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (slugManuallyEdited) {
        return;
      }
      const name = e.target.value;
      if (!name.trim()) {
        applySlug("");
        return;
      }
      applySlug(slugifyPublicName(name, { fallback: "business" }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slugManuallyEdited, checkSlugAvailability],
  );

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugManuallyEdited(true);
    const nextSlug = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/--+/g, "-")
      .replace(/^-|-$/g, "");
    applySlug(nextSlug);
  }

  function handleCountryChange(nextCountryCode: string) {
    setCountryCode((currentCountryCode) => {
      setDefaultCurrency((currentCurrency) =>
        resolveOnboardingCurrencyChange({
          currentCurrency,
          previousCountryCode: currentCountryCode,
          nextCountryCode,
        }),
      );
      return nextCountryCode;
    });
  }

  function handleBusinessTypeChange(value: string) {
    const nextBusinessType = value as BusinessType;

    setServices((currentServices) =>
      resolveFirstServiceNameOnTypeChange({
        services: currentServices,
        previousBusinessType: businessType,
        nextBusinessType,
      }),
    );
    setBusinessType(nextBusinessType);
  }

  const slugTaken = slugAvailability === "taken";
  const fields = (
    <FieldGroup>
      <Field data-invalid={Boolean(nameError) || undefined}>
        <FieldLabel htmlFor="business-name">Business name</FieldLabel>
        <FieldContent>
          <Input
            id="business-name"
            name="name"
            maxLength={80}
            minLength={2}
            placeholder="Northside Signs"
            required
            aria-invalid={Boolean(nameError) || undefined}
            disabled={isPending}
            onChange={handleNameChange}
            onBlur={handleNameBlur}
          />
          <FieldError
            errors={nameError ? [{ message: nameError }] : undefined}
          />
        </FieldContent>
      </Field>

      <Field
        data-invalid={
          Boolean(slugServerError || slugError) || slugTaken || undefined
        }
      >
        <FieldLabel htmlFor="business-slug">Public URL</FieldLabel>
        <FieldContent>
          <div
            className={cn(
              "flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm transition-colors",
              (Boolean(slugServerError || slugError) || slugTaken) &&
                "border-destructive",
              isPending && "opacity-60",
            )}
          >
            <span className="shrink-0 select-none text-sm text-muted-foreground">
              /businesses/
            </span>
            <input
              aria-invalid={
                Boolean(slugServerError || slugError) || slugTaken || undefined
              }
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              disabled={isPending}
              id="business-slug"
              maxLength={60}
              onChange={handleSlugChange}
              placeholder="your-business"
              value={slug}
            />
          </div>
          {slugTaken ? (
            <p className="mt-1.5 text-sm text-destructive">
              This URL is already taken. Try a different one.
            </p>
          ) : slugAvailability === "available" && slug.length >= 2 ? (
            <p className="mt-1.5 text-sm text-primary">Available</p>
          ) : null}
          {!slugTaken && (slugServerError || slugError) ? (
            <p className="mt-1.5 text-sm text-destructive">
              {(slugServerError ?? slugError) as string}
            </p>
          ) : null}
        </FieldContent>
      </Field>

      <Field data-invalid={Boolean(countryCodeError) || undefined}>
        <FieldLabel htmlFor="business-country">Country</FieldLabel>
        <FieldContent>
          <CountryCombobox
            aria-invalid={Boolean(countryCodeError) || undefined}
            disabled={isPending}
            id="business-country"
            onValueChange={handleCountryChange}
            placeholder="Choose your country"
            searchPlaceholder="Search country"
            value={countryCode}
          />
          <FieldError
            errors={
              countryCodeError ? [{ message: countryCodeError }] : undefined
            }
          />
        </FieldContent>
      </Field>

      <Field data-invalid={Boolean(defaultCurrencyError) || undefined}>
        <FieldLabel htmlFor="business-default-currency">
          Currency
        </FieldLabel>
        <FieldContent>
          <Combobox
            aria-invalid={Boolean(defaultCurrencyError) || undefined}
            disabled={isPending}
            id="business-default-currency"
            onValueChange={setDefaultCurrency}
            options={businessCurrencyOptions.map((opt) => ({
              value: opt.code,
              label: opt.label,
              searchText: `${opt.code} ${opt.name}`,
            }))}
            placeholder="Choose a currency"
            searchPlaceholder="Search currency"
            searchable
            value={defaultCurrency}
          />
          <FieldDescription>
            New quotes and pricing entries start with{" "}
            {selectedCurrency?.code ?? defaultCurrency}.
          </FieldDescription>
          <FieldError
            errors={
              defaultCurrencyError ? [{ message: defaultCurrencyError }] : undefined
            }
          />
        </FieldContent>
      </Field>

      <Field data-invalid={Boolean(businessTypeError) || undefined}>
        <FieldLabel htmlFor="business-starter-template">
          Business type
        </FieldLabel>
        <FieldContent>
          <Combobox
            aria-invalid={Boolean(businessTypeError) || undefined}
            disabled={isPending}
            id="business-starter-template"
            onValueChange={handleBusinessTypeChange}
            options={starterTemplateOptions}
            placeholder="Choose a business type"
            renderOption={(option) => (
              <div className="min-w-0">
                <p className="truncate font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">
                  {option.description}
                </p>
              </div>
            )}
            searchPlaceholder="Search business types"
            value={businessType}
          />
          <FieldError
            errors={
              businessTypeError ? [{ message: businessTypeError }] : undefined
            }
          />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Services</FieldLabel>
        <FieldContent>
          <ServiceNameFields
            extraPlaceholder="e.g. Sign installation"
            firstPlaceholder={getDefaultOnboardingServiceName(businessType)}
            isPending={isPending}
            onAddService={() =>
              setServices((current) => [...current, { name: "" }])
            }
            onNameChange={(index, name) =>
              setServices((current) =>
                current.map((service, serviceIndex) =>
                  serviceIndex === index ? { name } : service,
                ),
              )
            }
            onRemoveService={(index) =>
              setServices((current) =>
                current.length > 1
                  ? current.filter((_, serviceIndex) => serviceIndex !== index)
                  : current,
              )
            }
            plan={plan}
            services={services}
          />
        </FieldContent>
      </Field>
    </FieldGroup>
  );

  const submitButton = (
    <Button
      disabled={isPending || Boolean(slugError) || slugTaken}
      type="submit"
    >
      {isPending ? (
        <>
          <Spinner data-icon="inline-start" aria-hidden="true" />
          Creating...
        </>
      ) : (
        "Create"
      )}
    </Button>
  );

  if (standalone) {
    return (
      <form
        action={formAction}
        className="flex min-h-0 flex-1 flex-col gap-6"
      >
        <input name="businessType" type="hidden" value={businessType} />
        <input name="countryCode" type="hidden" value={countryCode} />
        <input name="slug" type="hidden" value={slug} />
        <input name="defaultCurrency" type="hidden" value={defaultCurrency} />
        <input name="businessId" type="hidden" value={businessId} />
        <input
          name="services"
          type="hidden"
          value={JSON.stringify(services)}
        />

        {fields}

        <div className="flex items-center justify-end pt-2">
          {submitButton}
        </div>
      </form>
    );
  }

  return (
    <form
      action={formAction}
      className="flex min-h-0 flex-1 flex-col"
    >
        <input name="businessType" type="hidden" value={businessType} />
        <input name="countryCode" type="hidden" value={countryCode} />
        <input name="slug" type="hidden" value={slug} />
        <input name="defaultCurrency" type="hidden" value={defaultCurrency} />
        <input name="businessId" type="hidden" value={businessId} />
        <input
          name="services"
          type="hidden"
          value={JSON.stringify(services)}
        />

        <DialogBody className="overflow-y-auto">
          {fields}
        </DialogBody>

        <DialogFooter>
          {submitButton}
        </DialogFooter>
      </form>
  );
}
