import type { QuoteEditorLineItemValue, QuoteEditorValues } from "@/features/quotes/types";
import { parseCurrencyInputToCents } from "@/features/quotes/utils";
import {
  inquiryContactMethodLabels,
  type InquiryContactMethod,
} from "@/features/inquiries/form-config";
import type { EditorLineItem } from "./types";

export const LINE_ITEM_ENTER_DURATION_MS = 220;

export function cloneQuoteEditorValues(values: QuoteEditorValues): QuoteEditorValues {
  return {
    ...values,
    items: values.items.map((item) => ({ ...item })),
  };
}

export function normalizeQuoteEditorValues(values: QuoteEditorValues): QuoteEditorValues {
  const clonedValues = cloneQuoteEditorValues(values);

  return {
    ...clonedValues,
    customerEmail: getEffectiveCustomerEmail({
      customerEmail: clonedValues.customerEmail ?? "",
      customerContactMethod: clonedValues.customerContactMethod,
      customerContactHandle: clonedValues.customerContactHandle,
    }),
  };
}

export function areQuoteEditorValuesEqual(
  left: QuoteEditorValues,
  right: QuoteEditorValues,
) {
  if (
    left.title !== right.title ||
    left.customerName !== right.customerName ||
    (left.customerEmail ?? "") !== (right.customerEmail ?? "") ||
    left.customerContactMethod !== right.customerContactMethod ||
    left.customerContactHandle !== right.customerContactHandle ||
    left.notes !== right.notes ||
    left.terms !== right.terms ||
    left.validUntil !== right.validUntil ||
    left.discount !== right.discount ||
    left.discountType !== right.discountType ||
    left.tax !== right.tax ||
    left.taxType !== right.taxType ||
    left.taxLabel !== right.taxLabel ||
    left.items.length !== right.items.length
  ) {
    return false;
  }

  for (let index = 0; index < left.items.length; index += 1) {
    const leftItem = left.items[index];
    const rightItem = right.items[index];

    if (
      leftItem.id !== rightItem.id ||
      leftItem.description !== rightItem.description ||
      leftItem.quantity !== rightItem.quantity ||
      leftItem.unitPrice !== rightItem.unitPrice
    ) {
      return false;
    }
  }

  return true;
}

export function getVisibleEditorItems(items: EditorLineItem[]): QuoteEditorLineItemValue[] {
  return items.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    aiReview: item.aiReview,
    // The AI provenance travels with the row so a save can persist it.
    // Dropping it here left every saved quote with a null `ai_product_status`
    // and null `ai_evidence`, which silently disarmed the server-side
    // "suggested pricing needs confirmation" gate.
    aiProductStatus: item.aiProductStatus,
    aiProductLibraryEntryId: item.aiProductLibraryEntryId,
    aiProductLibraryItemId: item.aiProductLibraryItemId,
    aiEvidence: item.aiEvidence,
  }));
}

export function getQuotePreviewItems(items: QuoteEditorLineItemValue[]) {
  return items.map((item) => {
    const quantity = Number.parseInt(item.quantity.trim(), 10);
    const safeQuantity =
      Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
    const unitPriceInCents = parseCurrencyInputToCents(item.unitPrice);

    return {
      id: item.id,
      description: item.description.trim(),
      quantity: safeQuantity,
      unitPriceInCents,
      lineTotalInCents: safeQuantity * unitPriceInCents,
    };
  });
}

export function getEffectiveCustomerEmail({
  customerEmail,
  customerContactMethod,
  customerContactHandle,
}: {
  customerEmail: string;
  customerContactMethod: string;
  customerContactHandle: string;
}) {
  const contactHandle = customerContactHandle.trim();

  if (customerContactMethod.trim().toLowerCase() === "email") {
    return contactHandle || null;
  }

  return customerEmail.trim() || null;
}

export function getQuoteContactHandleLabel(method: string) {
  const normalized = method.trim().toLowerCase();

  if (normalized in inquiryContactMethodLabels) {
    return inquiryContactMethodLabels[normalized as InquiryContactMethod];
  }

  return "Contact details";
}
