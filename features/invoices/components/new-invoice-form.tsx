"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  DashboardMetaPill,
  DashboardSection,
  DashboardSidebarStack,
} from "@/components/shared/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { getBusinessInvoicePath, getBusinessInvoicesPath } from "@/features/businesses/routes";
import type { InvoiceActionState } from "@/features/invoices/types";
import { formatQuoteMoney, parseMoneyToCents } from "@/features/invoices/utils";
import { InvoicePreview, type InvoicePreviewItem } from "@/features/invoices/components/invoice-preview";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { useProgressRouter } from "@/hooks/use-progress-router";

export type NewInvoiceQuoteSnapshot = {
  quoteNumber: string;
  title: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  items: Array<{ description: string; quantity: number; unitPriceInCents: number }>;
  discountInCents: number;
  taxInCents: number;
  taxLabel: string | null;
};

type NewInvoiceFormProps = {
  action: (state: InvoiceActionState, formData: FormData) => Promise<InvoiceActionState>;
  businessSlug: string;
  businessName: string;
  businessLogoStoragePath?: string | null;
  currency: string;
  quote: NewInvoiceQuoteSnapshot | null;
};

type EditableLineItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const initialState: InvoiceActionState = {};

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function parseQuantity(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseUnitPrice(value: string) {
  const parsed = parseMoneyToCents(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function createLineItem(): EditableLineItem {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: "1",
    unitPrice: "0",
  };
}

export function NewInvoiceForm({
  action,
  businessSlug,
  businessName,
  businessLogoStoragePath,
  currency,
  quote,
}: NewInvoiceFormProps) {
  const router = useProgressRouter();
  const [state, formAction, isPending] = useActionStateWithSonner(action, initialState);
  const isQuoteSourced = Boolean(quote);

  const [title, setTitle] = useState(quote?.title ?? "Invoice");
  const [customerName, setCustomerName] = useState(quote?.customerName ?? "");
  const [customerEmail, setCustomerEmail] = useState(quote?.customerEmail ?? "");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [rows, setRows] = useState<EditableLineItem[]>(() => [createLineItem()]);

  useEffect(() => {
    if (state.success && state.invoiceId) {
      router.replace(getBusinessInvoicePath(businessSlug, state.invoiceId));
    }
  }, [businessSlug, router, state.invoiceId, state.success]);

  const itemsError = state.fieldErrors?.items?.[0];
  const itemsJson = quote
    ? JSON.stringify(quote.items)
    : JSON.stringify(
        rows.map((row) => ({
          description: row.description,
          quantity: row.quantity,
          unitPriceInCents: row.unitPrice,
        })),
      );

  const parsedRows = useMemo(
    () =>
      rows.map((row) => {
        const quantity = parseQuantity(row.quantity);
        const unitPriceInCents = parseUnitPrice(row.unitPrice);
        return { ...row, quantity, unitPriceInCents, lineTotalInCents: quantity * unitPriceInCents };
      }),
    [rows],
  );

  const quotePreviewItems: InvoicePreviewItem[] = useMemo(
    () =>
      (quote?.items ?? []).map((item, index) => ({
        id: `quote-item-${index}`,
        description: item.description,
        quantity: item.quantity,
        unitPriceInCents: item.unitPriceInCents,
        lineTotalInCents: item.quantity * item.unitPriceInCents,
      })),
    [quote],
  );

  const previewItems: InvoicePreviewItem[] = quote ? quotePreviewItems : parsedRows;

  const subtotalInCents = previewItems.reduce((sum, item) => sum + item.lineTotalInCents, 0);
  const discountInCents = quote ? quote.discountInCents : (parseUnitPrice(discount) || 0);
  const taxInCents = quote ? quote.taxInCents : (parseUnitPrice(tax) || 0);
  const totalInCents = Math.max(0, subtotalInCents - discountInCents) + taxInCents;

  function updateRow(index: number, patch: Partial<EditableLineItem>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => (current.length >= 100 ? current : [...current, createLineItem()]));
  }

  function removeRow(index: number) {
    setRows((current) => (current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : current));
  }

  return (
    <form action={formAction} className="dashboard-detail-layout items-start xl:grid-cols-[minmax(0,1.08fr)_0.92fr]">
      <input type="hidden" name="customerContactMethod" value={quote?.customerContactMethod ?? "email"} />
      <input type="hidden" name="customerContactHandle" value={quote?.customerContactHandle ?? ""} />
      <input type="hidden" name="taxLabel" value={quote?.taxLabel ?? ""} />
      <input type="hidden" name="items" value={itemsJson} />

      <DashboardSidebarStack className="min-w-0">
        <DashboardSection
          action={<DashboardMetaPill>{currency}</DashboardMetaPill>}
          contentClassName="flex flex-col gap-5"
          title="Invoice details"
          description={
            quote
              ? `Converting accepted quote ${quote.quoteNumber}. Items, discount, and tax stay synced with the quote.`
              : "Who this invoice bills and when it is due."
          }
        >
          <FieldGroup>
            <Field data-invalid={Boolean(state.fieldErrors?.title) || undefined}>
              <FieldLabel htmlFor="invoice-title">Title</FieldLabel>
              <FieldContent>
                <Input
                  aria-invalid={Boolean(state.fieldErrors?.title) || undefined}
                  disabled={isPending}
                  id="invoice-title"
                  maxLength={200}
                  name="title"
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  placeholder="Website redesign, monthly retainer"
                  required
                  value={title}
                />
                <FieldError errors={state.fieldErrors?.title?.map((message) => ({ message }))} />
              </FieldContent>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(state.fieldErrors?.customerName) || undefined}>
                <FieldLabel htmlFor="invoice-customer">Customer name</FieldLabel>
                <FieldContent>
                  <Input
                    aria-invalid={Boolean(state.fieldErrors?.customerName) || undefined}
                    disabled={isPending}
                    id="invoice-customer"
                    maxLength={200}
                    name="customerName"
                    onChange={(event) => setCustomerName(event.currentTarget.value)}
                    placeholder="Jordan Rivera"
                    required
                    value={customerName}
                  />
                  <FieldError errors={state.fieldErrors?.customerName?.map((message) => ({ message }))} />
                </FieldContent>
              </Field>
              <Field data-invalid={Boolean(state.fieldErrors?.customerEmail) || undefined}>
                <FieldLabel htmlFor="invoice-email">Customer email</FieldLabel>
                <FieldContent>
                  <Input
                    aria-invalid={Boolean(state.fieldErrors?.customerEmail) || undefined}
                    disabled={isPending}
                    id="invoice-email"
                    maxLength={320}
                    name="customerEmail"
                    onChange={(event) => setCustomerEmail(event.currentTarget.value)}
                    placeholder="jordan@example.com"
                    type="email"
                    value={customerEmail}
                  />
                  <FieldError errors={state.fieldErrors?.customerEmail?.map((message) => ({ message }))} />
                </FieldContent>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(state.fieldErrors?.issueDate) || undefined}>
                <FieldLabel htmlFor="invoice-issue">Issue date</FieldLabel>
                <FieldContent>
                  <Input
                    aria-invalid={Boolean(state.fieldErrors?.issueDate) || undefined}
                    disabled={isPending}
                    id="invoice-issue"
                    name="issueDate"
                    onChange={(event) => setIssueDate(event.currentTarget.value)}
                    required
                    type="date"
                    value={issueDate}
                  />
                  <FieldError errors={state.fieldErrors?.issueDate?.map((message) => ({ message }))} />
                </FieldContent>
              </Field>
              <Field data-invalid={Boolean(state.fieldErrors?.dueDate) || undefined}>
                <FieldLabel htmlFor="invoice-due">Due date</FieldLabel>
                <FieldContent>
                  <Input
                    aria-invalid={Boolean(state.fieldErrors?.dueDate) || undefined}
                    disabled={isPending}
                    id="invoice-due"
                    name="dueDate"
                    onChange={(event) => setDueDate(event.currentTarget.value)}
                    required
                    type="date"
                    value={dueDate}
                  />
                  <FieldError errors={state.fieldErrors?.dueDate?.map((message) => ({ message }))} />
                </FieldContent>
              </Field>
            </div>
          </FieldGroup>
        </DashboardSection>

        <DashboardSection
          action={
            isQuoteSourced ? null : (
              <Button disabled={isPending} onClick={addRow} type="button" variant="outline">
                <Plus data-icon="inline-start" />
                Add item
              </Button>
            )
          }
          contentClassName="flex flex-col gap-3"
          title="Line items"
          description={
            isQuoteSourced
              ? "Copied from the accepted quote. The invoice keeps its own snapshot."
              : "What this invoice charges for."
          }
        >
          {isQuoteSourced ? (
            <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/75 bg-background/95">
              {quotePreviewItems.map((item) => (
                <div className="flex items-center justify-between gap-3 px-4 py-3" key={item.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.description || "Line item"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × {formatQuoteMoney(item.unitPriceInCents, currency)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    {formatQuoteMoney(item.lineTotalInCents, currency)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {parsedRows.map((row, index) => (
                <div className="rounded-xl border border-border/75 bg-background/95 p-3" key={row.id}>
                  <Input
                    aria-label={`Line item ${index + 1} description`}
                    disabled={isPending}
                    maxLength={500}
                    onChange={(event) => updateRow(index, { description: event.target.value })}
                    placeholder="Description"
                    value={row.description}
                  />
                  <div className="mt-2 grid grid-cols-[4.5rem_1fr_auto] items-center gap-2">
                    <Input
                      aria-label={`Line item ${index + 1} quantity`}
                      disabled={isPending}
                      inputMode="numeric"
                      min={1}
                      onChange={(event) => updateRow(index, { quantity: event.target.value })}
                      placeholder="Qty"
                      type="number"
                      value={rows[index].quantity}
                    />
                    <Input
                      aria-label={`Line item ${index + 1} unit price`}
                      disabled={isPending}
                      inputMode="decimal"
                      onChange={(event) => updateRow(index, { unitPrice: event.target.value })}
                      placeholder="0.00"
                      value={rows[index].unitPrice}
                    />
                    <div className="flex items-center gap-1">
                      <span className="hidden text-sm font-medium tabular-nums text-foreground sm:inline sm:min-w-20 sm:text-right">
                        {formatQuoteMoney(row.lineTotalInCents, currency)}
                      </span>
                      <Button
                        aria-label={`Remove line item ${index + 1}`}
                        disabled={isPending || rows.length <= 1}
                        onClick={() => removeRow(index)}
                        size="icon"
                        title={`Remove line item ${index + 1}`}
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {itemsError ? (
            <p className="text-sm text-destructive" role="alert">
              {itemsError}
            </p>
          ) : null}

          <div className="mt-2 flex flex-col gap-2.5 border-t border-border/60 pt-4">
            <TotalsRow label="Subtotal" value={formatQuoteMoney(subtotalInCents, currency)} />
            {discountInCents > 0 ? (
              <TotalsRow label="Discount" value={`-${formatQuoteMoney(discountInCents, currency)}`} />
            ) : null}
            {taxInCents > 0 ? (
              <TotalsRow
                label={quote?.taxLabel ? `Tax (${quote.taxLabel})` : "Tax"}
                value={formatQuoteMoney(taxInCents, currency)}
              />
            ) : null}
            <Separator />
            <TotalsRow label="Total" value={formatQuoteMoney(totalInCents, currency)} strong />
          </div>
        </DashboardSection>

        <DashboardSection
          contentClassName="flex flex-col gap-5"
          title="Pricing & notes"
          footer={
            <>
              <Button asChild variant="outline">
                <Link href={getBusinessInvoicesPath(businessSlug)}>Cancel</Link>
              </Button>
              <Button disabled={isPending} size="lg" type="submit">
                {isPending ? (
                  <>
                    <Spinner aria-hidden="true" data-icon="inline-start" />
                    Creating...
                  </>
                ) : (
                  "Create invoice"
                )}
              </Button>
            </>
          }
          footerClassName="w-full sm:justify-end"
        >
          <FieldGroup>
            {isQuoteSourced ? (
              <>
                <input type="hidden" name="discount" value={centsToInput(quote?.discountInCents ?? 0)} />
                <input type="hidden" name="tax" value={centsToInput(quote?.taxInCents ?? 0)} />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <span className="text-sm leading-[1.35] font-medium">Discount</span>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {formatQuoteMoney(quote?.discountInCents ?? 0, currency)} · from {quote?.quoteNumber}
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-sm leading-[1.35] font-medium">
                      {quote?.taxLabel ? `Tax (${quote.taxLabel})` : "Tax"}
                    </span>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {formatQuoteMoney(quote?.taxInCents ?? 0, currency)} · from {quote?.quoteNumber}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field data-invalid={Boolean(state.fieldErrors?.discountInCents) || undefined}>
                  <FieldLabel htmlFor="invoice-discount">Discount</FieldLabel>
                  <FieldContent>
                    <Input
                      aria-invalid={Boolean(state.fieldErrors?.discountInCents) || undefined}
                      disabled={isPending}
                      id="invoice-discount"
                      inputMode="decimal"
                      name="discount"
                      onChange={(event) => setDiscount(event.currentTarget.value)}
                      placeholder="0.00"
                      value={discount}
                    />
                    <FieldError errors={state.fieldErrors?.discountInCents?.map((message) => ({ message }))} />
                  </FieldContent>
                </Field>
                <Field data-invalid={Boolean(state.fieldErrors?.taxInCents) || undefined}>
                  <FieldLabel htmlFor="invoice-tax">Tax</FieldLabel>
                  <FieldContent>
                    <Input
                      aria-invalid={Boolean(state.fieldErrors?.taxInCents) || undefined}
                      disabled={isPending}
                      id="invoice-tax"
                      inputMode="decimal"
                      name="tax"
                      onChange={(event) => setTax(event.currentTarget.value)}
                      placeholder="0.00"
                      value={tax}
                    />
                    <FieldError errors={state.fieldErrors?.taxInCents?.map((message) => ({ message }))} />
                  </FieldContent>
                </Field>
              </div>
            )}

            <Field data-invalid={Boolean(state.fieldErrors?.notes) || undefined}>
              <FieldLabel htmlFor="invoice-notes">Notes</FieldLabel>
              <FieldContent>
                <Textarea
                  aria-invalid={Boolean(state.fieldErrors?.notes) || undefined}
                  disabled={isPending}
                  id="invoice-notes"
                  maxLength={4000}
                  name="notes"
                  onChange={(event) => setNotes(event.currentTarget.value)}
                  placeholder="Optional notes visible to the customer."
                  rows={2}
                  value={notes}
                />
                <FieldError errors={state.fieldErrors?.notes?.map((message) => ({ message }))} />
              </FieldContent>
            </Field>

            <Field data-invalid={Boolean(state.fieldErrors?.paymentTerms) || undefined}>
              <FieldLabel htmlFor="invoice-terms">Payment terms</FieldLabel>
              <FieldContent>
                <Textarea
                  aria-invalid={Boolean(state.fieldErrors?.paymentTerms) || undefined}
                  disabled={isPending}
                  id="invoice-terms"
                  maxLength={2000}
                  name="paymentTerms"
                  onChange={(event) => setPaymentTerms(event.currentTarget.value)}
                  placeholder="Payment terms, for example: due within 14 days."
                  rows={3}
                  value={paymentTerms}
                />
                <FieldError errors={state.fieldErrors?.paymentTerms?.map((message) => ({ message }))} />
              </FieldContent>
            </Field>
          </FieldGroup>

          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
        </DashboardSection>
      </DashboardSidebarStack>

      <InvoicePreview
        businessName={businessName}
        businessLogoStoragePath={businessLogoStoragePath}
        businessSlug={businessSlug}
        title={title}
        customerName={customerName}
        customerEmail={customerEmail.trim() ? customerEmail.trim() : null}
        currency={currency}
        issueDate={issueDate}
        dueDate={dueDate}
        items={previewItems}
        subtotalInCents={subtotalInCents}
        discountInCents={discountInCents}
        taxInCents={taxInCents}
        taxLabel={quote?.taxLabel}
        totalInCents={totalInCents}
        notes={notes.trim() ? notes : null}
        paymentTerms={paymentTerms.trim() ? paymentTerms : null}
        className="xl:sticky xl:top-6 xl:self-start"
      />
    </form>
  );
}

function TotalsRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={strong ? "text-base font-semibold text-foreground" : "text-sm font-medium text-foreground tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
