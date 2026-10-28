"use client";

import { Input } from "@/components/ui/input";
import {
  getInquiryContactHandleUrlPrefix,
  normalizeInquiryContactHandleEditableValue,
  type InquiryContactMethod,
} from "@/features/inquiries/form-config";
import {
  getContactHandleInputMode,
  getContactHandleInputType,
  getContactHandlePlaceholder,
} from "./utils";

export function ContactHandleInput({
  contactMethod,
  disabled,
  onChange,
  value,
}: {
  contactMethod: InquiryContactMethod;
  disabled: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const contactHandlePrefix = getInquiryContactHandleUrlPrefix(contactMethod);

  if (contactHandlePrefix) {
    return (
      <div className="flex items-stretch">
        <span className="inline-flex items-center rounded-l-lg border border-r-0 border-[var(--control-border)] bg-[var(--surface-inset-bg)] px-3 text-sm text-muted-foreground">
          {contactHandlePrefix}
        </span>
        <Input
          className="rounded-l-none"
          disabled={disabled}
          id="manual-inquiry-contact-handle"
          maxLength={320}
          name="customerContactHandle"
          onBlur={() => {
            onChange(
              normalizeInquiryContactHandleEditableValue(contactMethod, value),
            );
          }}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={getContactHandlePlaceholder(contactMethod)}
          required
          type="text"
          value={value}
        />
      </div>
    );
  }

  return (
    <Input
      autoComplete={contactMethod === "email" ? "email" : "off"}
      disabled={disabled}
      id="manual-inquiry-contact-handle"
      inputMode={getContactHandleInputMode(contactMethod)}
      key={contactMethod}
      maxLength={320}
      name="customerContactHandle"
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={getContactHandlePlaceholder(contactMethod)}
      required
      type={getContactHandleInputType(contactMethod)}
      value={value}
    />
  );
}
