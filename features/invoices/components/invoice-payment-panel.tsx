"use client";

import Link from "next/link";
import { startTransition, useOptimistic } from "react";

import { DashboardSection, DashboardTableContainer } from "@/components/shared/dashboard-layout";
import { InfoTile } from "@/components/shared/info-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBusinessPaymentPath, getBusinessPaymentReceiptPath } from "@/features/businesses/routes";
import { RecordPaymentDialog } from "@/features/invoices/components/record-payment-dialog";
import { VoidPaymentDialog } from "@/features/invoices/components/void-payment-dialog";
import { voidPaymentAction } from "@/features/invoices/actions";
import { getVoidReasonLabel } from "@/features/invoices/void-reasons";
import { calculateInvoicePaymentState, formatQuoteMoney, getPaymentMethodLabel } from "@/features/invoices/utils";
import type { InvoiceStatus, OptimisticPayment, PaymentActionState, PaymentView } from "@/features/invoices/types";

type PanelAction =
  | { type: "add"; payment: OptimisticPayment }
  | { type: "remove"; key: string }
  | { type: "void"; paymentId: string }
  | { type: "revertVoid"; paymentId: string };

function panelReducer(state: OptimisticPayment[], action: PanelAction): OptimisticPayment[] {
  switch (action.type) {
    case "add":
      return state.some((payment) => payment.id === action.payment.id) ? state : [action.payment, ...state];
    case "remove":
      return state.filter((payment) => payment.id !== action.key && payment.optimisticKey !== action.key);
    case "void":
      return state.map((payment) =>
        payment.id === action.paymentId ? { ...payment, voidedAt: new Date(), pending: true } : payment,
      );
    case "revertVoid":
      return state.map((payment) =>
        payment.id === action.paymentId ? { ...payment, voidedAt: null, pending: false } : payment,
      );
  }
}

export function InvoicePaymentPanel({
  businessSlug,
  canManageFinancials,
  canRecordPayment,
  currency,
  customerName,
  dueDate,
  invoiceId,
  invoiceNumber,
  initialPayments,
  lifecycleStatus,
  recordAction,
  totalInCents,
}: {
  businessSlug: string;
  canManageFinancials: boolean;
  canRecordPayment: boolean;
  currency: string;
  customerName: string;
  dueDate: string;
  invoiceId: string;
  invoiceNumber: string;
  initialPayments: PaymentView[];
  lifecycleStatus: InvoiceStatus;
  recordAction: (state: PaymentActionState, formData: FormData) => Promise<PaymentActionState>;
  totalInCents: number;
}) {
  const [optimisticPayments, updateOptimistic] = useOptimistic<OptimisticPayment[], PanelAction>(initialPayments, panelReducer);
  const activePayments = optimisticPayments.filter((payment) => !payment.voidedAt);
  const voidedPayments = optimisticPayments.filter((payment) => payment.voidedAt);
  const paidInCents = activePayments.reduce((sum, payment) => sum + payment.amountInCents, 0);
  const state = calculateInvoicePaymentState({ totalInCents, paidInCents, dueDate, lifecycleStatus });
  const amount = (cents: number) => formatQuoteMoney(cents, currency);

  return (
      <DashboardSection
        title="Payments"
        description={
          activePayments.length
            ? "Manually recorded receipts against this invoice. Newest first."
            : "No payments recorded. Record a payment when your customer pays outside Requo."
        }
        action={canRecordPayment ? (
          <RecordPaymentDialog
            action={recordAction}
            balanceInCents={state.balanceInCents}
            currency={currency}
            invoiceNumber={invoiceNumber}
            customerName={customerName}
            onOptimisticRecord={(payment) => startTransition(() => updateOptimistic({ type: "add", payment }))}
            onOptimisticRevert={(key) => startTransition(() => updateOptimistic({ type: "remove", key }))}
          />
        ) : undefined}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <InfoTile label="Invoice total" value={<span className="tabular-nums">{amount(totalInCents)}</span>} />
          <InfoTile label="Paid" value={<span className="tabular-nums">{amount(state.paidInCents)}</span>} />
          <InfoTile
            label="Balance due"
            value={<span className="font-semibold tabular-nums">{amount(state.balanceInCents)}</span>}
          />
        </div>
        {activePayments.length ? (
          <DashboardTableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Recorded by</TableHead>
                  <TableHead>Status</TableHead>
                  {canManageFinancials ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {payment.pending ? (
                        <span className="font-medium text-muted-foreground">Pending</span>
                      ) : (
                        <Link className="font-medium underline underline-offset-4" href={getBusinessPaymentPath(businessSlug, payment.id)}>
                          {payment.paymentNumber}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>{payment.paymentDate}</TableCell>
                    <TableCell>{getPaymentMethodLabel(payment.method)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {amount(payment.amountInCents)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{payment.reference ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{payment.createdByName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{payment.pending ? "Saving…" : "Recorded"}</TableCell>
                    {canManageFinancials ? (
                      <TableCell className="text-right">
                        {payment.pending ? null : (
                          <div className="flex justify-end gap-2">
                            <Link
                              className="inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                              href={getBusinessPaymentReceiptPath(businessSlug, payment.id)}
                            >
                              Receipt
                            </Link>
                            <VoidPaymentDialog
                              paymentNumber={payment.paymentNumber}
                              action={voidPaymentAction.bind(null, payment.id, invoiceId)}
                              onOptimisticVoid={() => startTransition(() => updateOptimistic({ type: "void", paymentId: payment.id }))}
                              onOptimisticRevertVoid={() => startTransition(() => updateOptimistic({ type: "revertVoid", paymentId: payment.id }))}
                            />
                          </div>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DashboardTableContainer>
        ) : null}
        {voidedPayments.length ? (
          <div className="flex flex-col gap-2">
            <p className="meta-label">Voided payments</p>
            {voidedPayments.map((payment) => (
              <p className="text-sm text-muted-foreground" key={payment.id}>
                {payment.pending ? (
                  <span className="font-medium">Voiding… </span>
                ) : (
                  <>
                    <Link className="font-medium underline underline-offset-4" href={getBusinessPaymentPath(businessSlug, payment.id)}>
                      {payment.paymentNumber}
                    </Link>{" "}
                  </>
                )}
                · {amount(payment.amountInCents)} · {getPaymentMethodLabel(payment.method)} · {payment.paymentDate} · voided
                {payment.voidReason ? ` · ${getVoidReasonLabel(payment.voidReason)}` : null}
              </p>
            ))}
          </div>
        ) : null}
      </DashboardSection>
  );
}
