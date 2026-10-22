"use client";

import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  inquiryPageBusinessContactSocialMeta,
} from "@/features/inquiries/page-config";

import { DetailsPanel, DisclosureSection, SectionVisibilityToggle } from "./shared";

export type ContactSectionProps = {
  showBusinessContact: boolean;
  businessContactPhone: string;
  businessContactEmail: string;
  businessFacebookUrl: string;
  businessInstagramUrl: string;
  businessTwitterXUrl: string;
  businessLinkedinUrl: string;
  isPending: boolean;
  businessContactPhoneError: string | undefined;
  businessContactEmailError: string | undefined;
  businessFacebookUrlError: string | undefined;
  businessInstagramUrlError: string | undefined;
  businessTwitterXUrlError: string | undefined;
  businessLinkedinUrlError: string | undefined;
  onShowBusinessContactChange: (nextValue: boolean) => void;
  onBusinessContactPhoneChange: (value: string) => void;
  onBusinessContactEmailChange: (value: string) => void;
  onBusinessFacebookUrlChange: (value: string) => void;
  onBusinessInstagramUrlChange: (value: string) => void;
  onBusinessTwitterXUrlChange: (value: string) => void;
  onBusinessLinkedinUrlChange: (value: string) => void;
};

export function ContactSection({
  showBusinessContact,
  businessContactPhone,
  businessContactEmail,
  businessFacebookUrl,
  businessInstagramUrl,
  businessTwitterXUrl,
  businessLinkedinUrl,
  isPending,
  businessContactPhoneError,
  businessContactEmailError,
  businessFacebookUrlError,
  businessInstagramUrlError,
  businessTwitterXUrlError,
  businessLinkedinUrlError,
  onShowBusinessContactChange,
  onBusinessContactPhoneChange,
  onBusinessContactEmailChange,
  onBusinessFacebookUrlChange,
  onBusinessInstagramUrlChange,
  onBusinessTwitterXUrlChange,
  onBusinessLinkedinUrlChange,
}: ContactSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <SectionVisibilityToggle
          checked={showBusinessContact}
          description="Keep the contact details saved, but hide the business contact block on the public form when this is off."
          disabled={isPending}
          label="Show business contact"
          onCheckedChange={onShowBusinessContactChange}
        />

        <DetailsPanel
          description="Phone, email, and social links appear when visibility is on."
          eyebrow="Contact"
          title="Details"
        >
          <FieldGroup>
            <div className="grid gap-5 lg:grid-cols-2">
              <Field
                data-invalid={Boolean(businessContactPhoneError) || undefined}
              >
                <FieldLabel htmlFor="service-page-business-contact-phone">
                  Phone number
                </FieldLabel>
                <FieldContent>
                  <Input
                    aria-invalid={Boolean(businessContactPhoneError) || undefined}
                    disabled={isPending}
                    id="service-page-business-contact-phone"
                    inputMode="tel"
                    maxLength={40}
                    name="businessContactPhone"
                    onChange={(event) =>
                      onBusinessContactPhoneChange(event.currentTarget.value)
                    }
                    placeholder="+1 (555) 123-4567"
                    value={businessContactPhone}
                  />
                  <FieldError
                    errors={
                      businessContactPhoneError
                        ? [{ message: businessContactPhoneError }]
                        : undefined
                    }
                  />
                </FieldContent>
              </Field>

              <Field
                data-invalid={Boolean(businessContactEmailError) || undefined}
              >
                <FieldLabel htmlFor="service-page-business-contact-email">
                  Email
                </FieldLabel>
                <FieldContent>
                  <Input
                    aria-invalid={Boolean(businessContactEmailError) || undefined}
                    disabled={isPending}
                    id="service-page-business-contact-email"
                    maxLength={320}
                    name="businessContactEmail"
                    onChange={(event) =>
                      onBusinessContactEmailChange(event.currentTarget.value)
                    }
                    placeholder="hello@example.com"
                    type="email"
                    value={businessContactEmail}
                  />
                  <FieldError
                    errors={
                      businessContactEmailError
                        ? [{ message: businessContactEmailError }]
                        : undefined
                    }
                  />
                </FieldContent>
              </Field>
            </div>

            <DisclosureSection
              label="Social links"
              description="Add links to your social profiles."
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <Field
                  data-invalid={Boolean(businessFacebookUrlError) || undefined}
                >
                  <FieldLabel htmlFor="service-page-business-facebook-url">
                    {inquiryPageBusinessContactSocialMeta.facebook.label}
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      aria-invalid={Boolean(businessFacebookUrlError) || undefined}
                      disabled={isPending}
                      id="service-page-business-facebook-url"
                      maxLength={2000}
                      name="businessFacebookUrl"
                      onChange={(event) =>
                        onBusinessFacebookUrlChange(event.currentTarget.value)
                      }
                      placeholder={
                        inquiryPageBusinessContactSocialMeta.facebook.placeholder
                      }
                      type="url"
                      value={businessFacebookUrl}
                    />
                    <FieldError
                      errors={
                        businessFacebookUrlError
                          ? [{ message: businessFacebookUrlError }]
                          : undefined
                      }
                    />
                  </FieldContent>
                </Field>

                <Field
                  data-invalid={Boolean(businessInstagramUrlError) || undefined}
                >
                  <FieldLabel htmlFor="service-page-business-instagram-url">
                    {inquiryPageBusinessContactSocialMeta.instagram.label}
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      aria-invalid={Boolean(businessInstagramUrlError) || undefined}
                      disabled={isPending}
                      id="service-page-business-instagram-url"
                      maxLength={2000}
                      name="businessInstagramUrl"
                      onChange={(event) =>
                        onBusinessInstagramUrlChange(event.currentTarget.value)
                      }
                      placeholder={
                        inquiryPageBusinessContactSocialMeta.instagram.placeholder
                      }
                      type="url"
                      value={businessInstagramUrl}
                    />
                    <FieldError
                      errors={
                        businessInstagramUrlError
                          ? [{ message: businessInstagramUrlError }]
                          : undefined
                      }
                    />
                  </FieldContent>
                </Field>

                <Field
                  data-invalid={Boolean(businessTwitterXUrlError) || undefined}
                >
                  <FieldLabel htmlFor="service-page-business-twitter-x-url">
                    {inquiryPageBusinessContactSocialMeta.twitterX.label}
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      aria-invalid={Boolean(businessTwitterXUrlError) || undefined}
                      disabled={isPending}
                      id="service-page-business-twitter-x-url"
                      maxLength={2000}
                      name="businessTwitterXUrl"
                      onChange={(event) =>
                        onBusinessTwitterXUrlChange(event.currentTarget.value)
                      }
                      placeholder={
                        inquiryPageBusinessContactSocialMeta.twitterX.placeholder
                      }
                      type="url"
                      value={businessTwitterXUrl}
                    />
                    <FieldError
                      errors={
                        businessTwitterXUrlError
                          ? [{ message: businessTwitterXUrlError }]
                          : undefined
                      }
                    />
                  </FieldContent>
                </Field>

                <Field
                  data-invalid={Boolean(businessLinkedinUrlError) || undefined}
                >
                  <FieldLabel htmlFor="service-page-business-linkedin-url">
                    {inquiryPageBusinessContactSocialMeta.linkedin.label}
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      aria-invalid={Boolean(businessLinkedinUrlError) || undefined}
                      disabled={isPending}
                      id="service-page-business-linkedin-url"
                      maxLength={2000}
                      name="businessLinkedinUrl"
                      onChange={(event) =>
                        onBusinessLinkedinUrlChange(event.currentTarget.value)
                      }
                      placeholder={
                        inquiryPageBusinessContactSocialMeta.linkedin.placeholder
                      }
                      type="url"
                      value={businessLinkedinUrl}
                    />
                    <FieldError
                      errors={
                        businessLinkedinUrlError
                          ? [{ message: businessLinkedinUrlError }]
                          : undefined
                      }
                    />
                  </FieldContent>
                </Field>
              </div>
            </DisclosureSection>
          </FieldGroup>
        </DetailsPanel>
    </div>
  );
}
