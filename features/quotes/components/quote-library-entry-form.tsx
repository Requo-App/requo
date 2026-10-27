"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";

import { FormActions } from "@/components/shared/form-layout";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Combobox } from "@/components/ui/combobox";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type {
  QuoteEditorLineItemValue,
  QuoteLibraryActionState,
  QuoteLibraryEditorValues,
  QuoteLibraryEntryKind,
} from "@/features/quotes/types";
import {
  centsToMoneyInput,
  createQuoteEditorLineItem,
  createQuoteEditorLineItemValue,
  formatQuoteMoney,
  getQuoteLibraryEntryKindLabel,
} from "@/features/quotes/utils";
import { cn } from "@/lib/utils";

export type QuoteLibraryBlockReference = {
  id: string;
  name: string;
  currency: string;
  totalInCents: number;
  items: ReadonlyArray<{
    id: string;
    description: string;
    quantity: number;
    unitPriceInCents: number;
  }>;
};

type QuoteLibraryEntryFormProps = {
  action: (
    state: QuoteLibraryActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryActionState>;
  fixedKind?: QuoteLibraryEntryKind;
  initialValues?: QuoteLibraryEditorValues;
  submitLabel: string;
  submitPendingLabel: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  idPrefix?: string;
  layout?: "inline" | "dialog";
  aboveFields?: ReactNode;
  availableBlocks?: ReadonlyArray<QuoteLibraryBlockReference>;
};

const initialState: QuoteLibraryActionState = {};
const LINE_ITEM_ENTER_DURATION_MS = 220;
const LINE_ITEM_EXIT_DURATION_MS = 180;
const SAVE_REFRESH_DELAY_MS = 180;
const quoteLibraryKindOptions = [
  {
    label: getQuoteLibraryEntryKindLabel("block"),
    value: "block",
  },
  {
    label: getQuoteLibraryEntryKindLabel("package"),
    value: "package",
  },
  {
    label: getQuoteLibraryEntryKindLabel("template"),
    value: "template",
  },
];

type EditorLineItem = QuoteEditorLineItemValue & {
  motionState?: "entering" | "exiting";
};

export function QuoteLibraryEntryForm({
  action,
  fixedKind,
  initialValues,
  submitLabel,
  submitPendingLabel,
  onSuccess,
  onCancel,
  cancelLabel = "Cancel",
  idPrefix = "quote-library-entry",
  layout = "inline",
  aboveFields,
  availableBlocks,
}: QuoteLibraryEntryFormProps) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [state, formAction, isPending] = useActionStateWithSonner(
    action,
    initialState,
  );

  useEffect(() => {
    if (!state.success) {
      return;
    }

    onSuccess?.();

    const refreshDelay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : SAVE_REFRESH_DELAY_MS;
    const timeoutId = window.setTimeout(() => {
      scheduleRefresh();
    }, refreshDelay);

    return () => window.clearTimeout(timeoutId);
  }, [onSuccess, scheduleRefresh, state.success]);

  return (
    <form
      action={formAction}
      className={layout === "dialog" ? "flex min-h-0 flex-1 flex-col" : "form-stack"}
    >
      <QuoteLibraryEntryFormFields
        key={initialValues ? idPrefix : state.success ?? "quote-library-create"}
        aboveFields={aboveFields}
        availableBlocks={availableBlocks}
        cancelLabel={cancelLabel}
        fixedKind={fixedKind}
        idPrefix={idPrefix}
        initialValues={initialValues}
        isPending={isPending}
        layout={layout}
        onCancel={onCancel}
        state={state}
        submitLabel={submitLabel}
        submitPendingLabel={submitPendingLabel}
      />
    </form>
  );
}

function QuoteLibraryEntryFormFields({
  aboveFields,
  availableBlocks,
  cancelLabel,
  fixedKind,
  idPrefix,
  initialValues,
  isPending,
  layout,
  onCancel,
  state,
  submitLabel,
  submitPendingLabel,
}: {
  aboveFields?: ReactNode;
  availableBlocks?: ReadonlyArray<QuoteLibraryBlockReference>;
  cancelLabel: string;
  fixedKind?: QuoteLibraryEntryKind;
  idPrefix: string;
  initialValues?: QuoteLibraryEditorValues;
  isPending: boolean;
  layout: "inline" | "dialog";
  onCancel?: () => void;
  state: QuoteLibraryActionState;
  submitLabel: string;
  submitPendingLabel: string;
}) {
  const stableItemSeed = useId().replace(/:/g, "");
  const [kind, setKind] = useState(initialValues?.kind ?? fixedKind ?? "block");
  const [name, setName] = useState(initialValues?.name ?? "");
  const [templateTitle, setTemplateTitle] = useState(initialValues?.title ?? "");
  const [templateNotes, setTemplateNotes] = useState(initialValues?.notes ?? "");
  const [templateTerms, setTemplateTerms] = useState(initialValues?.terms ?? "");
  const [templateValidityDays, setTemplateValidityDays] = useState(initialValues?.validityDays ?? "14");
  const lineItemTimersRef = useRef<Map<string, number>>(new Map());
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [items, setItems] = useState<EditorLineItem[]>(() =>
    initialValues?.items.length
      ? initialValues.items.map((item) => ({ ...item }))
      : [
          {
            ...createQuoteEditorLineItemValue({
              id: `draft_item_${stableItemSeed}`,
            }),
          },
        ],
  );
  const visibleItems = items.filter((item) => item.motionState !== "exiting");
  const serializedItems = visibleItems.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unitPriceInCents: item.unitPrice,
  }));

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
      () =>
        setItems((currentItems) =>
          currentItems.map((item) =>
            item.id === itemId ? { ...item, motionState: undefined } : item,
          ),
        ),
      LINE_ITEM_ENTER_DURATION_MS,
    );
  }

  function updateItem(
    itemId: string,
    patch: Partial<EditorLineItem>,
  ) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    );
  }

  function removeItem(itemId: string) {
    if (visibleItems.length === 1) {
      return;
    }

    const currentItem = items.find((item) => item.id === itemId);

    if (!currentItem || currentItem.motionState === "exiting") {
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId ? { ...item, motionState: "exiting" } : item,
      ),
    );

    scheduleLineItemTimeout(
      itemId,
      () =>
        setItems((currentItems) =>
          currentItems.filter((item) => item.id !== itemId),
        ),
      LINE_ITEM_EXIT_DURATION_MS,
    );
  }

  function addItem() {
    const nextItem = {
      ...createQuoteEditorLineItem(),
      motionState: "entering" as const,
    };

    setItems((currentItems) => [...currentItems, nextItem]);
    scheduleItemEnter(nextItem.id);
  }

  function appendItemsFromBlock(block: QuoteLibraryBlockReference) {
    if (block.items.length === 0) {
      return;
    }

    const newItems: EditorLineItem[] = block.items.map((item) => ({
      ...createQuoteEditorLineItemValue({
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: centsToMoneyInput(item.unitPriceInCents),
      }),
      motionState: "entering",
    }));

    setItems((currentItems) => {
      // Drop the trailing blank line item (a brand-new package always seeds one
      // empty row) so the imported block lands cleanly without an empty row
      // before it. Existing filled rows are preserved.
      const trailing = currentItems[currentItems.length - 1];
      const trailingIsBlank =
        trailing &&
        trailing.motionState !== "exiting" &&
        !trailing.description.trim() &&
        !trailing.unitPrice.trim() &&
        currentItems.filter((it) => it.motionState !== "exiting").length === 1;

      const base = trailingIsBlank
        ? currentItems.slice(0, -1)
        : currentItems;

      return [...base, ...newItems];
    });

    for (const item of newItems) {
      scheduleItemEnter(item.id);
    }
  }

  function handleKindChange(nextKind: "block" | "package" | "template") {
    setKind(nextKind);

    if (nextKind === "block") {
      for (const timeoutId of lineItemTimersRef.current.values()) {
        window.clearTimeout(timeoutId);
      }

      lineItemTimersRef.current.clear();
    }

    setItems((currentItems) => {
      const activeItems = currentItems.filter(
        (item) => item.motionState !== "exiting",
      );

      if (nextKind === "block") {
        return [{ ...(activeItems[0] ?? createQuoteEditorLineItem()) }];
      }

      return activeItems.length
        ? activeItems
        : [{ ...createQuoteEditorLineItem() }];
    });
  }

  const submitButton = (
    <Button disabled={isPending} type="submit">
      {isPending ? (
        <>
          <Spinner data-icon="inline-start" aria-hidden="true" />
          {submitPendingLabel}
        </>
      ) : (
        submitLabel
      )}
    </Button>
  );

  const cancelButton = onCancel ? (
    <Button
      disabled={isPending}
      onClick={onCancel}
      type="button"
      variant="outline"
    >
      {cancelLabel}
    </Button>
  ) : null;

  const fieldsContent = (
    <>
      {aboveFields}

      <div className="grid gap-5">
        <div
          className={
            fixedKind ? "grid gap-5" : "grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]"
          }
        >
          {fixedKind ? null : (
            <Field data-invalid={Boolean(state.fieldErrors?.kind) || undefined}>
              <FieldLabel htmlFor={`${idPrefix}-kind`}>Entry type</FieldLabel>
              <FieldContent>
                <Combobox
                  aria-invalid={Boolean(state.fieldErrors?.kind) || undefined}
                  disabled={isPending}
                  id={`${idPrefix}-kind`}
                  onValueChange={(value) =>
                    handleKindChange(value as "block" | "package" | "template")
                  }
                  options={quoteLibraryKindOptions}
                  placeholder="Choose an entry type"
                  searchPlaceholder="Search entry type"
                  value={kind}
                />
                <FieldError
                  errors={
                    state.fieldErrors?.kind?.[0]
                      ? [{ message: state.fieldErrors.kind[0] }]
                      : undefined
                  }
                />
              </FieldContent>
            </Field>
          )}
          <Field data-invalid={Boolean(state.fieldErrors?.name) || undefined}>
            <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
            <FieldContent>
              <Input
                id={`${idPrefix}-name`}
                maxLength={120}
                minLength={2}
                name="name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="Standard window vinyl install"
                required
                aria-invalid={Boolean(state.fieldErrors?.name) || undefined}
                disabled={isPending}
              />
              <FieldError
                errors={
                  state.fieldErrors?.name?.[0]
                    ? [{ message: state.fieldErrors.name[0] }]
                    : undefined
                }
              />
            </FieldContent>
          </Field>
        </div>
      </div>

      {kind === "template" ? (
        <div className="grid gap-5">
          <Field data-invalid={Boolean(state.fieldErrors?.title) || undefined}>
            <FieldLabel htmlFor={`${idPrefix}-title`}>Quote title</FieldLabel>
            <FieldContent>
              <Input
                id={`${idPrefix}-title`}
                maxLength={200}
                name="title"
                value={templateTitle}
                onChange={(event) => setTemplateTitle(event.currentTarget.value)}
                placeholder="Website design proposal"
                required
                aria-invalid={Boolean(state.fieldErrors?.title) || undefined}
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

          <Field data-invalid={Boolean(state.fieldErrors?.validityDays) || undefined}>
            <FieldLabel htmlFor={`${idPrefix}-validity-days`}>Validity period (days)</FieldLabel>
            <FieldContent>
              <Input
                id={`${idPrefix}-validity-days`}
                inputMode="numeric"
                max="365"
                min="1"
                name="validityDays"
                required
                step="1"
                type="number"
                value={templateValidityDays}
                onChange={(event) => setTemplateValidityDays(event.currentTarget.value)}
                placeholder="14"
                aria-invalid={Boolean(state.fieldErrors?.validityDays) || undefined}
                disabled={isPending}
              />
              <FieldError
                errors={
                  state.fieldErrors?.validityDays?.[0]
                    ? [{ message: state.fieldErrors.validityDays[0] }]
                    : undefined
                }
              />
            </FieldContent>
          </Field>

          <Field data-invalid={Boolean(state.fieldErrors?.notes) || undefined}>
            <FieldLabel htmlFor={`${idPrefix}-notes`}>Default notes</FieldLabel>
            <FieldContent>
              <Textarea
                id={`${idPrefix}-notes`}
                maxLength={4000}
                name="notes"
                rows={3}
                value={templateNotes}
                onChange={(event) => setTemplateNotes(event.currentTarget.value)}
                placeholder="Additional context or instructions for the customer."
                disabled={isPending}
              />
              <FieldDescription>
                Leave blank to use your business default notes when this template is applied.
              </FieldDescription>
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
            <FieldLabel htmlFor={`${idPrefix}-terms`}>Default terms</FieldLabel>
            <FieldContent>
              <Textarea
                id={`${idPrefix}-terms`}
                maxLength={4000}
                name="terms"
                rows={3}
                value={templateTerms}
                onChange={(event) => setTemplateTerms(event.currentTarget.value)}
                placeholder="Payment terms, warranty, cancellation policy."
                disabled={isPending}
              />
              <FieldDescription>
                Leave blank to use your business default terms when this template is applied.
              </FieldDescription>
              <FieldError
                errors={
                  state.fieldErrors?.terms?.[0]
                    ? [{ message: state.fieldErrors.terms[0] }]
                    : undefined
                }
              />
            </FieldContent>
          </Field>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">
              {kind === "block" ? "Saved item" : "Saved items"}
            </p>
            {kind === "package" || kind === "template" ? (
              <p className="text-xs text-muted-foreground">
                {kind === "template"
                  ? "Line items that will be pre-filled when this template is applied."
                  : "Add items manually or pull them in from a saved block."}
              </p>
            ) : null}
          </div>
          {kind === "package" || kind === "template" ? (
            <div className="flex flex-wrap gap-2">
              {availableBlocks && availableBlocks.length > 0 ? (
                <BlockPicker
                  blocks={availableBlocks}
                  disabled={isPending || visibleItems.length >= 25}
                  onSelect={appendItemsFromBlock}
                />
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={addItem}
                disabled={isPending || visibleItems.length >= 25}
              >
                <Plus data-icon="inline-start" />
                Add item
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {items.map((item, index) => {
            return (
              <div
                className={cn(
                  "rounded-xl border border-border/70 bg-muted/60 p-4 motion-reduce:animate-none",
                  item.motionState === "entering" &&
                    "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200",
                  item.motionState === "exiting" &&
                    "pointer-events-none motion-safe:animate-out motion-safe:fade-out-0 motion-safe:slide-out-to-bottom-2 motion-safe:duration-150",
                )}
                data-motion-state={item.motionState}
                key={item.id}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    {kind === "package" || kind === "template" ? (
                      <>
                        <p className="text-sm font-medium text-foreground">
                          Item {index + 1}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeItem(item.id)}
                          disabled={
                            isPending ||
                            visibleItems.length === 1 ||
                            item.motionState === "exiting"
                          }
                        >
                          <Trash2 data-icon="inline-start" />
                          <span className="sr-only">Remove line item</span>
                        </Button>
                      </>
                    ) : null}
                  </div>

                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor={`${idPrefix}-description-${item.id}`}>
                        Description
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id={`${idPrefix}-description-${item.id}`}
                          maxLength={400}
                          value={item.description}
                          onChange={(event) =>
                            updateItem(item.id, {
                              description: event.currentTarget.value,
                            })
                          }
                          placeholder="Window vinyl production"
                          required
                          disabled={isPending}
                        />
                      </FieldContent>
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)]">
                      <Field>
                        <FieldLabel htmlFor={`${idPrefix}-quantity-${item.id}`}>
                          Quantity
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id={`${idPrefix}-quantity-${item.id}`}
                            inputMode="numeric"
                            max="999999999"
                            type="number"
                            min="1"
                            required
                            step="1"
                            value={item.quantity}
                            onChange={(event) =>
                              updateItem(item.id, {
                                quantity: event.currentTarget.value,
                              })
                            }
                            disabled={isPending}
                          />
                        </FieldContent>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor={`${idPrefix}-price-${item.id}`}>
                          Unit price
                        </FieldLabel>
                        <FieldContent>
                          <Input
                            id={`${idPrefix}-price-${item.id}`}
                            inputMode="decimal"
                            type="number"
                            max="1000000"
                            min="0"
                            required
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(event) =>
                              updateItem(item.id, {
                                unitPrice: event.currentTarget.value,
                              })
                            }
                            placeholder="0.00"
                            disabled={isPending}
                          />
                        </FieldContent>
                      </Field>
                    </div>
                  </FieldGroup>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  if (layout === "dialog") {
    return (
      <>
        <input name="kind" type="hidden" value={kind} />
        <input name="description" type="hidden" value="" />
        <input
          name="items"
          type="hidden"
          value={JSON.stringify(serializedItems)}
        />

        <DialogBody className="flex flex-col gap-6">{fieldsContent}</DialogBody>

        <DialogFooter>
          {cancelButton}
          {submitButton}
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <input name="kind" type="hidden" value={kind} />
      <input name="description" type="hidden" value="" />
      <input name="items" type="hidden" value={JSON.stringify(serializedItems)} />

      {fieldsContent}

      <FormActions>
        {cancelButton}
        {submitButton}
      </FormActions>
    </>
  );
}

function BlockPicker({
  blocks,
  disabled,
  onSelect,
}: {
  blocks: ReadonlyArray<QuoteLibraryBlockReference>;
  disabled: boolean;
  onSelect: (block: QuoteLibraryBlockReference) => void;
}) {
  const [open, setOpen] = useState(false);
  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => a.name.localeCompare(b.name)),
    [blocks],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button disabled={disabled} type="button" variant="outline">
          <Layers data-icon="inline-start" />
          Add from block
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(20rem,calc(100vw-1rem))] p-0"
      >
        <Command>
          <CommandInput placeholder="Search blocks" />
          <CommandList>
            <CommandEmpty>No blocks match.</CommandEmpty>
            <CommandGroup heading="Saved blocks">
              {sortedBlocks.map((block) => {
                const itemCount = block.items.length;

                return (
                  <CommandItem
                    key={block.id}
                    keywords={[block.name]}
                    onSelect={() => {
                      onSelect(block);
                      setOpen(false);
                    }}
                    value={block.id}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium text-foreground">
                        {block.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {formatQuoteMoney(block.totalInCents, block.currency)}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
