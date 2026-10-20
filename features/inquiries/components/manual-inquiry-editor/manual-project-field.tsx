"use client";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  getInquiryFormFieldInputName,
  type InquiryFormFieldDefinition,
} from "@/features/inquiries/form-config";
import { cn } from "@/lib/utils";
import { FieldLabelText } from "./field-label-text";
import { renderProjectInput } from "./project-field-inputs";
import type { ProjectFieldValue } from "./types";

export function ManualProjectField({
  field,
  value,
  error,
  isPending,
  onValueChange,
  onMultiValueChange,
}: {
  field: InquiryFormFieldDefinition;
  value: ProjectFieldValue | undefined;
  error?: string;
  isPending: boolean;
  onValueChange: (value: string | undefined) => void;
  onMultiValueChange: (optionValue: string, checked: boolean) => void;
}) {
  const inputName = getInquiryFormFieldInputName(field);
  const inputId = `manual-inquiry-${inputName}`;
  const labelId = `${inputId}-label`;
  const isMultiSelect =
    field.kind === "custom" && field.fieldType === "multi_select";
  const isWide =
    (field.kind === "system" && field.key === "details") ||
    (field.kind === "custom" &&
      (field.fieldType === "long_text" || field.fieldType === "multi_select"));
  const stringValue = typeof value === "string" ? value : "";
  const multiValue = Array.isArray(value) ? value : [];

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
          field,
          inputId,
          inputName,
          isPending,
          onMultiValueChange,
          onValueChange,
          stringValue,
          multiValue,
          hasError: Boolean(error),
          labelId,
        })}
        <FieldError errors={error ? [{ message: error }] : undefined} />
      </FieldContent>
    </Field>
  );
}
