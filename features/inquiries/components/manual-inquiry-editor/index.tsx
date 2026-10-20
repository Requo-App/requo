"use client";

import { useActionState, useDeferredValue, useMemo, useState } from "react";
import { toast } from "@/components/shared/notify";

import {
  DashboardMetaPill,
  DashboardSection,
  DashboardSidebarStack,
} from "@/components/shared/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  getInquiryFormFieldInputName,
  inquiryContactMethodLabels,
  type InquiryContactMethod,
  type InquiryFormSystemFieldDefinition,
} from "@/features/inquiries/form-config";
import { createManualQuickInquiryFormConfig } from "@/features/inquiries/schemas";
import { InquiryAttachmentUploader } from "@/features/inquiries/components/inquiry-attachment-uploader";
import type { PublicInquiryAttachmentToken } from "@/features/inquiries/components/inquiry-attachment-uploader";
import type { ManualInquiryActionState } from "@/features/inquiries/types";
import { ContactHandleInput } from "./contact-handle-input";
import { contactMethodOptions, initialState } from "./constants";
import { FieldLabelText } from "./field-label-text";
import { ManualInquiryPreview } from "./manual-inquiry-preview";
import { ManualProjectField } from "./manual-project-field";
import type { ManualInquiryEditorProps, ProjectValues } from "./types";

export function ManualInquiryEditor({
  action,
  businessName,
  businessSlug,
  forms,
  initialFormSlug,
  uploadHelpText,
}: ManualInquiryEditorProps) {
  const [selectedFormSlug, setSelectedFormSlug] = useState(initialFormSlug);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerContactMethod, setCustomerContactMethod] =
    useState<InquiryContactMethod>("email");
  const [customerContactHandle, setCustomerContactHandle] = useState("");
  const [projectValues, setProjectValues] = useState<ProjectValues>({});
  const [attachment, setAttachment] =
    useState<PublicInquiryAttachmentToken | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [fileInputResetKey, setFileInputResetKey] = useState(0);
  const deferredCustomerName = useDeferredValue(customerName);
  const deferredCustomerEmail = useDeferredValue(customerEmail);
  const deferredCustomerContactMethod = useDeferredValue(customerContactMethod);
  const deferredCustomerContactHandle = useDeferredValue(customerContactHandle);
  const deferredProjectValues = useDeferredValue(projectValues);

  const [state, formAction, isPending] = useActionState(
    async (prevState: ManualInquiryActionState, formData: FormData) => {
      const nextState = await action(prevState, formData);
      const firstFieldError = nextState.fieldErrors
        ? Object.values(nextState.fieldErrors).find((errors) => errors?.[0])?.[0]
        : undefined;

      if (firstFieldError || nextState.error) {
        toast.error(firstFieldError ?? nextState.error ?? "Check the form and try again.");
      }

      return nextState;
    },
    initialState,
  );

  const selectedForm = useMemo(
    () => forms.find((form) => form.slug === selectedFormSlug) ?? forms[0],
    [forms, selectedFormSlug],
  );
  const quickInquiryFormConfig = useMemo(
    () => createManualQuickInquiryFormConfig(selectedForm.inquiryFormConfig),
    [selectedForm],
  );
  const formOptions = useMemo(
    () =>
      forms.map((form) => ({
        label: form.isDefault ? `${form.name} (Default)` : form.name,
        searchText: `${form.name} ${form.slug}`,
        value: form.slug,
      })),
    [forms],
  );
  const projectFields = useMemo(
    () =>
      quickInquiryFormConfig.projectFields.filter(
        (field) =>
          field.kind === "custom" ||
          (field.kind === "system" &&
            field.enabled &&
            field.key !== "attachment"),
      ),
    [quickInquiryFormConfig],
  );
  const attachmentField = useMemo(
    () =>
      quickInquiryFormConfig.projectFields.find(
        (field): field is InquiryFormSystemFieldDefinition =>
          field.kind === "system" &&
          field.key === "attachment" &&
          field.enabled,
      ) ?? null,
    [quickInquiryFormConfig],
  );
  function getFieldMessage(fieldName: string) {
    return state.fieldErrors?.[fieldName]?.[0];
  }

  function getProjectMultiValue(fieldName: string) {
    const value = projectValues[fieldName];
    return Array.isArray(value) ? value : [];
  }

  function setProjectValue(fieldName: string, value: string | string[] | undefined) {
    setProjectValues((currentValues) => ({
      ...currentValues,
      [fieldName]: value,
    }));
  }

  function handleFormChange(nextFormSlug: string) {
    setSelectedFormSlug(nextFormSlug);
    setAttachment(null);
    setAttachmentError(null);
    setFileInputResetKey((currentValue) => currentValue + 1);
  }

  return (
    <form
      action={formAction}
      className="dashboard-detail-layout items-start xl:grid-cols-[minmax(0,1.08fr)_0.92fr]"
    >
      <input name="formSlug" type="hidden" value={selectedForm.slug} />

      <DashboardSidebarStack className="min-w-0">
        <DashboardSection
          action={<DashboardMetaPill>{selectedForm.slug}</DashboardMetaPill>}
          contentClassName="flex flex-col gap-5"
          description="Choose the intake form this manual inquiry should follow."
          title="Intake setup"
        >
          <Field data-invalid={Boolean(getFieldMessage("formSlug")) || undefined}>
            <FieldLabel htmlFor="manual-inquiry-form">Inquiry form</FieldLabel>
            <FieldContent>
              <Combobox
                aria-invalid={Boolean(getFieldMessage("formSlug"))}
                disabled={isPending}
                id="manual-inquiry-form"
                onValueChange={(value) => handleFormChange(value)}
                options={formOptions}
                placeholder="Choose an inquiry form"
                searchable
                searchPlaceholder="Search forms"
                value={selectedForm.slug}
              />
              <FieldDescription>
                Switch forms if this inquiry belongs to a different intake flow.
              </FieldDescription>
              <FieldError
                errors={
                  getFieldMessage("formSlug")
                    ? [{ message: getFieldMessage("formSlug")! }]
                    : undefined
                }
              />
            </FieldContent>
          </Field>
        </DashboardSection>

        <DashboardSection
          contentClassName="flex flex-col gap-5"
          description="Add the customer's name and best way to reply."
          title={selectedForm.inquiryFormConfig.groupLabels.contact}
        >
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(getFieldMessage("customerName")) || undefined}>
                <FieldLabel htmlFor="manual-inquiry-customer-name">
                  <FieldLabelText label="Customer name" required />
                </FieldLabel>
                <FieldContent>
                  <Input
                    disabled={isPending}
                    id="manual-inquiry-customer-name"
                    maxLength={120}
                    minLength={2}
                    name="customerName"
                    onChange={(event) => setCustomerName(event.currentTarget.value)}
                    placeholder="Jordan Rivera"
                    required
                    value={customerName}
                  />
                  <FieldError
                    errors={
                      getFieldMessage("customerName")
                        ? [{ message: getFieldMessage("customerName")! }]
                        : undefined
                    }
                  />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(getFieldMessage("customerEmail")) || undefined}>
                <FieldLabel htmlFor="manual-inquiry-customer-email">
                  <FieldLabelText label="Email" required />
                </FieldLabel>
                <FieldContent>
                  <Input
                    autoComplete="email"
                    disabled={isPending}
                    id="manual-inquiry-customer-email"
                    maxLength={320}
                    name="customerEmail"
                    onChange={(event) => setCustomerEmail(event.currentTarget.value)}
                    placeholder="jordan@example.com"
                    required
                    type="email"
                    value={customerEmail}
                  />
                  <FieldError
                    errors={
                      getFieldMessage("customerEmail")
                        ? [{ message: getFieldMessage("customerEmail")! }]
                        : undefined
                    }
                  />
                </FieldContent>
              </Field>

              <Field
                data-invalid={
                  Boolean(getFieldMessage("customerContactMethod")) || undefined
                }
              >
                <FieldLabel htmlFor="manual-inquiry-contact-method">
                  <FieldLabelText label="Preferred contact method" required />
                </FieldLabel>
                <FieldContent>
                  <input
                    name="customerContactMethod"
                    type="hidden"
                    value={customerContactMethod}
                  />
                  <Combobox
                    aria-invalid={Boolean(getFieldMessage("customerContactMethod"))}
                    disabled={isPending}
                    id="manual-inquiry-contact-method"
                    onValueChange={(value) =>
                      setCustomerContactMethod(value as InquiryContactMethod)
                    }
                    options={contactMethodOptions}
                    placeholder="Choose how to reach them"
                    value={customerContactMethod}
                  />
                  <FieldError
                    errors={
                      getFieldMessage("customerContactMethod")
                        ? [{ message: getFieldMessage("customerContactMethod")! }]
                        : undefined
                    }
                  />
                </FieldContent>
              </Field>

              {customerContactMethod !== "email" ? (
                <Field
                  data-invalid={
                    Boolean(getFieldMessage("customerContactHandle")) || undefined
                  }
                >
                  <FieldLabel htmlFor="manual-inquiry-contact-handle">
                    <FieldLabelText
                      label={inquiryContactMethodLabels[customerContactMethod]}
                      required
                    />
                  </FieldLabel>
                  <FieldContent>
                    <ContactHandleInput
                      contactMethod={customerContactMethod}
                      disabled={isPending}
                      onChange={setCustomerContactHandle}
                      value={customerContactHandle}
                    />
                    <FieldError
                      errors={
                        getFieldMessage("customerContactHandle")
                          ? [{ message: getFieldMessage("customerContactHandle")! }]
                          : undefined
                      }
                    />
                  </FieldContent>
                </Field>
              ) : null}
            </div>
          </FieldGroup>
        </DashboardSection>

        <DashboardSection
          contentClassName="flex flex-col gap-5"
          description="Capture the request clearly enough to reply, quote, or follow up."
          title="Request details"
        >
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              {projectFields.map((field) => {
                const inputName = getInquiryFormFieldInputName(field);

                return (
                  <ManualProjectField
                    key={`${selectedForm.slug}:${inputName}`}
                    error={getFieldMessage(inputName)}
                    field={field}
                    isPending={isPending}
                    onMultiValueChange={(optionValue, checked) => {
                      const nextValue = new Set(getProjectMultiValue(inputName));

                      if (checked) {
                        nextValue.add(optionValue);
                      } else {
                        nextValue.delete(optionValue);
                      }

                      setProjectValue(
                        inputName,
                        nextValue.size ? Array.from(nextValue) : undefined,
                      );
                    }}
                    onValueChange={(value) => setProjectValue(inputName, value)}
                    value={projectValues[inputName]}
                  />
                );
              })}
            </div>
          </FieldGroup>
        </DashboardSection>

        {attachmentField ? (
          <DashboardSection
            contentClassName="flex flex-col gap-5"
            description="Optional files or references that belong with this inquiry."
            title={attachmentField.label}
          >
            <Field
              data-invalid={
                Boolean(attachmentError) ||
                Boolean(getFieldMessage("attachment")) ||
                undefined
              }
            >
              <FieldLabel htmlFor="manual-inquiry-attachment">
                <FieldLabelText label={attachmentField.label} />
              </FieldLabel>
              <FieldContent>
                <InquiryAttachmentUploader
                  businessSlug={businessSlug}
                  disabled={isPending}
                  formSlug={selectedForm.slug}
                  helpText={uploadHelpText}
                  id="manual-inquiry-attachment"
                  onChange={setAttachment}
                  onError={setAttachmentError}
                  resetKey={`${selectedForm.slug}:${fileInputResetKey}`}
                  value={attachment}
                />
                <FieldError
                  errors={
                    attachmentError
                      ? [{ message: attachmentError }]
                      : getFieldMessage("attachment")
                        ? [{ message: getFieldMessage("attachment")! }]
                        : undefined
                  }
                />
              </FieldContent>
            </Field>
          </DashboardSection>
        ) : null}

        <DashboardSection
          contentClassName="flex flex-col gap-4"
          footer={
            <Button
              disabled={isPending || Boolean(attachmentError)}
              size="lg"
              type="submit"
            >
              {isPending ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                  Creating inquiry...
                </>
              ) : (
                "Create"
              )}
            </Button>
          }
          footerClassName="w-full sm:justify-between"
          title="Save inquiry"
        >
          <div className="soft-panel flex flex-col gap-3 shadow-none">
            <p className="text-sm font-medium text-foreground">
              This will be saved as a new inquiry in {businessName}.
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Use this when an inquiry arrives through phone, chat, walk-ins, or
              any channel outside your public inquiry page.
            </p>
          </div>
        </DashboardSection>
      </DashboardSidebarStack>

      <ManualInquiryPreview
        customerContactHandle={deferredCustomerContactHandle}
        customerContactMethod={deferredCustomerContactMethod}
        customerEmail={deferredCustomerEmail}
        customerName={deferredCustomerName}
        projectFields={projectFields}
        projectValues={deferredProjectValues}
        selectedFileName={attachment?.fileName ?? null}
        selectedForm={selectedForm}
      />
    </form>
  );
}
