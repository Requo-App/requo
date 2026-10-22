"use client";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FeatureGate } from "@/features/entitlements";
import type { PlanTier } from "@/lib/plans/plans";

import { DetailsPanel, DisclosureSection } from "./shared";

export type ContentSectionProps = {
  headline: string;
  formTitle: string;
  thankYouMessage: string;
  eyebrow: string;
  brandTagline: string;
  description: string;
  formDescription: string;
  isPending: boolean;
  pageCustomizationLocked: boolean;
  plan: PlanTier;
  businessName: string;
  shortDescription: string | null;
  headlineError: string | undefined;
  formTitleError: string | undefined;
  thankYouMessageError: string | undefined;
  eyebrowError: string | undefined;
  brandTaglineError: string | undefined;
  descriptionError: string | undefined;
  formDescriptionError: string | undefined;
  onHeadlineChange: (value: string) => void;
  onFormTitleChange: (value: string) => void;
  onThankYouMessageChange: (value: string) => void;
  onEyebrowChange: (value: string) => void;
  onBrandTaglineChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onFormDescriptionChange: (value: string) => void;
};

export function ContentSection({
  headline,
  formTitle,
  thankYouMessage,
  eyebrow,
  brandTagline,
  description,
  formDescription,
  isPending,
  pageCustomizationLocked,
  plan,
  businessName,
  shortDescription,
  headlineError,
  formTitleError,
  thankYouMessageError,
  eyebrowError,
  brandTaglineError,
  descriptionError,
  formDescriptionError,
  onHeadlineChange,
  onFormTitleChange,
  onThankYouMessageChange,
  onEyebrowChange,
  onBrandTaglineChange,
  onDescriptionChange,
  onFormDescriptionChange,
}: ContentSectionProps) {
  return (
    <div className="flex flex-col gap-6">
        <DetailsPanel
          description="Shown above the form."
          eyebrow="Form"
          title="Heading and note"
        >
            <FieldGroup>
              <Field data-invalid={Boolean(headlineError) || undefined}>
                <FieldLabel htmlFor="service-page-headline">Headline</FieldLabel>
                <FieldContent>
                  <Textarea
                    disabled={isPending}
                    id="service-page-headline"
                    maxLength={120}
                    name="headline"
                    onChange={(event) => onHeadlineChange(event.currentTarget.value)}
                    placeholder={`Tell ${businessName} what you need.`}
                    required
                    rows={3}
                    value={headline}
                  />
                  <FieldError
                    errors={headlineError ? [{ message: headlineError }] : undefined}
                  />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(formTitleError) || undefined}>
                <FieldLabel htmlFor="service-page-form-title">Form heading</FieldLabel>
                <FieldContent>
                  <Input
                    aria-invalid={Boolean(formTitleError) || undefined}
                    disabled={isPending}
                    id="service-page-form-title"
                    maxLength={80}
                    name="formTitle"
                    onChange={(event) => onFormTitleChange(event.currentTarget.value)}
                    required
                    value={formTitle}
                  />
                  <FieldDescription>
                    Shown directly above the inquiry form fields.
                  </FieldDescription>
                  <FieldError
                    errors={
                      formTitleError ? [{ message: formTitleError }] : undefined
                    }
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </DetailsPanel>

          <DisclosureSection
            label="Customize page copy"
            description="Eyebrow, description, tagline, form note, and thank-you message."
          >
            <DetailsPanel
              description="Shown after a customer submits an inquiry."
              eyebrow="Confirmation"
              title="Thank you message"
            >
              <FieldGroup>
                <Field data-invalid={Boolean(thankYouMessageError) || undefined}>
                  <FieldLabel htmlFor="service-page-thank-you-message">
                    Custom message
                  </FieldLabel>
                  <FieldContent>
                    <FeatureGate variant="action" feature="servicePageCustomization" plan={plan}>
                      <Textarea
                        aria-invalid={Boolean(thankYouMessageError) || undefined}
                        disabled={isPending || pageCustomizationLocked}
                        id="service-page-thank-you-message"
                        maxLength={280}
                        name="thankYouMessage"
                        onChange={(event) =>
                          onThankYouMessageChange(event.currentTarget.value)
                        }
                        placeholder={`${businessName} will review your inquiry and follow up with a quote via your preferred contact method. Keep an eye on your inbox.`}
                        rows={3}
                        value={thankYouMessage}
                      />
                    </FeatureGate>
                    <FieldDescription>
                      Leave blank to use the default message. Customers see this after submitting.
                    </FieldDescription>
                    <FieldError
                      errors={
                        thankYouMessageError
                          ? [{ message: thankYouMessageError }]
                          : undefined
                      }
                    />
                  </FieldContent>
                </Field>
              </FieldGroup>
            </DetailsPanel>

            <DetailsPanel
              description="Shown at the top of the page and above the form."
              eyebrow="Page copy"
              title="Intro and form note"
            >
              <FieldGroup>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
                  <Field data-invalid={Boolean(eyebrowError) || undefined}>
                    <FieldLabel htmlFor="service-page-eyebrow">Eyebrow</FieldLabel>
                    <FieldContent>
                      <Input
                        disabled={isPending}
                        id="service-page-eyebrow"
                        maxLength={48}
                        name="eyebrow"
                        onChange={(event) => onEyebrowChange(event.currentTarget.value)}
                        placeholder="Inquiry page"
                        value={eyebrow}
                      />
                      <FieldError
                        errors={eyebrowError ? [{ message: eyebrowError }] : undefined}
                      />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(brandTaglineError) || undefined}>
                    <FieldLabel htmlFor="service-page-brand-tagline">
                      Page tagline override
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        disabled={isPending}
                        id="service-page-brand-tagline"
                        maxLength={120}
                        name="brandTagline"
                        onChange={(event) =>
                          onBrandTaglineChange(event.currentTarget.value)
                        }
                        placeholder="Optional page tagline"
                        value={brandTagline}
                      />
                      <FieldDescription>
                        {brandTagline.trim()
                          ? "Only this inquiry page uses this tagline."
                          : shortDescription
                            ? "Leaving this blank uses the business description from General Settings."
                            : "Leave blank to use the business description from General Settings."}
                      </FieldDescription>
                      <FieldError
                        errors={
                          brandTaglineError
                            ? [{ message: brandTaglineError }]
                            : undefined
                        }
                      />
                    </FieldContent>
                  </Field>
                </div>

                <Field data-invalid={Boolean(descriptionError) || undefined}>
                  <FieldLabel htmlFor="service-page-description">
                    Description
                  </FieldLabel>
                  <FieldContent>
                    <Textarea
                      disabled={isPending}
                      id="service-page-description"
                      maxLength={280}
                      name="description"
                      onChange={(event) =>
                        onDescriptionChange(event.currentTarget.value)
                      }
                      placeholder="Tell customers what helps you review the request."
                      rows={4}
                      value={description}
                    />
                    <FieldError
                      errors={
                        descriptionError ? [{ message: descriptionError }] : undefined
                      }
                    />
                  </FieldContent>
                </Field>

                <Field data-invalid={Boolean(formDescriptionError) || undefined}>
                  <FieldLabel htmlFor="service-page-form-description">
                    Form note
                  </FieldLabel>
                  <FieldContent>
                    <Textarea
                      aria-invalid={Boolean(formDescriptionError) || undefined}
                      disabled={isPending}
                      id="service-page-form-description"
                      maxLength={200}
                      name="formDescription"
                      onChange={(event) =>
                        onFormDescriptionChange(event.currentTarget.value)
                      }
                      placeholder="Optional note above the form"
                      rows={3}
                      value={formDescription}
                    />
                    <FieldDescription>
                      Leave blank if the heading is enough on its own.
                    </FieldDescription>
                    <FieldError
                      errors={
                        formDescriptionError
                          ? [{ message: formDescriptionError }]
                          : undefined
                      }
                    />
                  </FieldContent>
                </Field>
              </FieldGroup>
            </DetailsPanel>
          </DisclosureSection>

    </div>
  );
}
