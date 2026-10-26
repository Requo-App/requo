"use client";

import dynamic from "next/dynamic";
import {
  useActionState,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, FileText, Plus, Sparkles } from "lucide-react";
import { toast } from "@/components/shared/notify";

import {
  DashboardMetaPill,
  DashboardSection,
  DashboardSidebarStack,
} from "@/components/shared/dashboard-layout";
import {
  FloatingFormActions,
  useFloatingUnsavedChanges,
} from "@/components/shared/floating-form-actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  inquiryContactMethods,
  inquiryContactMethodLabels,
  type InquiryContactMethod,
} from "@/features/inquiries/form-config";
import { QuotePreview } from "@/features/quotes/components/quote-preview";
import type {
  DashboardQuoteLibraryEntry,
  QuoteEditorActionState,
  QuoteEditorValues,
} from "@/features/quotes/types";
import {
  calculateQuoteEditorTotals,
  centsToMoneyInput,
  createQuoteEditorLineItem,
  createQuoteEditorLineItemFromLibraryItem,
  createQuoteEditorLineItemValue,
  formatQuoteMoney,
  isQuoteEditorLineItemBlank,
  parseCurrencyInputToCents,
  applyTemplateToQuoteForm,
} from "@/features/quotes/utils";
import { saveQuoteLineItemToPricingLibrary } from "@/features/quotes/quote-library-actions";
import { AiMissingInfoPanel } from "@/features/quotes/components/ai-missing-info-panel";
import { AiPricingReviewPanel } from "@/features/quotes/components/ai-pricing-review-panel";
import { ApplyTemplateConfirmDialog } from "@/features/quotes/components/apply-template-confirm-dialog";
import { generateQuoteDraftAction } from "@/features/quote-drafting/actions";
import type { AiQuoteDraft, AiQuoteReadiness } from "@/features/quote-drafting/types";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { getUserSafeErrorMessage } from "@/lib/action-state";
import { cn } from "@/lib/utils";

import type { QuoteEditorProps, EditorLineItem } from "./types";
import {
  LINE_ITEM_ENTER_DURATION_MS,
  cloneQuoteEditorValues,
  normalizeQuoteEditorValues,
  areQuoteEditorValuesEqual,
  getVisibleEditorItems,
  getQuotePreviewItems,
  getEffectiveCustomerEmail,
  getQuoteContactHandleLabel,
} from "./utils";
import { LinkedInquiryPanel } from "./linked-inquiry-panel";
import { LineItemCard } from "./line-item-row";
import { QuoteLineItemsReorderGroup } from "./quote-line-items-reorder-group";
import { TotalsRow } from "./totals-row";

const initialState: QuoteEditorActionState = {};
const LazyQuoteLibrarySheet = dynamic(() =>
  import("@/features/quotes/components/quote-library-sheet").then(
    (module) => module.QuoteLibrarySheet,
  ),
);

export function QuoteEditor({
  action,
  businessDefaults,
  businessName,
  businessSlug,
  businessLogoStoragePath,
  currency,
  initialValues,
  linkedInquiry,
  pricingLibrary,
  quoteNumber,
  revisionComment,
  showFloatingUnsavedChanges = false,
  submitLabel,
  submitPendingLabel,
  canUseAiGenerator = false,
  canUseQuoteLibrary = false,
}: QuoteEditorProps) {
  const { scheduleRefresh } = useDeferredRefresh();
  const customerFieldsLocked = !!linkedInquiry;
  const [title, setTitle] = useState(initialValues.title);
  const [customerName, setCustomerName] = useState(initialValues.customerName);
  const [customerEmail, setCustomerEmail] = useState(initialValues.customerEmail ?? "");
  const [customerContactMethod, setCustomerContactMethod] = useState(initialValues.customerContactMethod);
  const [customerContactHandle, setCustomerContactHandle] = useState(initialValues.customerContactHandle);
  const [notes, setNotes] = useState(initialValues.notes);
  const [terms, setTerms] = useState(initialValues.terms);
  const [validUntil, setValidUntil] = useState(initialValues.validUntil);
  const [discount, setDiscount] = useState(initialValues.discount);
  const [discountType, setDiscountType] = useState(initialValues.discountType);
  const [tax, setTax] = useState(initialValues.tax);
  const [taxType, setTaxType] = useState(initialValues.taxType);
  const [taxLabel, setTaxLabel] = useState(initialValues.taxLabel);
  const lineItemTimersRef = useRef<Map<string, number>>(new Map());
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [items, setItems] = useState<EditorLineItem[]>(
    initialValues.items.map((item) => ({ ...item })),
  );
  const [aiMissingInfo, setAiMissingInfo] = useState<
    AiQuoteDraft["missingInfo"]
  >([]);
  const [aiReadiness, setAiReadiness] = useState<AiQuoteReadiness | null>(null);
  const [aiGenerationId, setAiGenerationId] = useState<string | null>(null);
  const [aiClarificationMessage, setAiClarificationMessage] = useState<
    string | null
  >(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryInitialTab, setLibraryInitialTab] = useState<string | null>(null);
  const [hasLoadedLibrary, setHasLoadedLibrary] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [pendingTemplateEntry, setPendingTemplateEntry] = useState<DashboardQuoteLibraryEntry | null>(null);
  const [savedValues, setSavedValues] = useState(() =>
    normalizeQuoteEditorValues(initialValues),
  );
  const submittedValuesRef = useRef<QuoteEditorValues>(
    normalizeQuoteEditorValues(initialValues),
  );
  const visibleItems = useMemo(() => getVisibleEditorItems(items), [items]);
  const deferredVisibleItems = useDeferredValue(visibleItems);
  const deferredDiscount = useDeferredValue(discount);
  const deferredDiscountType = useDeferredValue(discountType);
  const deferredTax = useDeferredValue(tax);
  const deferredTaxType = useDeferredValue(taxType);
  const serializedItems = useMemo(
    () =>
      visibleItems.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPriceInCents: item.unitPrice,
        aiReview: item.aiReview ?? undefined,
        aiProductStatus: item.aiProductStatus ?? undefined,
        aiProductLibraryEntryId: item.aiProductLibraryEntryId ?? undefined,
        aiProductLibraryItemId: item.aiProductLibraryItemId ?? undefined,
        aiEvidence: item.aiEvidence ?? undefined,
      })),
    [visibleItems],
  );
  const previewItems = useMemo(
    () => getQuotePreviewItems(deferredVisibleItems),
    [deferredVisibleItems],
  );
  const totals = useMemo(
    () => calculateQuoteEditorTotals(deferredVisibleItems, deferredDiscount, deferredDiscountType, deferredTax, deferredTaxType),
    [deferredDiscount, deferredDiscountType, deferredTax, deferredTaxType, deferredVisibleItems],
  );
  const itemsNeedingReview = useMemo(
    () =>
      visibleItems.filter((item) => {
        if (!item.aiReview?.reviewStatus) return false;
        return (
          item.aiReview.reviewStatus === "needs_review" ||
          item.aiReview.reviewStatus === "no_pricing_found"
        );
      }),
    [visibleItems],
  );
  const hasItemsNeedingReview = itemsNeedingReview.length > 0;
  const currentValues = useMemo<QuoteEditorValues>(
    () => ({
      title,
      customerName,
      customerEmail: getEffectiveCustomerEmail({
        customerEmail,
        customerContactMethod,
        customerContactHandle,
      }),
      customerContactMethod,
      customerContactHandle,
      notes,
      terms,
      validUntil,
      discount,
      discountType,
      tax,
      taxType,
      taxLabel,
      items: visibleItems,
    }),
    [customerEmail, customerContactMethod, customerContactHandle, customerName, discount, discountType, tax, taxType, taxLabel, notes, terms, title, validUntil, visibleItems],
  );
  const effectiveCustomerEmail = currentValues.customerEmail;
  const hasUnsavedChanges =
    showFloatingUnsavedChanges &&
    !areQuoteEditorValuesEqual(currentValues, savedValues);
  const { shouldRenderFloatingActions, floatingActionsState } =
    useFloatingUnsavedChanges(hasUnsavedChanges);
  const [state, formAction, isPending] = useActionState(
    async (prevState: QuoteEditorActionState, formData: FormData) => {
      const nextState = await action(prevState, formData);
      const firstFieldError = nextState.fieldErrors
        ? Object.values(nextState.fieldErrors).find((errors) => errors?.[0])?.[0]
        : undefined;

      if (nextState.success) {
        toast.success(nextState.success);
        // The quote totals, the send panel and the follow-up summary all live
        // in server-rendered regions on this route. Without a refresh they keep
        // showing the pre-save values (including a stale total).
        scheduleRefresh();
      }

      if (firstFieldError || nextState.error) {
        toast.error(
          getUserSafeErrorMessage(
            new Error(firstFieldError ?? nextState.error ?? ""),
            "Check the form and try again.",
          ),
        );
      }

      if (nextState.success && showFloatingUnsavedChanges) {
        setSavedValues(cloneQuoteEditorValues(submittedValuesRef.current));
      }

      return nextState;
    },
    initialState,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const lineItemTimers = lineItemTimersRef.current;

    return () => {
      for (const timeoutId of lineItemTimers.values()) {
        window.clearTimeout(timeoutId);
      }

      lineItemTimers.clear();
    };
  }, []);

  function clearLineItemTimers() {
    const lineItemTimers = lineItemTimersRef.current;

    for (const timeoutId of lineItemTimers.values()) {
      window.clearTimeout(timeoutId);
    }

    lineItemTimers.clear();
  }

  function resetEditor(values: QuoteEditorValues) {
    clearLineItemTimers();
    setTitle(values.title);
    setCustomerName(values.customerName);
    setCustomerEmail(values.customerEmail ?? "");
    setCustomerContactMethod(values.customerContactMethod);
    setCustomerContactHandle(values.customerContactHandle);
    setNotes(values.notes);
    setTerms(values.terms);
    setValidUntil(values.validUntil);
    setDiscount(values.discount);
    setDiscountType(values.discountType);
    setTax(values.tax);
    setTaxType(values.taxType);
    setTaxLabel(values.taxLabel);
    setItems(values.items.map((item) => ({ ...item })));
    setAiMissingInfo([]);
    setAiReadiness(null);
    setAiGenerationId(null);
    setAiClarificationMessage(null);
  }

  function handleCancelChanges() {
    resetEditor(savedValues);
  }

  function handleLibraryOpenChange(open: boolean) {
    if (open) {
      setHasLoadedLibrary(true);
    } else {
      setLibraryInitialTab(null);
    }

    setIsLibraryOpen(open);
  }

  function scheduleLineItemTimeout(
    itemId: string,
    callback: () => void,
    duration: number,
  ) {
    const lineItemTimers = lineItemTimersRef.current;
    const existingTimer = lineItemTimers.get(itemId);

    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timeoutId = window.setTimeout(() => {
      callback();
      lineItemTimers.delete(itemId);
    }, prefersReducedMotion ? 0 : duration);

    lineItemTimers.set(itemId, timeoutId);
  }

  function scheduleItemEnter(itemId: string) {
    scheduleLineItemTimeout(
      itemId,
      () => {
        // No-op: previously cleared animation motionState.
        // Kept to preserve timer cleanup on unmount.
      },
      LINE_ITEM_ENTER_DURATION_MS,
    );
  }

  function updateItem(
    itemId: string,
    patch: Partial<EditorLineItem>,
  ) {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const nextItem: EditorLineItem = { ...item, ...patch };

        // If the owner edits a generated line item (description or price),
        // the AI provenance is no longer valid: downgrade to owner_set and
        // clear stale library references so the server never re-attributes
        // the price to a source the owner changed.
        if (nextItem.aiReview && (patch.description !== undefined || patch.unitPrice !== undefined)) {
          const needsReview =
            nextItem.aiReview.reviewStatus === "needs_review" ||
            nextItem.aiReview.reviewStatus === "no_pricing_found";
          const priceCents = parseCurrencyInputToCents(nextItem.unitPrice);

          if (patch.unitPrice !== undefined && needsReview && priceCents > 0) {
            nextItem.aiReview = {
              ...nextItem.aiReview,
              reviewStatus: "matched",
              pricingSource: "owner_brief",
              pricingSourceLabel: "Owner-set price",
            };
          }

          nextItem.aiProductStatus = "owner_set";
          nextItem.aiProductLibraryEntryId = null;
          nextItem.aiProductLibraryItemId = null;
          nextItem.aiEvidence = null;
        }

        return nextItem;
      }),
    );
  }

  function removeItem(itemId: string) {
    if (visibleItems.length === 1) {
      return;
    }

    setItems((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  async function saveLineItemToPricing(itemId: string) {
    const item = items.find((row) => row.id === itemId);

    if (!item) {
      return;
    }

    const description = item.description.trim();
    const quantity = Number.parseInt(item.quantity.trim(), 10);
    const unitPriceInCents = parseCurrencyInputToCents(item.unitPrice);

    const result = await saveQuoteLineItemToPricingLibrary({
      description,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitPriceInCents,
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    updateItem(itemId, {
      aiReview: {
        name: result.entryName,
        pricingSource: "pricing_library_block",
        pricingSourceLabel: "Pricing library",
        confidence: "high",
        reviewStatus: "matched",
        reason: "Saved to your pricing library for future quotes.",
      },
    });
    toast.success(`Saved "${result.entryName}" to pricing.`);
    scheduleRefresh();
  }

  function insertPricingEntry(entry: DashboardQuoteLibraryEntry) {
    if (entry.currency !== currency) {
      return;
    }

    const copiedItems = entry.items.map((item) => ({
      ...createQuoteEditorLineItemFromLibraryItem(item),
    }));

    for (const item of copiedItems) {
      scheduleItemEnter(item.id);
    }

    setItems((currentItems) => {
      const shouldReplacePlaceholder =
        visibleItems.length === 1 &&
        isQuoteEditorLineItemBlank(visibleItems[0]);

      return shouldReplacePlaceholder
        ? copiedItems
        : [...currentItems, ...copiedItems];
    });
    setIsLibraryOpen(false);
  }

  function applyTemplate(entry: DashboardQuoteLibraryEntry) {
    if (entry.kind !== "template" || !entry.title || !entry.validityDays) {
      return;
    }

    // Check if the form has meaningful content that would be lost
    const hasContent =
      title.trim() !== "" ||
      items.some((item) => !isQuoteEditorLineItemBlank(item));

    if (hasContent) {
      // Show confirmation dialog
      setPendingTemplateEntry(entry);
      return;
    }

    executeTemplateApply(entry);
  }

  function executeTemplateApply(entry: DashboardQuoteLibraryEntry) {
    if (!entry.title || !entry.validityDays) {
      return;
    }

    const templateData = {
      title: entry.title,
      notes: entry.notes,
      terms: entry.terms,
      validityDays: entry.validityDays,
      items: entry.items.map((item) => ({
        id: crypto.randomUUID(),
        description: item.description,
        quantity: item.quantity,
        unitPriceInCents: item.unitPriceInCents,
      })),
    };

    const applied = applyTemplateToQuoteForm(templateData, businessDefaults);

    clearLineItemTimers();
    setTitle(applied.title);
    setNotes(applied.notes);
    setTerms(applied.terms);
    setValidUntil(applied.validUntil);
    setItems(
      applied.items.map((item) =>
        createQuoteEditorLineItemValue({
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: centsToMoneyInput(item.unitPriceInCents),
        }),
      ),
    );
    setIsLibraryOpen(false);
    setPendingTemplateEntry(null);
    toast.success(`Template "${entry.name}" applied.`);
  }

  function handleConfirmTemplateApply() {
    if (pendingTemplateEntry) {
      executeTemplateApply(pendingTemplateEntry);
    }
  }

  function handleCancelTemplateApply() {
    setPendingTemplateEntry(null);
  }

  function applyAiDraft(draft: AiQuoteDraft) {
    clearLineItemTimers();

    const draftItems = draft.items.length
      ? draft.items.map((item) =>
          createQuoteEditorLineItemValue({
            description: item.description,
            quantity: String(item.quantity),
            unitPrice: centsToMoneyInput(item.unitPriceInCents),
            aiReview: {
              name: item.name,
              pricingSource: item.pricingSource,
              pricingSourceLabel: item.pricingSourceLabel,
              confidence: item.confidence,
              reviewStatus: item.reviewStatus,
              reason: item.reason,
            },
            aiProductStatus: item.aiProductStatus ?? undefined,
            aiProductLibraryEntryId: item.aiEvidence?.entryId ?? null,
            aiProductLibraryItemId: item.aiEvidence?.itemId ?? null,
            aiEvidence: item.aiEvidence,
          }),
        )
      : [createQuoteEditorLineItem()];

    setItems(draftItems.map((item) => ({ ...item, isAiGenerated: true })));
    setAiReadiness(draft.readiness);
    setAiGenerationId(draft.aiGenerationId);
    // Preserve previously-surfaced missing info on regeneration: if the model
    // returns nothing this round, the older list is still relevant for the
    // owner. Only replace when the new draft brings its own list.
    if (draft.missingInfo.length) {
      setAiMissingInfo(draft.missingInfo);
    }
    if (draft.clarificationMessage || draft.missingInfo.length) {
      setAiClarificationMessage(
        draft.clarificationMessage ?? aiClarificationMessage,
      );
    }

    for (const item of draftItems) {
      scheduleItemEnter(item.id);
    }

    // Clear glow after animation completes
    setTimeout(() => {
      setItems((currentItems) =>
        currentItems.map((item) => ({ ...item, isAiGenerated: false })),
      );
    }, 2500);
  }

  async function generateWithAi() {
    setIsAiGenerating(true);

    const formData = new FormData();
    if (linkedInquiry) {
      formData.set("inquiryId", linkedInquiry.id);
    }

    // Combine the quote title and notes into the brief so the assistant has
    // the owner's full context, not just the title. Works for both manual
    // quotes and ones linked to an inquiry (notes there add extra context on
    // top of the inquiry record).
    const briefParts: string[] = [];
    if (title.trim()) {
      briefParts.push(`Quote title: ${title.trim()}`);
    }
    if (notes.trim()) {
      briefParts.push(`Owner notes:\n${notes.trim()}`);
    }
    // The brief field is capped at 2000 chars by the server schema.
    // Trim from the start of the notes section if needed; the title is short.
    const MAX_BRIEF_LENGTH = 2000;
    let brief = briefParts.join("\n\n");
    if (brief.length > MAX_BRIEF_LENGTH) {
      brief = brief.slice(0, MAX_BRIEF_LENGTH);
    }

    if (brief) {
      formData.set("brief", brief);
    }

    if (revisionComment) {
      formData.set("revisionComment", revisionComment);

      // Pass current line items as both text (for prompt) and JSON (for merge logic)
      const validItems = items.filter((item) => item.description.trim());

      const currentItemsSummary = validItems
        .map((item) => {
          const qty = parseInt(item.quantity, 10) || 1;
          const price = item.unitPrice.trim() || "0";
          return `- ${item.description.trim()} (qty: ${qty}, unit price: $${price})`;
        })
        .join("\n");

      if (currentItemsSummary) {
        formData.set("currentItems", currentItemsSummary);
      }

      const currentItemsJson = validItems.map((item) => ({
        description: item.description.trim(),
        quantity: parseInt(item.quantity, 10) || 1,
        unitPriceInCents: parseCurrencyInputToCents(item.unitPrice),
      }));

      if (currentItemsJson.length > 0) {
        formData.set("currentItemsJson", JSON.stringify(currentItemsJson));
      }
    }

    const result = await generateQuoteDraftAction(businessSlug, {}, formData);

    setIsAiGenerating(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.draft) {
      applyAiDraft(result.draft);
      const { itemsNeedingReview, missingInfo } = result.draft;
      if (itemsNeedingReview > 0) {
        toast.warning(
          itemsNeedingReview === 1
            ? "Line items generated. 1 item needs your pricing review."
            : `Line items generated. ${itemsNeedingReview} items need your pricing review.`,
        );
      } else if (missingInfo.length) {
        toast.success("Line items generated. Missing details found.");
      } else {
        toast.success("Line items generated.");
      }
    }
  }

  return (
    <form
      action={formAction}
      className={cn(
        "dashboard-detail-layout items-start xl:grid-cols-[minmax(0,1.08fr)_0.92fr]",
        shouldRenderFloatingActions && "pb-28",
      )}
      onSubmitCapture={() => {
        submittedValuesRef.current = cloneQuoteEditorValues(currentValues);
      }}
    >
      <input name="items" type="hidden" value={JSON.stringify(serializedItems)} />
      <input name="aiReadiness" type="hidden" value={aiReadiness ?? ""} />
      <input name="aiGenerationId" type="hidden" value={aiGenerationId ?? ""} />
      <input name="aiMissingInfo" type="hidden" value={JSON.stringify(aiMissingInfo)} />
      <input name="customerEmail" type="hidden" value={effectiveCustomerEmail ?? ""} />
      <input name="notes" type="hidden" value={notes} />

      <DashboardSidebarStack className="min-w-0">
        <DashboardSection
          action={
            <>
              {quoteNumber ? (
                <DashboardMetaPill className="text-foreground">
                  {quoteNumber}
                </DashboardMetaPill>
              ) : null}
              <DashboardMetaPill>{currency}</DashboardMetaPill>
            </>
          }
          contentClassName="flex flex-col gap-5"
          title="Quote details"
        >
          {linkedInquiry ? (
            <LinkedInquiryPanel
              businessSlug={businessSlug}
              inquiry={linkedInquiry}
            />
          ) : null}

          <FieldGroup>
            <Field data-invalid={Boolean(state.fieldErrors?.title) || undefined}>
              <FieldLabel htmlFor="quote-title">Quote title</FieldLabel>
              <FieldContent>
                <Input
                  id="quote-title"
                  maxLength={160}
                  minLength={2}
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  placeholder="Website design proposal, banner printing quote"
                  required
                  disabled={isPending}
                />
                <FieldError
                  errors={
                    state.fieldErrors?.title?.[0]
                      ? [{ message: state.fieldErrors.title[0] }]
                      : undefined
                  }
                />
              </FieldContent>
            </Field>

            {customerFieldsLocked ? (
              <>
                <input type="hidden" name="customerName" value={customerName} />
                <input type="hidden" name="customerContactHandle" value={customerContactHandle} />
              </>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                data-invalid={Boolean(state.fieldErrors?.customerName) || undefined}
              >
                <FieldLabel htmlFor="quote-customer-name">
                  Customer name
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="quote-customer-name"
                    maxLength={120}
                    minLength={2}
                    name={customerFieldsLocked ? undefined : "customerName"}
                    value={customerName}
                    onChange={(event) =>
                      setCustomerName(event.currentTarget.value)
                    }
                    placeholder="Jordan Rivera"
                    required
                    disabled={isPending || customerFieldsLocked}
                  />
                  <FieldError
                    errors={
                      state.fieldErrors?.customerName?.[0]
                        ? [{ message: state.fieldErrors.customerName[0] }]
                        : undefined
                    }
                  />
                </FieldContent>
              </Field>

              <Field
                data-invalid={
                  Boolean(state.fieldErrors?.customerContactHandle) || undefined
                }
              >
                <FieldLabel htmlFor="quote-customer-contact-handle">
                  {getQuoteContactHandleLabel(customerContactMethod)}
                </FieldLabel>
                <FieldContent>
                  <Input
                    key={customerContactMethod}
                    disabled={isPending || customerFieldsLocked}
                    id="quote-customer-contact-handle"
                    maxLength={320}
                    name={customerFieldsLocked ? undefined : "customerContactHandle"}
                    type={customerContactMethod === "email" ? "email" : "text"}
                    autoComplete={customerContactMethod === "email" ? "email" : "off"}
                    inputMode={customerContactMethod === "phone" || customerContactMethod === "whatsapp" ? "tel" : "text"}
                    placeholder={
                      customerContactMethod === "email"
                        ? "jordan@example.com"
                        : customerContactMethod === "phone" || customerContactMethod === "whatsapp"
                          ? "+1 (555) 000-0000"
                          : customerContactMethod === "facebook"
                            ? "facebook.com/username"
                            : customerContactMethod === "instagram"
                              ? "@username"
                              : "Details"
                    }
                    required
                    value={customerContactHandle}
                    onChange={(event) =>
                      setCustomerContactHandle(event.currentTarget.value)
                    }
                  />
                  <FieldError
                    errors={
                      state.fieldErrors?.customerContactHandle?.[0]
                        ? [{ message: state.fieldErrors.customerContactHandle[0] }]
                        : undefined
                    }
                  />
                </FieldContent>
              </Field>
            </div>

            <Field
              data-invalid={
                Boolean(state.fieldErrors?.customerContactMethod) || undefined
              }
            >
              <FieldLabel htmlFor="quote-customer-contact-method">
                Preferred channel
              </FieldLabel>
              <FieldContent>
                <input type="hidden" name="customerContactMethod" value={customerContactMethod} />
                <Combobox
                  disabled={isPending || customerFieldsLocked}
                  id="quote-customer-contact-method"
                  onValueChange={(value) => {
                    if (value) {
                      setCustomerContactMethod(value as InquiryContactMethod);
                    }
                  }}
                  options={inquiryContactMethods.map((method) => ({
                    label: inquiryContactMethodLabels[method],
                    value: method,
                  }))}
                  placeholder="Select..."
                  value={customerContactMethod}
                />
                <FieldError
                  errors={
                    state.fieldErrors?.customerContactMethod?.[0]
                      ? [{ message: state.fieldErrors.customerContactMethod[0] }]
                      : undefined
                  }
                />
              </FieldContent>
            </Field>

          </FieldGroup>
        </DashboardSection>

        {/* ─── Section 2: Line items ─── */}
        <DashboardSection
          className={cn(isAiGenerating && "ai-glow-section")}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const nextItem = createQuoteEditorLineItem();
                setItems((currentItems) => [...currentItems, nextItem]);
                scheduleItemEnter(nextItem.id);
              }}
              disabled={isPending}
            >
              <Plus data-icon="inline-start" />
              Add item
            </Button>
          }
          contentClassName="flex flex-col gap-3"
          title="Line items"
        >
          {/* Quick actions toolbar */}
          {(canUseAiGenerator || pricingLibrary.length > 0) ? (
            <div className="flex flex-wrap items-center gap-2">
              {canUseAiGenerator ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={generateWithAi}
                  disabled={
                    isPending ||
                    isAiGenerating ||
                    (!linkedInquiry && !title.trim() && !notes.trim())
                  }
                >
                  {isAiGenerating ? (
                    <>
                      <Spinner aria-hidden="true" data-icon="inline-start" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles data-icon="inline-start" />
                      Generate with AI
                    </>
                  )}
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="ghost" disabled={isPending}>
                    <FileText data-icon="inline-start" />
                    Library
                    <ChevronDown data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => {
                      setLibraryInitialTab("template");
                      setHasLoadedLibrary(true);
                      setIsLibraryOpen(true);
                    }}
                  >
                    Use template
                  </DropdownMenuItem>
                  {pricingLibrary.some((e) => e.kind !== "template") ? (
                    <DropdownMenuItem onClick={() => handleLibraryOpenChange(true)}>
                      Insert saved pricing
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}

          {aiMissingInfo.length ? (
            <AiMissingInfoPanel
              clarificationMessage={aiClarificationMessage}
              missingInfo={aiMissingInfo}
            />
          ) : null}

          {hasItemsNeedingReview ? (
            <AiPricingReviewPanel
              itemCount={itemsNeedingReview.length}
              items={itemsNeedingReview}
            />
          ) : null}

          <QuoteLineItemsReorderGroup
            items={items}
            onReorder={setItems}
          >
            {items.map((item, index) => {
              const unitPriceInCents = parseCurrencyInputToCents(item.unitPrice);
              const quantity = Number.parseInt(item.quantity.trim(), 10);
              const safeQuantity =
                Number.isFinite(quantity) && quantity > 0 ? quantity : 0;

              return (
                <LineItemCard
                  key={item.id}
                  item={item}
                  index={index}
                  currency={currency}
                  unitPriceInCents={unitPriceInCents}
                  safeQuantity={safeQuantity}
                  isPending={isPending}
                  canRemove={visibleItems.length > 1}
                  canSaveToPricing={canUseQuoteLibrary}
                  onSaveToPricing={saveLineItemToPricing}
                  onUpdate={updateItem}
                  onRemove={removeItem}
                  formatMoney={formatQuoteMoney}
                />
              );
            })}
          </QuoteLineItemsReorderGroup>

          {/* Totals summary */}
          <div className="mt-2 flex flex-col gap-2.5 border-t border-border/60 pt-4">
            <TotalsRow
              label="Subtotal"
              value={formatQuoteMoney(totals.subtotalInCents, currency)}
            />
            {totals.discountInCents > 0 ? (
              <TotalsRow
                label="Discount"
                value={`-${formatQuoteMoney(totals.discountInCents, currency)}`}
              />
            ) : null}
            {totals.taxInCents > 0 ? (
              <TotalsRow
                label="Tax"
                value={formatQuoteMoney(totals.taxInCents, currency)}
              />
            ) : null}
            <Separator />
            <TotalsRow
              label="Total"
              value={formatQuoteMoney(totals.totalInCents, currency)}
              strong
            />
          </div>
        </DashboardSection>

        {/* ─── Section 3: Pricing & notes ─── */}
        <DashboardSection
          contentClassName="flex flex-col gap-5"
          title="Pricing & notes"
          footer={
            showFloatingUnsavedChanges ? undefined : (
              <Button disabled={isPending} size="lg" type="submit">
                {isPending ? (
                  <>
                    <Spinner data-icon="inline-start" aria-hidden="true" />
                    {submitPendingLabel}
                  </>
                ) : (
                  submitLabel
                )}
              </Button>
            )
          }
          footerClassName="w-full sm:justify-end"
        >
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field
                data-invalid={Boolean(state.fieldErrors?.validUntil) || undefined}
              >
                <FieldLabel htmlFor="quote-valid-until">Valid until</FieldLabel>
                <FieldContent>
                  <DatePicker
                    id="quote-valid-until"
                    name="validUntil"
                    onChange={setValidUntil}
                    required
                    value={validUntil}
                    disabled={isPending}
                  />
                  <FieldError
                    errors={
                      state.fieldErrors?.validUntil?.[0]
                        ? [{ message: state.fieldErrors.validUntil[0] }]
                        : undefined
                    }
                  />
                </FieldContent>
              </Field>

              <Field
                data-invalid={Boolean(state.fieldErrors?.discount) || undefined}
              >
                <FieldLabel htmlFor="quote-discount">Discount</FieldLabel>
                <FieldContent>
                  <input name="discount" type="hidden" value={discount} />
                  <input
                    name="discountType"
                    type="hidden"
                    value={discountType}
                  />
                  <div className="relative">
                    <Input
                      id="quote-discount"
                      className="pr-14"
                      inputMode="decimal"
                      max={discountType === "percentage" ? "100" : "1000000"}
                      placeholder={discountType === "percentage" ? "10" : "0.00"}
                      type="number"
                      min="0"
                      step={discountType === "percentage" ? "1" : "0.01"}
                      value={discount}
                      onChange={(event) => setDiscount(event.currentTarget.value)}
                      disabled={isPending}
                    />
                    <div className="absolute inset-y-1 right-1 flex items-center">
                      <button
                        type="button"
                        onClick={() =>
                          setDiscountType((prev) =>
                            prev === "percentage" ? "amount" : "percentage",
                          )
                        }
                        className="flex h-full w-10 items-center justify-center rounded bg-muted/60 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Toggle discount type"
                      >
                        {discountType === "percentage"
                          ? "%"
                          : currency === "USD"
                            ? "$"
                            : currency}
                      </button>
                    </div>
                  </div>
                  <FieldError
                    errors={
                      state.fieldErrors?.discount?.[0]
                        ? [{ message: state.fieldErrors.discount[0] }]
                        : undefined
                    }
                  />
                </FieldContent>
              </Field>

              <Field
                data-invalid={Boolean(state.fieldErrors?.tax) || undefined}
              >
                <FieldLabel htmlFor="quote-tax">Tax</FieldLabel>
                <FieldContent>
                  <input name="tax" type="hidden" value={tax} />
                  <input name="taxType" type="hidden" value={taxType} />
                  <input
                    name="taxLabel"
                    type="hidden"
                    value={taxLabel}
                  />
                  <div className="relative">
                    <Input
                      id="quote-tax"
                      className="pr-14"
                      inputMode="decimal"
                      max={taxType === "percentage" ? "100" : "1000000"}
                      placeholder={taxType === "percentage" ? "10" : "0.00"}
                      type="number"
                      min="0"
                      step={taxType === "percentage" ? "1" : "0.01"}
                      value={tax}
                      onChange={(event) => setTax(event.currentTarget.value)}
                      disabled={isPending}
                    />
                    <div className="absolute inset-y-1 right-1 flex items-center">
                      <button
                        type="button"
                        onClick={() =>
                          setTaxType((prev) =>
                            prev === "percentage" ? "amount" : "percentage",
                          )
                        }
                        className="flex h-full w-10 items-center justify-center rounded bg-muted/60 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Toggle tax type"
                      >
                        {taxType === "percentage"
                          ? "%"
                          : currency === "USD"
                            ? "$"
                            : currency}
                      </button>
                    </div>
                  </div>
                  <FieldError
                    errors={
                      state.fieldErrors?.tax?.[0]
                        ? [{ message: state.fieldErrors.tax[0] }]
                        : undefined
                    }
                  />
                </FieldContent>
              </Field>
            </div>

            <Field data-invalid={Boolean(state.fieldErrors?.notes) || undefined}>
              <FieldLabel htmlFor="quote-notes">Customer-facing notes</FieldLabel>
              <FieldContent>
                <Textarea
                  id="quote-notes"
                  maxLength={4000}
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.currentTarget.value)}
                  placeholder="Additional context visible to the customer on the quote."
                  disabled={isPending}
                />
                <FieldError
                  errors={
                    state.fieldErrors?.notes?.[0]
                      ? [{ message: state.fieldErrors.notes[0] }]
                      : undefined
                  }
                />
              </FieldContent>
            </Field>

            <Field data-invalid={Boolean(state.fieldErrors?.terms) || undefined}>
              <FieldLabel htmlFor="quote-terms">Terms & conditions</FieldLabel>
              <FieldContent>
                <Textarea
                  id="quote-terms"
                  maxLength={4000}
                  name="terms"
                  rows={3}
                  value={terms}
                  onChange={(event) => setTerms(event.currentTarget.value)}
                  placeholder="Payment terms, warranty, cancellation policy."
                  disabled={isPending}
                />
                <FieldError
                  errors={
                    state.fieldErrors?.terms?.[0]
                      ? [{ message: state.fieldErrors.terms[0] }]
                      : undefined
                  }
                />
              </FieldContent>
            </Field>
          </FieldGroup>
        </DashboardSection>
      </DashboardSidebarStack>

      <FloatingFormActions
        disableSubmit={!hasUnsavedChanges}
        isPending={isPending}
        message="You have unsaved quote changes."
        onCancel={handleCancelChanges}
        state={floatingActionsState}
        submitLabel={submitLabel}
        submitPendingLabel={submitPendingLabel}
        visible={shouldRenderFloatingActions}
      />

      {hasLoadedLibrary ? (
        <LazyQuoteLibrarySheet
          currency={currency}
          entries={pricingLibrary}
          initialTab={libraryInitialTab}
          items={items}
          onInsert={insertPricingEntry}
          onApplyTemplate={applyTemplate}
          open={isLibraryOpen}
          onOpenChange={handleLibraryOpenChange}
        />
      ) : null}

      <ApplyTemplateConfirmDialog
        open={pendingTemplateEntry !== null}
        templateName={pendingTemplateEntry?.name ?? ""}
        onConfirm={handleConfirmTemplateApply}
        onCancel={handleCancelTemplateApply}
      />

      <QuotePreview
        businessName={businessName}
        businessLogoStoragePath={businessLogoStoragePath}
        businessSlug={businessSlug}
        quoteNumber={quoteNumber ?? "Assigned after save"}
        title={title || "Untitled quote"}
        customerName={customerName || "Customer name"}
        customerEmail={effectiveCustomerEmail}
        currency={currency}
        validUntil={validUntil}
        notes={notes}
        terms={terms}
        items={previewItems}
        subtotalInCents={totals.subtotalInCents}
        discountInCents={totals.discountInCents}
        taxInCents={totals.taxInCents}
        taxLabel={taxLabel || undefined}
        totalInCents={totals.totalInCents}
        className="xl:sticky xl:top-6 xl:self-start"
      />
    </form>
  );
}
