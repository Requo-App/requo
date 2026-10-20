"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";

import { FormActions, FormSection } from "@/components/shared/form-layout";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import {
  getInquiryContactHandleUrlPrefix,
  getInquiryFormFieldInputName,
  inquiryContactMethods,
  inquiryContactMethodLabels,
  normalizeInquiryContactHandleEditableValue,
  type InquiryContactMethod,
  type InquiryFormFieldDefinition,
  type InquiryFormSystemFieldDefinition,
} from "@/features/inquiries/form-config";
import { getPublicInquiryAttachmentHelpText } from "@/features/inquiries/plan-rules";
import type {
  PublicInquiryFormState,
  PublicInquiryBusiness,
} from "@/features/inquiries/types";
import { InquiryAttachmentUploader } from "@/features/inquiries/components/inquiry-attachment-uploader";
import type { PublicInquiryAttachmentToken } from "@/features/inquiries/components/inquiry-attachment-uploader";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { cn } from "@/lib/utils";

type PublicInquiryFormProps = {
  business: PublicInquiryBusiness;
  action: (
    state: PublicInquiryFormState,
    formData: FormData,
  ) => Promise<PublicInquiryFormState>;
  previewMode?: boolean;
};

const initialState: PublicInquiryFormState = {};

const contactMethodOptions = inquiryContactMethods.map((method) => ({
  label: inquiryContactMethodLabels[method],
  value: method,
}));

// Standard contact handle placeholders used across all inquiry forms
function getContactHandlePlaceholder(method: InquiryContactMethod) {
  switch (method) {
    case "email":
      return "your@email.com";
    case "phone":
      return "+1 234 567 8900";
    case "facebook":
      return "your.page";
    case "instagram":
      return "@yourhandle";
    case "whatsapp":
      return "+1 234 567 8900";
    case "other":
      return "How should we reach you?";
  }
}

function getContactHandleInputType(method: InquiryContactMethod) {
  switch (method) {
    case "email":
      return "email";
    case "phone":
    case "whatsapp":
      return "tel";
    default:
      return "text";
  }
}

function getContactHandleInputMode(method: InquiryContactMethod) {
  switch (method) {
    case "email":
      return "email" as const;
    case "phone":
    case "whatsapp":
      return "tel" as const;
    default:
      return "text" as const;
  }
}

function getProjectFieldMaxLength(field: InquiryFormFieldDefinition) {
  if (field.kind === "system") {
    switch (field.key) {
      case "budgetText":
        return 120;
      case "details":
        return 4000;
      default:
        return undefined;
    }
  }

  switch (field.fieldType) {
    case "short_text":
      return 160;
    case "long_text":
      return 4000;
    default:
      return undefined;
  }
}

export function PublicInquiryForm({
  business,
  action,
  previewMode = false,
}: PublicInquiryFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [state, formAction, isPending] = useActionStateWithSonner(
    action,
    initialState,
  );
  const [attachment, setAttachment] =
    useState<PublicInquiryAttachmentToken | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [contactMethod, setContactMethod] = useState<InquiryContactMethod>("email");
  const [contactHandle, setContactHandle] = useState("");
  const inquiryFormConfig = business.inquiryFormConfig;
  const attachmentHelpText = getPublicInquiryAttachmentHelpText(business.plan);
  const customerNameField = inquiryFormConfig.contactFields.customerName;
  const emailField = inquiryFormConfig.contactFields.email;
  const preferredContactField = inquiryFormConfig.contactFields.preferredContact;
  const attachmentField = useMemo<InquiryFormSystemFieldDefinition | null>(
    () =>
      inquiryFormConfig.projectFields.find(
        (field): field is InquiryFormSystemFieldDefinition =>
          field.kind === "system" &&
          field.key === "attachment" &&
          field.enabled,
      ) ?? null,
    [inquiryFormConfig.projectFields],
  );
  const projectFields = useMemo(
    () =>
      inquiryFormConfig.projectFields.filter(
        (field) =>
          field.kind === "custom" ||
          (field.kind === "system" &&
            field.enabled &&
            field.key !== "attachment"),
      ),
    [inquiryFormConfig.projectFields],
  );
  const groupLabels = inquiryFormConfig.groupLabels;
  const contactHandlePrefix = getInquiryContactHandleUrlPrefix(contactMethod);

  function getFieldMessage(fieldName: string) {
    return state.fieldErrors?.[fieldName]?.[0];
  }

  const syncCanSubmit = useCallback(() => {
    if (previewMode) {
      setCanSubmit(true);
      return;
    }

    const form = formRef.current;
    setCanSubmit(form ? form.checkValidity() : false);
  }, [previewMode]);

  function setNormalizedContactHandle(
    method: InquiryContactMethod,
    value: string,
  ) {
    setContactHandle(normalizeInquiryContactHandleEditableValue(method, value));
  }

  // Re-check validity whenever the contact method or handle changes.
  // Switching to a non-email method reveals a newly required contact-handle
  // field, and the handle is normalized on the way in — both change the
  // form's validity without a user-typed change event. A microtask ran
  // before React committed the new markup, so the check read the previous
  // DOM and left the submit button enabled.
  useEffect(() => {
    // Reads the rendered form's validity, which only changes after React
    // commits the new markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncCanSubmit();
  }, [contactHandle, contactMethod, syncCanSubmit]);

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className="form-stack"
        onChangeCapture={syncCanSubmit}
        onInputCapture={syncCanSubmit}
        onSubmit={(event) => {
          if (!previewMode) {
            return;
          }

          event.preventDefault();
          setIsPreviewDialogOpen(true);
        }}
      >
        <FormSection title={groupLabels.contact}>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(getFieldMessage("customerName")) || undefined}>
                <FieldLabel htmlFor="inquiry-customerName">
                  <FieldLabelText
                    label={customerNameField.label}
                    required={customerNameField.required}
                  />
                </FieldLabel>
                <FieldContent>
                  <Input
                    autoComplete="name"
                    disabled={isPending}
                    id="inquiry-customerName"
                    maxLength={120}
                    minLength={2}
                    name="customerName"
                    placeholder={customerNameField.placeholder}
                    required={customerNameField.required}
                  />
                  <FieldError errors={getFieldMessage("customerName") ? [{ message: getFieldMessage("customerName")! }] : undefined} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(getFieldMessage("customerEmail")) || undefined}>
                <FieldLabel htmlFor="inquiry-customerEmail">
                  <FieldLabelText
                    label={emailField?.label ?? "Email"}
                    required
                  />
                </FieldLabel>
                <FieldContent>
                  <Input
                    autoComplete="email"
                    disabled={isPending}
                    id="inquiry-customerEmail"
                    maxLength={320}
                    name="customerEmail"
                    placeholder={emailField?.placeholder ?? "you@example.com"}
                    required
                    type="email"
                  />
                  <FieldError errors={getFieldMessage("customerEmail") ? [{ message: getFieldMessage("customerEmail")! }] : undefined} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(getFieldMessage("customerContactMethod")) || undefined}>
                <FieldLabel htmlFor="inquiry-contactMethod">
                  <FieldLabelText
                    label={preferredContactField.label}
                    required={preferredContactField.required}
                  />
                </FieldLabel>
                <FieldContent>
                  <input type="hidden" name="customerContactMethod" value={contactMethod} />
                  <Combobox
                    id="inquiry-contactMethod"
                    disabled={isPending}
                    options={contactMethodOptions}
                    placeholder={
                      preferredContactField.placeholder ?? "Choose how to reach you"
                    }
                    value={contactMethod}
                    onValueChange={(value) => {
                      const nextMethod = value as InquiryContactMethod;
                      setContactMethod(nextMethod);
                      setContactHandle("");
                    }}
                    aria-invalid={Boolean(getFieldMessage("customerContactMethod"))}
                  />
                  <FieldError errors={getFieldMessage("customerContactMethod") ? [{ message: getFieldMessage("customerContactMethod")! }] : undefined} />
                </FieldContent>
              </Field>

              {contactMethod !== "email" ? (
                <Field
                  data-invalid={Boolean(getFieldMessage("customerContactHandle")) || undefined}
                >
                  <FieldLabel htmlFor="inquiry-contactHandle">
                    <FieldLabelText label={inquiryContactMethodLabels[contactMethod]} required />
                  </FieldLabel>
                  <FieldContent>
                    {contactHandlePrefix ? (
                      <PrefixedContactHandleInput
                        ariaInvalid={Boolean(getFieldMessage("customerContactHandle"))}
                        disabled={isPending}
                        id="inquiry-contactHandle"
                        inputMode={getContactHandleInputMode(contactMethod)}
                        maxLength={320}
                        name="customerContactHandle"
                        onBlur={() =>
                          setNormalizedContactHandle(contactMethod, contactHandle)
                        }
                        onChange={setContactHandle}
                        onPaste={(value) =>
                          setNormalizedContactHandle(contactMethod, value)
                        }
                        placeholder={getContactHandlePlaceholder(contactMethod)}
                        prefix={contactHandlePrefix}
                        required={preferredContactField.required}
                        value={contactHandle}
                      />
                    ) : (
                      <Input
                        disabled={isPending}
                        id="inquiry-contactHandle"
                        inputMode={getContactHandleInputMode(contactMethod)}
                        maxLength={320}
                        name="customerContactHandle"
                        onBlur={(event) =>
                          setNormalizedContactHandle(
                            contactMethod,
                            event.currentTarget.value,
                          )
                        }
                        onChange={(event) =>
                          setContactHandle(event.currentTarget.value)
                        }
                        placeholder={getContactHandlePlaceholder(contactMethod)}
                        required={preferredContactField.required}
                        type={getContactHandleInputType(contactMethod)}
                        value={contactHandle}
                      />
                    )}
                    <FieldError errors={getFieldMessage("customerContactHandle") ? [{ message: getFieldMessage("customerContactHandle")! }] : undefined} />
                  </FieldContent>
                </Field>
              ) : null}
            </div>
          </FieldGroup>
        </FormSection>

        {projectFields.length ? (
          <FormSection title={groupLabels.project}>
            <FieldGroup>
              <div className="grid gap-5 sm:grid-cols-2">
                {projectFields.map((field) => {
                  const inputName = getInquiryFormFieldInputName(field);

                  return (
                    <ProjectField
                      key={inputName}
                      error={getFieldMessage(inputName)}
                      field={field}
                      isPending={isPending}
                    />
                  );
                })}
              </div>
            </FieldGroup>
          </FormSection>
        ) : null}

        {attachmentField ? (
          <FormSection title={attachmentField.label}>
            <FieldGroup>
              <Field
                data-invalid={
                  Boolean(attachmentError) ||
                  Boolean(getFieldMessage("attachment")) ||
                  undefined
                }
              >
                <FieldLabel htmlFor="inquiry-attachment">
                  <FieldLabelText label={attachmentField.label} required={false} />
                </FieldLabel>
                <FieldContent>
                  <InquiryAttachmentUploader
                    businessSlug={business.slug}
                    disabled={isPending}
                    formSlug={business.form.slug}
                    helpText={attachmentHelpText}
                    id="inquiry-attachment"
                    onChange={setAttachment}
                    onError={setAttachmentError}
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
            </FieldGroup>
          </FormSection>
        ) : null}

        {/*
          Honeypot. Kept out of the accessibility tree and out of the
          browser's autofill heuristics: a field that a screen reader can
          reach, or that Chrome fills with a saved site URL, silently
          discards a real customer's inquiry. The name deliberately
          matches no autofill target.
        */}
        <div
          aria-hidden="true"
          className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
        >
          <label htmlFor="company-fax-number">Leave this field empty</label>
          <input
            id="company-fax-number"
            name="company_fax_number"
            type="text"
            tabIndex={-1}
            autoComplete="new-password"
          />
        </div>

        <div className="toolbar-panel">
          <FormActions align="between" className="pt-0">
            <p className="text-sm leading-6 text-muted-foreground">
              {previewMode
                ? "Preview only. Inquiry submission is disabled on this page."
                : `Sent to ${business.name}.`}
            </p>
            <Button
              className="w-full sm:w-auto"
              disabled={
                !previewMode &&
                (isPending || !canSubmit || Boolean(attachmentError))
              }
              onClick={
                previewMode ? () => setIsPreviewDialogOpen(true) : undefined
              }
              type={previewMode ? "button" : "submit"}
              size="lg"
            >
              {previewMode ? (
                "Preview only"
              ) : isPending ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                  Sending inquiry...
                </>
              ) : (
                "Send"
              )}
            </Button>
          </FormActions>
        </div>
      </form>

      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>This is a preview</DialogTitle>
            <DialogDescription>
              This preview lets you review the layout, fields, and copy only.
              Open the live page to send a real inquiry.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setIsPreviewDialogOpen(false)} type="button">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PrefixedContactHandleInput({
  ariaInvalid,
  disabled,
  id,
  inputMode,
  maxLength,
  name,
  onBlur,
  onChange,
  onPaste,
  placeholder,
  prefix,
  required,
  value,
}: {
  ariaInvalid: boolean;
  disabled: boolean;
  id: string;
  inputMode: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength: number;
  name: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  onPaste: (value: string) => void;
  placeholder: string;
  prefix: string;
  required: boolean;
  value: string;
}) {
  return (
    <div
      className={cn(
        "control-surface flex h-10 w-full min-w-0 overflow-hidden rounded-lg border border-input/95 transition-[border-color,background-color,box-shadow] focus-within:border-ring focus-within:bg-[var(--control-bg-strong)] focus-within:ring-4 focus-within:ring-ring/15",
        ariaInvalid && "border-destructive ring-4 ring-destructive/10",
        disabled && "pointer-events-none bg-muted/70 opacity-50 shadow-none",
      )}
    >
      <span className="flex shrink-0 items-center border-r border-border/70 px-3 text-sm text-muted-foreground">
        {prefix}
      </span>
      <input
        aria-invalid={ariaInvalid || undefined}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground/90 md:text-sm"
        disabled={disabled}
        id={id}
        inputMode={inputMode}
        maxLength={maxLength}
        name={name}
        onBlur={onBlur}
        onChange={(event) => onChange(event.currentTarget.value)}
        onPaste={(event) => {
          const pastedText = event.clipboardData.getData("text");

          if (!pastedText) {
            return;
          }

          event.preventDefault();
          onPaste(pastedText);
        }}
        placeholder={placeholder}
        required={required}
        type="text"
        value={value}
      />
    </div>
  );
}



function ProjectField({
  field,
  error,
  isPending,
}: {
  field: InquiryFormFieldDefinition;
  error?: string;
  isPending: boolean;
}) {
  const inputName = getInquiryFormFieldInputName(field);
  const inputId = `inquiry-${inputName}`;
  const labelId = `${inputId}-label`;
  const isMultiSelect =
    field.kind === "custom" && field.fieldType === "multi_select";
  const isWide =
    (field.kind === "system" && field.key === "details") ||
    (field.kind === "custom" &&
      (field.fieldType === "long_text" || field.fieldType === "multi_select"));

  return (
    <Field
      className={cn(isWide && "sm:col-span-2")}
      data-invalid={Boolean(error) || undefined}
    >
      {isMultiSelect ? (
        // A multi-select is a group of checkboxes, not a single input, so
        // the label references the group instead of a control.
        <FieldLabel id={labelId}>
          <FieldLabelText label={field.label} required={field.required} />
        </FieldLabel>
      ) : (
        <FieldLabel htmlFor={inputId}>
          <FieldLabelText label={field.label} required={field.required} />
        </FieldLabel>
      )}
      <FieldContent>
        {renderProjectInput({
          hasError: Boolean(error),
          field,
          inputId,
          inputName,
          isPending,
          labelId,
        })}
        <FieldError errors={error ? [{ message: error }] : undefined} />
      </FieldContent>
    </Field>
  );
}

function renderProjectInput({
  hasError,
  field,
  inputId,
  inputName,
  isPending,
  labelId,
}: {
  hasError: boolean;
  field: InquiryFormFieldDefinition;
  inputId: string;
  inputName: string;
  isPending: boolean;
  labelId: string;
}) {
  if (field.kind === "system") {
    if (field.key === "requestedDeadline") {
      return (
        <ProjectDateInput
          disabled={isPending}
          id={inputId}
          name={inputName}
          required={field.required}
        />
      );
    }

    if (field.key === "details") {
      return (
        <Textarea
          disabled={isPending}
          id={inputId}
          maxLength={4000}
          minLength={10}
          name={inputName}
          placeholder={field.placeholder}
          required={field.required}
          rows={7}
        />
      );
    }

    if (field.key === "budgetText") {
      return (
        <Input
          disabled={isPending}
          id={inputId}
          inputMode="numeric"
          min={0}
          name={inputName}
          placeholder={field.placeholder}
          required={field.required}
          step={1}
          type="number"
        />
      );
    }

    return (
      <Input
        disabled={isPending}
        id={inputId}
        maxLength={getProjectFieldMaxLength(field)}
        name={inputName}
        placeholder={field.placeholder}
        required={field.required}
      />
    );
  }

  switch (field.fieldType) {
    case "long_text":
      return (
        <Textarea
          disabled={isPending}
          id={inputId}
          maxLength={4000}
          name={inputName}
          placeholder={field.placeholder}
          required={field.required}
          rows={5}
        />
      );
    case "select":
      return (
        <ProjectSelectInput
          ariaInvalid={hasError}
          disabled={isPending}
          id={inputId}
          name={inputName}
          options={field.options ?? []}
          placeholder={field.placeholder ?? "Select an option"}
          required={field.required}
        />
      );
    case "multi_select":
      return (
        <MultiSelectField
          disabled={isPending}
          inputId={inputId}
          inputName={inputName}
          labelId={labelId}
          options={field.options ?? []}
        />
      );
    case "number":
      return (
        <Input
          disabled={isPending}
          id={inputId}
          inputMode="decimal"
          name={inputName}
          placeholder={field.placeholder}
          required={field.required}
          step="any"
          type="number"
        />
      );
    case "date":
      return (
        <ProjectDateInput
          disabled={isPending}
          id={inputId}
          name={inputName}
          required={field.required}
        />
      );
    case "boolean":
      return (
        <ProjectBooleanSelectInput
          ariaInvalid={hasError}
          disabled={isPending}
          id={inputId}
          name={inputName}
          placeholder={field.placeholder ?? "Choose an option"}
          required={field.required}
        />
      );
    case "short_text":
    default:
      return (
        <Input
          disabled={isPending}
          id={inputId}
          maxLength={160}
          name={inputName}
          placeholder={field.placeholder}
          required={field.required}
        />
      );
  }
}

function ProjectDateInput({
  disabled,
  id,
  name,
  required,
}: {
  disabled: boolean;
  id: string;
  name: string;
  required: boolean;
}) {
  const [value, setValue] = useState("");

  return (
    <DatePicker
      disabled={disabled}
      id={id}
      name={name}
      onChange={setValue}
      required={required}
      value={value}
    />
  );
}

function ProjectSelectInput({
  ariaInvalid,
  disabled,
  id,
  name,
  options,
  placeholder,
  required,
}: {
  ariaInvalid: boolean;
  disabled: boolean;
  id: string;
  name: string;
  options: Array<{ id: string; label: string; value: string }>;
  placeholder: string;
  required: boolean;
}) {
  const [value, setValue] = useState<string | undefined>(undefined);
  const comboboxOptions = useMemo(
    () => [
      {
        label: placeholder,
        searchText: placeholder,
        value: "",
      },
      ...options.map((option) => ({
        label: option.label,
        searchText: `${option.label} ${option.value}`,
        value: option.value,
      })),
    ],
    [options, placeholder],
  );

  return (
    <>
      <input
        aria-hidden="true"
        name={name}
        required={required}
        tabIndex={-1}
        type="text"
        value={value ?? ""}
        readOnly
        className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
      />
      <Combobox
        aria-invalid={ariaInvalid || undefined}
        disabled={disabled}
        id={id}
        onValueChange={(nextValue) => setValue(nextValue || undefined)}
        options={comboboxOptions}
        placeholder={placeholder}
        renderValue={(option) =>
          option.value ? (
            <span className="truncate">{option.label}</span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )
        }
        searchPlaceholder="Search option"
        value={value ?? ""}
      />
    </>
  );
}

function ProjectBooleanSelectInput({
  ariaInvalid,
  disabled,
  id,
  name,
  placeholder,
  required,
}: {
  ariaInvalid: boolean;
  disabled: boolean;
  id: string;
  name: string;
  placeholder: string;
  required: boolean;
}) {
  const [value, setValue] = useState<string | undefined>(undefined);
  const comboboxOptions = useMemo(
    () => [
      {
        label: placeholder,
        searchText: placeholder,
        value: "",
      },
      { label: "Yes", searchText: "Yes true", value: "true" },
      { label: "No", searchText: "No false", value: "false" },
    ],
    [placeholder],
  );

  return (
    <>
      <input
        aria-hidden="true"
        name={name}
        required={required}
        tabIndex={-1}
        type="text"
        value={value ?? ""}
        readOnly
        className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
      />
      <Combobox
        aria-invalid={ariaInvalid || undefined}
        disabled={disabled}
        id={id}
        onValueChange={(nextValue) => setValue(nextValue || undefined)}
        options={comboboxOptions}
        placeholder={placeholder}
        renderValue={(option) =>
          option.value ? (
            <span className="truncate">{option.label}</span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )
        }
        searchPlaceholder="Search option"
        value={value ?? ""}
      />
    </>
  );
}

function MultiSelectField({
  disabled,
  inputId,
  inputName,
  options,
  labelId,
}: {
  disabled: boolean;
  inputId: string;
  inputName: string;
  labelId: string;
  options: Array<{ id: string; label: string; value: string }>;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  return (
    <div
      aria-labelledby={labelId}
      className="grid gap-2 sm:grid-cols-2"
      id={inputId}
      role="group"
    >
      {options.map((option) => {
        const optionId = `${inputId}-${option.id}`;
        const isChecked = checked.has(option.value);

        return (
          <label
            data-padding="none"
            key={option.id}
            className="soft-panel flex cursor-pointer items-center gap-3 px-3 py-3 shadow-none"
            htmlFor={optionId}
          >
            {isChecked ? (
              <input type="hidden" name={inputName} value={option.value} />
            ) : null}
            <Checkbox
              checked={isChecked}
              disabled={disabled}
              id={optionId}
              onCheckedChange={(state) => {
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (state === true) {
                    next.add(option.value);
                  } else {
                    next.delete(option.value);
                  }
                  return next;
                });
              }}
            />
            <span className="text-sm text-foreground">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function FieldLabelText({
  label,
  required,
}: {
  label: string;
  required: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>{label}</span>
      {!required ? (
        <span className="text-xs font-medium text-muted-foreground">Optional</span>
      ) : null}
    </span>
  );
}
