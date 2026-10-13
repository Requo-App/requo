import Link from "next/link";
import type { ItemRefCallback, MotionState } from "@/hooks/use-animated-list";

import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentStatusBadge } from "@/features/invoices/components/payment-status-badge";
import type { PaymentListItem } from "@/features/invoices/types";
import { formatQuoteMoney, getPaymentMethodLabel } from "@/features/invoices/utils";
import { getBusinessInvoicePath, getBusinessPaymentPath } from "@/features/businesses/routes";

type PaymentListTableProps = {
  payments: PaymentListItem[];
  businessSlug: string;
  getMotionState?: (id: string) => MotionState;
  getItemRef?: ItemRefCallback;
};

export function PaymentListTable({
  payments,
  businessSlug,
  getMotionState,
  getItemRef,
}: PaymentListTableProps) {
  return (
    <div className="hidden overflow-x-auto no-scrollbar xl:block">
      <Table className="min-w-[66rem] table-fixed 2xl:min-w-[72rem]">
        <TableCaption className="sr-only">Newest payments appear first.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[15rem]">Payment</TableHead>
            <TableHead className="w-[14rem]">Customer</TableHead>
            <TableHead className="w-[8rem]">Date</TableHead>
            <TableHead className="w-[8rem]">Amount</TableHead>
            <TableHead className="w-[9rem]">Method</TableHead>
            <TableHead className="w-[9rem]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => {
            const paymentHref = getBusinessPaymentPath(businessSlug, payment.id);
            const invoiceHref = getBusinessInvoicePath(businessSlug, payment.invoiceId);

            return (
              <TableRow className="motion-list-item group/row" data-motion-state={getMotionState?.(payment.id)} key={payment.id} ref={getItemRef?.(payment.id)}>
                <TableCell className="w-[15rem]">
                  <div className="table-meta-stack max-w-full">
                    <TruncatedTextWithTooltip
                      className="table-link"
                      href={paymentHref}
                      prefetch={true}
                      text={payment.paymentNumber}
                    />
                    <TruncatedTextWithTooltip
                      className="table-supporting-text"
                      href={paymentHref}
                      prefetch={true}
                      text={payment.reference?.trim() ? payment.reference : getPaymentMethodLabel(payment.method)}
                    />
                  </div>
                </TableCell>
                <TableCell className="w-[14rem]">
                  <div className="table-meta-stack max-w-full">
                    <TruncatedTextWithTooltip
                      className="table-emphasis"
                      href={paymentHref}
                      prefetch={true}
                      text={payment.customerName}
                    />
                    <TruncatedTextWithTooltip
                      className="table-supporting-text"
                      href={invoiceHref}
                      prefetch={true}
                      text={payment.invoiceNumber}
                    />
                  </div>
                </TableCell>
                <TableCell className="w-[8rem]">
                  <Link
                    className="block text-sm text-muted-foreground tabular-nums transition-colors hover:text-primary group-hover/row:text-primary"
                    href={paymentHref}
                    prefetch={true}
                  >
                    {payment.paymentDate}
                  </Link>
                </TableCell>
                <TableCell className="w-[8rem]">
                  <Link
                    className="block text-sm font-semibold text-foreground tabular-nums transition-colors hover:text-primary group-hover/row:text-primary"
                    href={paymentHref}
                    prefetch={true}
                  >
                    {formatQuoteMoney(payment.amountInCents, payment.currency)}
                  </Link>
                </TableCell>
                <TableCell className="w-[9rem]">
                  <Link
                    className="block text-sm text-muted-foreground transition-colors hover:text-primary group-hover/row:text-primary"
                    href={paymentHref}
                    prefetch={true}
                  >
                    {getPaymentMethodLabel(payment.method)}
                  </Link>
                </TableCell>
                <TableCell className="w-[9rem]">
                  <Link
                    className="inline-flex max-w-full flex-wrap gap-2"
                    href={paymentHref}
                    prefetch={true}
                  >
                    <PaymentStatusBadge status={payment.status} />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
