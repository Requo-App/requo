import { z } from "zod";

import {
  getInquiryFormFieldInputName,
  getInquirySubmittedFieldValueDisplay,
  inquiryContactFieldKeys,
  inquiryContactMethods,
  normalizeInquiryContactHandleSubmissionValue,
  type InquiryFormConfig,
  type InquiryFormCustomFieldDefinition,
  type InquiryFormFieldDefinition,
  type InquiryFormSystemFieldDefinition,
  type InquiryContactMethod,
  type InquirySubmittedFieldSnapshot,
  type InquirySubmittedFieldSnapshotField,
} from "@/features/inquiries/form-config";import {
  coercePositiveInteger,
  emptyToUndefined,
  firstString,
  isValidDateInput,
} from "@/lib/zod-helpers";
import { getPublicInquiryAttachmentHelpText } from "@/features/inquiries/plan-rules";
import {
  inquiryRecordViews,
  inquirySourceFilterValues,
  inquiryStatusFilterValues,
  inquiryWorkflowStatuses,
} from "@/features/inquiries/types";

import {
  type PublicInquiryAttachmentUpload,
  publicInquiryAttachmentAccept,
  publicInquiryAllowedExtensions,
  publicInquiryAllowedMimeTypes,
  publicInquiryAttachmentBucket,
  publicInquiryAttachmentTypeError,
  publicInquiryExtensionToMimeType,
  publicInquiryMaxAttachmentSize,
} from "@/features/inquiries/attachments";

export {
  publicInquiryAttachmentAccept,
  publicInquiryAllowedExtensions,
  publicInquiryAllowedMimeTypes,
  publicInquiryAttachmentBucket,
  publicInquiryAttachmentTypeError,
  publicInquiryExtensionToMimeType,
  publicInquiryMaxAttachmentSize,
};

export const publicInquiryAttachmentLabel =
  getPublicInquiryAttachmentHelpText("free");

/**
 * The attachment is uploaded to storage before the inquiry is submitted, so
 * the form carries a signed upload token instead of the file. The token
 * names the file and the business, and is verified once the action runs.
 */
const optionalAttachmentTokenSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).max(2000).optional(),
);

export type PublicInquirySubmissionInput = {
  customerName: string;
  customerEmail?: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  requestedDeadline?: string;
  budgetText?: string;
  details: string;
  /** Signed upload token for the attached file, when one was attached. */
  attachment?: string;
  /**
   * The uploaded file, resolved and validated by the action against the
   * business and the plan.
   */
  attachmentUpload?: PublicInquiryAttachmentUpload;
  /** Upload ceiling for this business's plan, enforced on the stored file. */
  maxAttachmentBytes?: number;
  submittedFieldSnapshot: InquirySubmittedFieldSnapshot;
};

function getTextFieldMessage(label: string) {
  return `Enter ${label.toLowerCase()}.`;
}

function getMinLengthFieldMessage(label: string, minLength: number) {
  return `${label} must be at least ${minLength} characters.`;
}

function getMaxLengthFieldMessage(label: string, maxLength: number) {
  return `${label} must be ${maxLength} characters or fewer.`;
}

function getChoiceFieldMessage(label: string) {
  return `Choose ${label.toLowerCase()}.`;
}

function getRawFormValue(formData: FormData, name: string) {
  const value = formData.get(name);

  if (value instanceof File) {
    return value;
  }

  return typeof value === "string" ? value : undefined;
}

function getRawFormValues(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string");
}

function createRequiredTextSchema({
  label,
  minLength = 1,
  maxLength,
}: {
  label: string;
  minLength?: number;
  maxLength: number;
}) {
  return z
    .string()
    .trim()
    .min(
      minLength,
      minLength > 1
        ? getMinLengthFieldMessage(label, minLength)
        : getTextFieldMessage(label),
    )
    .max(maxLength, getMaxLengthFieldMessage(label, maxLength));
}

function createOptionalTextSchema(label: string, maxLength: number) {
  return z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(maxLength, getMaxLengthFieldMessage(label, maxLength))
      .optional(),
  );
}

function createDateSchema(label: string, required: boolean) {
  const schema = z
    .string()
    .trim()
    .refine(isValidDateInput, `Enter a valid ${label.toLowerCase()}.`);

  if (required) {
    return z.preprocess(
      emptyToUndefined,
      schema.min(1, getTextFieldMessage(label)),
    );
  }

  return z.preprocess(emptyToUndefined, schema.optional());
}

function createNumberSchema(label: string, required: boolean) {
  const schema = z
    .string()
    .trim()
    .refine(
      (value) => /^-?\d+(?:\.\d+)?$/.test(value),
      "Enter a valid number.",
    )
    .max(80, getMaxLengthFieldMessage(label, 80))
    .refine((value) => Number(value) >= 0, `${label} cannot be negative.`)
    .refine((value) => Number(value) <= 1_000_000_000, `${label} is too large.`);

  if (required) {
    return z.preprocess(
      emptyToUndefined,
      schema.min(1, getTextFieldMessage(label)),
    );
  }

  return z.preprocess(emptyToUndefined, schema.optional());
}

function createSelectSchema(
  label: string,
  values: string[],
  required: boolean,
) {
  const optionSchema = z.enum(values as [string, ...string[]], {
    error: () => getChoiceFieldMessage(label),
  });

  if (required) {
    return z.preprocess(emptyToUndefined, optionSchema);
  }

  return z.preprocess(emptyToUndefined, optionSchema.optional());
}

function createMultiSelectSchema(
  label: string,
  values: string[],
  required: boolean,
) {
  const optionSchema = z.enum(values as [string, ...string[]], {
    error: () => getChoiceFieldMessage(label),
  });
  const arraySchema = z
    .array(optionSchema)
    .max(12, `Choose no more than 12 ${label.toLowerCase()} options.`);

  if (required) {
    return z.preprocess(
      (value) => {
        if (!Array.isArray(value)) {
          return [];
        }

        return value.filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.trim().length > 0,
        );
      },
      arraySchema.min(1, `Select at least one ${label.toLowerCase()} option.`),
    );
  }

  return z.preprocess(
    (value) => {
      if (!Array.isArray(value)) {
        return undefined;
      }

      const cleanedValue = value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      );

      return cleanedValue.length ? cleanedValue : undefined;
    },
    arraySchema.optional(),
  );
}

function createBooleanSchema(label: string, required: boolean) {
  if (required) {
    return z.preprocess(
      (value) => {
        if (value === "true") {
          return true;
        }

        if (value === "false") {
          return false;
        }

        return emptyToUndefined(value);
      },
      z.boolean({
        error: () => getChoiceFieldMessage(label),
      }),
    );
  }

  return z.preprocess(
    (value) => {
      if (value === "true") {
        return true;
      }

      if (value === "false") {
        return false;
      }

      return emptyToUndefined(value);
    },
    z
      .boolean({
        error: () => getChoiceFieldMessage(label),
      })
      .optional(),
  );
}

function createCustomFieldSchema(field: InquiryFormCustomFieldDefinition) {
  switch (field.fieldType) {
    case "short_text":
      return field.required
        ? createRequiredTextSchema({ label: field.label, maxLength: 160 })
        : createOptionalTextSchema(field.label, 160);
    case "long_text":
      return field.required
        ? createRequiredTextSchema({
            label: field.label,
            minLength: 1,
            maxLength: 4000,
          })
        : createOptionalTextSchema(field.label, 4000);
    case "number":
      return createNumberSchema(field.label, field.required);
    case "date":
      return createDateSchema(field.label, field.required);
    case "boolean":
      return createBooleanSchema(field.label, field.required);
    case "select":
      return createSelectSchema(
        field.label,
        (field.options ?? []).map((option) => option.value),
        field.required,
      );
    case "multi_select":
      return createMultiSelectSchema(
        field.label,
        (field.options ?? []).map((option) => option.value),
        field.required,
      );
  }
}

function createPublicInquirySubmissionSchema(config: InquiryFormConfig) {
  const shape: Record<string, z.ZodTypeAny> = {};

  if (config.contactFields.customerName.enabled) {
    shape.customerName = createRequiredTextSchema({
      label: config.contactFields.customerName.label,
      minLength: 2,
      maxLength: 120,
    });
  }

  if (config.contactFields.email?.enabled) {
    shape.customerEmail = z
      .string()
      .trim()
      .min(1, "Enter your email address.")
      .email("Enter a valid email address.")
      .max(320, "Email must be 320 characters or fewer.");
  }

  if (config.contactFields.preferredContact.enabled) {
    // The client offers a fixed set of contact methods, but the action is
    // public — the value has to be re-checked against that set here.
    shape.customerContactMethod = z.enum(inquiryContactMethods, {
      error: () => "Choose a preferred contact method.",
    });
    shape.customerContactHandle = z
      .string()
      .trim()
      .max(320, "Contact details must be 320 characters or fewer.")
      .optional()
      .default("");
  }

  for (const field of config.projectFields) {
    if (field.kind === "system" && !field.enabled) {
      continue;
    }

    const inputName = getInquiryFormFieldInputName(field);

    if (field.kind === "custom") {
      shape[inputName] = createCustomFieldSchema(field);
      continue;
    }

    switch (field.key) {
      case "requestedDeadline":
        shape[inputName] = createDateSchema(field.label, field.required);
        break;
      case "budgetText":
        shape[inputName] = field.required
          ? createRequiredTextSchema({
              label: field.label,
              maxLength: 120,
            })
          : createOptionalTextSchema(field.label, 120);
        break;
      case "details":
        shape[inputName] = createRequiredTextSchema({
          label: field.label,
          minLength: 10,
          maxLength: 4000,
        });
        break;
      case "attachment":
        shape[inputName] = optionalAttachmentTokenSchema;
        break;
    }
  }

  return z.object(shape).superRefine((data, ctx) => {
    // When preferred contact method is email, the dedicated email field covers it.
    // When it's something else, require the contact handle.
    if (data.customerContactMethod && data.customerContactMethod !== "email") {
      const handle = typeof data.customerContactHandle === "string" ? data.customerContactHandle.trim() : "";
      if (handle.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter your contact details.",
          path: ["customerContactHandle"],
        });
      }
    }
  });
}

function isInquiryContactMethod(value: unknown): value is InquiryContactMethod {
  return (
    typeof value === "string" &&
    inquiryContactMethods.includes(value as InquiryContactMethod)
  );
}

function normalizeCustomerContactHandle(
  method: unknown,
  handle: unknown,
) {
  if (!isInquiryContactMethod(method) || typeof handle !== "string") {
    return handle;
  }

  return normalizeInquiryContactHandleSubmissionValue(method, handle);
}

function getSubmittedFieldSnapshotValue(
  field: InquiryFormFieldDefinition | (typeof inquiryContactFieldKeys)[number],
  parsedValues: Record<string, unknown>,
): InquirySubmittedFieldSnapshotField["value"] {
  const inputName =
    typeof field === "string" ? field : getInquiryFormFieldInputName(field);
  const value = parsedValues[inputName];

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    return trimmedValue ? trimmedValue : null;
  }

  if (Array.isArray(value)) {
    return value.length ? value : null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value instanceof File) {
    return value.name.trim() ? value.name : null;
  }

  return null;
}

function buildSubmittedFieldSnapshot(
  config: InquiryFormConfig,
  parsedValues: Record<string, unknown>,
) {
  const fields: InquirySubmittedFieldSnapshotField[] = [];

  for (const contactKey of inquiryContactFieldKeys) {
    const field = config.contactFields[contactKey];

    if (!field || !field.enabled) {
      continue;
    }

    const value = getSubmittedFieldSnapshotValue(contactKey, parsedValues);

    fields.push({
      id: contactKey,
      label: field.label,
      value,
      displayValue: getInquirySubmittedFieldValueDisplay(value),
      fieldKind: "contact",
    });
  }

  for (const field of config.projectFields) {
    if (field.kind === "system" && !field.enabled) {
      continue;
    }

    // The attachment field holds a signed upload token, which is a
    // capability rather than a submitted value. The attachment itself is
    // shown from the attachment rows.
    if (field.kind === "system" && field.key === "attachment") {
      continue;
    }

    const value = getSubmittedFieldSnapshotValue(field, parsedValues);

    fields.push({
      id: field.kind === "system" ? field.key : field.id,
      label: field.label,
      value,
      displayValue: getInquirySubmittedFieldValueDisplay(value),
      fieldKind: field.kind === "system" ? "system" : "custom",
    });
  }

  return {
    version: 1,
    businessType: config.businessType,
    fields,
  } satisfies InquirySubmittedFieldSnapshot;
}

export function validatePublicInquirySubmission(
  config: InquiryFormConfig,
  formData: FormData,
) {
  const schema = createPublicInquirySubmissionSchema(config);
  const candidate: Record<string, unknown> = {};

  if (config.contactFields.customerName.enabled) {
    candidate.customerName = getRawFormValue(formData, "customerName");
  }

  if (config.contactFields.email?.enabled) {
    candidate.customerEmail = getRawFormValue(formData, "customerEmail");
  }
  
  if (config.contactFields.preferredContact.enabled) {
    candidate.customerContactMethod = getRawFormValue(formData, "customerContactMethod");
    candidate.customerContactHandle = normalizeCustomerContactHandle(
      candidate.customerContactMethod,
      getRawFormValue(formData, "customerContactHandle"),
    );
  }

  for (const field of config.projectFields) {
    if (field.kind === "system" && !field.enabled) {
      continue;
    }

    const inputName = getInquiryFormFieldInputName(field);
    candidate[inputName] =
      field.kind === "custom" && field.fieldType === "multi_select"
        ? getRawFormValues(formData, inputName)
        : getRawFormValue(formData, inputName);
  }

  const validationResult = schema.safeParse(candidate);

  if (!validationResult.success) {
    return validationResult;
  }

  const parsedValues = validationResult.data as Record<string, unknown>;
  const customerEmail = parsedValues.customerEmail ? String(parsedValues.customerEmail) : (parsedValues.customerContactMethod === "email" ? String(parsedValues.customerContactHandle || "") : null);
  const customerContactMethod = String(parsedValues.customerContactMethod ?? "email");
  // When method is email, use the dedicated email field value as the contact handle
  const customerContactHandle = customerContactMethod === "email"
    ? (customerEmail ?? "")
    : String(parsedValues.customerContactHandle ?? "");

  return {
    success: true as const,
    data: {
      customerName: String(parsedValues.customerName ?? ""),
      customerEmail,
      customerContactMethod,
      customerContactHandle,
      requestedDeadline:
        typeof parsedValues.requestedDeadline === "string"
          ? parsedValues.requestedDeadline
          : undefined,
      budgetText:
        typeof parsedValues.budgetText === "string"
          ? parsedValues.budgetText
          : undefined,
      details: String(parsedValues.details ?? ""),
      attachment:
        typeof parsedValues.attachment === "string"
          ? parsedValues.attachment
          : undefined,
      submittedFieldSnapshot: buildSubmittedFieldSnapshot(config, parsedValues),
    } satisfies PublicInquirySubmissionInput,
  };
}

const manualQuickInquiryFieldKeys = new Set([
  "requestedDeadline",
  "budgetText",
  "details",
  // The quick-add editor renders an attachment section and submits a file
  // with the form. Stripping the field here made that section unreachable
  // and silently dropped the uploaded file.
  "attachment",
]);

export function createManualQuickInquiryFormConfig(
  config: InquiryFormConfig,
): InquiryFormConfig {
  const projectFields = config.projectFields
    .filter(
      (field): field is InquiryFormSystemFieldDefinition =>
        field.kind === "system" && manualQuickInquiryFieldKeys.has(field.key),
    )
    .map((field) => ({
      ...field,
      enabled: true,
      required: field.key === "details",
    }));

  return {
    ...config,
    contactFields: {
      ...config.contactFields,
      customerName: {
        ...config.contactFields.customerName,
        enabled: true,
        required: true,
      },
      email: {
        ...(config.contactFields.email ?? { label: "Email", placeholder: "you@example.com" }),
        enabled: true,
        required: true,
      },
      preferredContact: {
        ...config.contactFields.preferredContact,
        enabled: true,
        required: true,
      },
    },
    projectFields,
  };
}

export function validateManualQuickInquirySubmission(
  config: InquiryFormConfig,
  formData: FormData,
) {
  return validatePublicInquirySubmission(
    createManualQuickInquiryFormConfig(config),
    formData,
  );
}

export const inquiryIdSchema = z.string().trim().min(1).max(128);

export const inquiryRouteParamsSchema = z.object({
  id: inquiryIdSchema,
});

export const inquiryAttachmentRouteParamsSchema = z.object({
  id: inquiryIdSchema,
  attachmentId: z.string().trim().min(1).max(128),
});

const publicInquiryUploadSlugSchema = z.string().trim().min(1).max(120);

/**
 * Request body for the public attachment upload route.
 *
 * `formSlug` is the pre-Service name for the same value. Keep accepting it
 * while clients loaded before the rename can still submit an upload.
 */
export const publicInquiryUploadRequestSchema = z
  .object({
    businessSlug: publicInquiryUploadSlugSchema,
    serviceSlug: publicInquiryUploadSlugSchema.optional(),
    formSlug: publicInquiryUploadSlugSchema.optional(),
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().max(255).optional(),
    size: z.number().int().positive().max(100 * 1024 * 1024),
  })
  .transform(({ formSlug, ...value }) => ({
    ...value,
    serviceSlug: value.serviceSlug ?? formSlug,
  }));

export const inquiryListFiltersSchema = z.object({
  q: z
    .preprocess(
      (value) => emptyToUndefined(firstString(value)),
      z.string().trim().max(120).optional(),
    )
    .catch(undefined),
  view: z
    .preprocess(
      (value) => firstString(value) ?? "active",
      z.enum(inquiryRecordViews),
    )
    .catch("active"),
  status: z
    .preprocess(
      (value) => firstString(value) ?? "all",
      z.enum(inquiryStatusFilterValues),
    )
    .catch("all"),
  form: z
    .preprocess(
      (value) => firstString(value) ?? "all",
      z.string().trim().max(120),
    )
    .catch("all"),
  source: z
    .preprocess(
      (value) => firstString(value) ?? "all",
      z.enum(inquirySourceFilterValues),
    )
    .catch("all"),
  sort: z
    .preprocess(
      (value) => firstString(value) ?? "newest",
      z.enum(["newest", "oldest"]),
    )
    .catch("newest"),
  escalated: z
    .preprocess((value) => {
      const first = firstString(value);
      return first === "1" || first === "true";
    }, z.boolean())
    .catch(false),
  unread: z
    .preprocess((value) => {
      const first = firstString(value);
      return first === "1" || first === "true";
    }, z.boolean())
    .catch(false),
  page: coercePositiveInteger("Page").catch(1),
});

export const inquiryFormSelectionSchema = z.object({
  serviceSlug: z
    .string()
    .trim()
    .min(1, "Choose an inquiry form.")
    .max(120),
});

export const inquiryNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Enter an internal note.")
    .max(2000, "Notes must be 2,000 characters or fewer."),
});

export const inquiryStatusChangeSchema = z.object({
  status: z.enum(inquiryWorkflowStatuses),
});
