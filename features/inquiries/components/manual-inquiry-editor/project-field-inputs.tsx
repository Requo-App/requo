"use client";

import { useMemo } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { InquiryFormFieldDefinition } from "@/features/inquiries/form-config";
import { getProjectFieldMaxLength } from "./utils";

export function renderProjectInput({
  field,
  inputId,
  inputName,
  isPending,
  onValueChange,
  onMultiValueChange,
  stringValue,
  multiValue,
  hasError,
  labelId,
}: {
  field: InquiryFormFieldDefinition;
  inputId: string;
  inputName: string;
  isPending: boolean;
  onValueChange: (value: string | undefined) => void;
  onMultiValueChange: (optionValue: string, checked: boolean) => void;
  stringValue: string;
  multiValue: string[];
  hasError: boolean;
  labelId: string;
}) {
  if (field.kind === "system") {
    if (field.key === "requestedDeadline") {
      return (
        <DatePicker
          disabled={isPending}
          id={inputId}
          name={inputName}
          onChange={(value) => onValueChange(value || undefined)}
          required={field.required}
          value={stringValue}
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
          onChange={(event) => onValueChange(event.currentTarget.value)}
          placeholder={field.placeholder}
          required={field.required}
          rows={7}
          value={stringValue}
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
          onChange={(event) => onValueChange(event.currentTarget.value)}
          placeholder={field.placeholder}
          required={field.required}
          step={1}
          type="number"
          value={stringValue}
        />
      );
    }

    return (
      <Input
        disabled={isPending}
        id={inputId}
        maxLength={getProjectFieldMaxLength(field)}
        name={inputName}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        placeholder={field.placeholder}
        required={field.required}
        type="text"
        value={stringValue}
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
          onChange={(event) => onValueChange(event.currentTarget.value)}
          placeholder={field.placeholder}
          required={field.required}
          rows={5}
          value={stringValue}
        />
      );
    case "select":
      return (
        <ProjectSelectInput
          ariaInvalid={hasError}
          disabled={isPending}
          id={inputId}
          name={inputName}
          onValueChange={onValueChange}
          options={field.options ?? []}
          placeholder={field.placeholder ?? "Select an option"}
          required={field.required}
          value={stringValue}
        />
      );
    case "multi_select":
      return (
        <div
          aria-labelledby={labelId}
          className="grid gap-2 sm:grid-cols-2"
          id={inputId}
          role="group"
        >
          {(field.options ?? []).map((option) => {
            const optionId = `${inputId}-${option.id}`;
            const isChecked = multiValue.includes(option.value);

            return (
              <label
                data-padding="none"
                key={option.id}
                className="soft-panel flex cursor-pointer items-center gap-3 px-3 py-3 shadow-none"
                htmlFor={optionId}
              >
                <Checkbox
                  checked={isChecked}
                  disabled={isPending}
                  id={optionId}
                  onCheckedChange={(state) =>
                    onMultiValueChange(option.value, state === true)
                  }
                />
                {/* Mirrors the public form: the checkbox itself carries no
                    form name, so the selected values need a hidden input
                    each to reach the server. */}
                {isChecked ? (
                  <input name={inputName} type="hidden" value={option.value} />
                ) : null}
                <span className="text-sm text-foreground">{option.label}</span>
              </label>
            );
          })}
        </div>
      );
    case "number":
      return (
        <Input
          disabled={isPending}
          id={inputId}
          inputMode="decimal"
          name={inputName}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          placeholder={field.placeholder}
          required={field.required}
          step="any"
          type="number"
          value={stringValue}
        />
      );
    case "date":
      return (
        <DatePicker
          disabled={isPending}
          id={inputId}
          name={inputName}
          onChange={(value) => onValueChange(value || undefined)}
          required={field.required}
          value={stringValue}
        />
      );
    case "boolean":
      return (
        <ProjectBooleanSelectInput
          ariaInvalid={hasError}
          disabled={isPending}
          id={inputId}
          name={inputName}
          onValueChange={onValueChange}
          placeholder={field.placeholder ?? "Choose an option"}
          required={field.required}
          value={stringValue}
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
          onChange={(event) => onValueChange(event.currentTarget.value)}
          placeholder={field.placeholder}
          required={field.required}
          value={stringValue}
        />
      );
  }
}

export function ProjectSelectInput({
  ariaInvalid,
  disabled,
  id,
  name,
  onValueChange,
  options,
  placeholder,
  required,
  value,
}: {
  ariaInvalid: boolean;
  disabled: boolean;
  id: string;
  name: string;
  onValueChange: (value: string | undefined) => void;
  options: Array<{ id: string; label: string; value: string }>;
  placeholder: string;
  required: boolean;
  value: string;
}) {
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
        className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
        name={name}
        readOnly
        required={required}
        tabIndex={-1}
        type="text"
        value={value}
      />
      <Combobox
        aria-invalid={ariaInvalid || undefined}
        disabled={disabled}
        id={id}
        onValueChange={(nextValue) => onValueChange(nextValue || undefined)}
        options={comboboxOptions}
        placeholder={placeholder}
        renderValue={(option) =>
          option.value ? (
            <span className="truncate">{option.label}</span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )
        }
        searchable
        searchPlaceholder="Search option"
        value={value}
      />
    </>
  );
}

export function ProjectBooleanSelectInput({
  ariaInvalid,
  disabled,
  id,
  name,
  onValueChange,
  placeholder,
  required,
  value,
}: {
  ariaInvalid: boolean;
  disabled: boolean;
  id: string;
  name: string;
  onValueChange: (value: string | undefined) => void;
  placeholder: string;
  required: boolean;
  value: string;
}) {
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
        className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
        name={name}
        readOnly
        required={required}
        tabIndex={-1}
        type="text"
        value={value}
      />
      <Combobox
        aria-invalid={ariaInvalid || undefined}
        disabled={disabled}
        id={id}
        onValueChange={(nextValue) => onValueChange(nextValue || undefined)}
        options={comboboxOptions}
        placeholder={placeholder}
        renderValue={(option) =>
          option.value ? (
            <span className="truncate">{option.label}</span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )
        }
        value={value}
      />
    </>
  );
}
