"use client";

import { useState } from "react";

import { ApplyTemplateConfirmDialog } from "@/features/quotes/components/apply-template-confirm-dialog";
import { QuoteEditor } from "@/features/quotes/components/quote-editor";
import { QuoteTemplatePicker } from "@/features/quotes/components/quote-template-picker";
import { applyTemplateToQuoteForm, centsToMoneyInput } from "@/features/quotes/utils";
import type {
  DashboardQuoteLibraryEntry,
  QuoteEditorValues,
} from "@/features/quotes/types";
import type { QuoteEditorProps } from "@/features/quotes/components/quote-editor/types";

type NewQuoteWithTemplatePickerProps = Omit<QuoteEditorProps, "initialValues"> & {
  baseInitialValues: QuoteEditorValues;
  templates: DashboardQuoteLibraryEntry[];
};

export function NewQuoteWithTemplatePicker({
  baseInitialValues,
  templates,
  businessDefaults,
  ...editorProps
}: NewQuoteWithTemplatePickerProps) {
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [initialValues, setInitialValues] =
    useState<QuoteEditorValues>(baseInitialValues);
  const [editorKey, setEditorKey] = useState("manual");
  const [pendingTemplate, setPendingTemplate] =
    useState<DashboardQuoteLibraryEntry | null>(null);

  const compatibleTemplates = templates.filter(
    (t) => t.currency === editorProps.currency,
  );
  const showPicker = !pickerDismissed && compatibleTemplates.length > 0;

  function applyTemplate(template: DashboardQuoteLibraryEntry) {
    if (!template.title || !template.validityDays) return;

    const applied = applyTemplateToQuoteForm(
      {
        title: template.title,
        notes: template.notes,
        terms: template.terms,
        validityDays: template.validityDays,
        items: template.items.map((item) => ({
          id: crypto.randomUUID(),
          description: item.description,
          quantity: item.quantity,
          unitPriceInCents: item.unitPriceInCents,
        })),
      },
      businessDefaults,
    );

    setInitialValues({
      ...baseInitialValues,
      title: applied.title,
      notes: applied.notes,
      terms: applied.terms,
      validUntil: applied.validUntil,
      items: applied.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: centsToMoneyInput(item.unitPriceInCents),
      })),
    });
    setEditorKey(`template-${template.id}`);
    setPickerDismissed(true);
  }

  function handleSelectTemplate(template: DashboardQuoteLibraryEntry) {
    // Applying a template replaces the title, notes, terms, validity date and
    // every line item — confirm before anything already typed is discarded.
    setPendingTemplate(template);
  }

  function handleStartFromScratch() {
    setPickerDismissed(true);
  }

  return (
    <>
      {showPicker ? (
        <QuoteTemplatePicker
          templates={compatibleTemplates}
          currency={editorProps.currency}
          onSelect={handleSelectTemplate}
          onStartFromScratch={handleStartFromScratch}
        />
      ) : null}

      <ApplyTemplateConfirmDialog
        open={pendingTemplate !== null}
        templateName={pendingTemplate?.title ?? ""}
        onConfirm={() => {
          if (pendingTemplate) {
            applyTemplate(pendingTemplate);
          }
          setPendingTemplate(null);
        }}
        onCancel={() => setPendingTemplate(null)}
      />

      <QuoteEditor
        {...editorProps}
        businessDefaults={businessDefaults}
        initialValues={initialValues}
        key={editorKey}
      />
    </>
  );
}
