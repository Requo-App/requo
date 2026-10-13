import type { ItemRefCallback, MotionState } from "@/hooks/use-animated-list";
import { MobileRecordRow } from "@/components/shared/mobile-record-row";
import { PaymentStatusBadge } from "@/features/invoices/components/payment-status-badge";
import { formatQuoteMoney, getPaymentMethodLabel } from "@/features/invoices/utils";
import { getBusinessPaymentPath } from "@/features/businesses/routes";
import type { PaymentListItem } from "@/features/invoices/types";

type PaymentListCardsProps = {
  payments: PaymentListItem[];
  businessSlug: string;
  getMotionState?: (id: string) => MotionState;
  getItemRef?: ItemRefCallback;
};

export function PaymentListCards({
  payments,
  businessSlug,
  getMotionState,
  getItemRef,
}: PaymentListCardsProps) {
  return (
    <div className="flex flex-col gap-2.5 p-4 xl:hidden">
      {payments.map((payment) => {
        return (
          <MobileRecordRow
            key={payment.id}
            id={payment.id}
            href={getBusinessPaymentPath(businessSlug, payment.id)}
            motionState={getMotionState?.(payment.id)}
            itemRef={getItemRef?.(payment.id)}
            title={
              <span className="truncate">
                {payment.paymentNumber} <span className="text-muted-foreground font-normal">· {payment.invoiceNumber}</span>
              </span>
            }
            subtitle={
              <span className="truncate">
                {payment.customerName}
              </span>
            }
            statusBadge={<PaymentStatusBadge status={payment.status} />}
            metadata={
              <>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatQuoteMoney(payment.amountInCents, payment.currency)}
                </span>
                <span aria-hidden="true" className="text-muted-foreground/40">·</span>
                <span>{getPaymentMethodLabel(payment.method)}</span>
                <span aria-hidden="true" className="text-muted-foreground/40">·</span>
                <span className="tabular-nums">{payment.paymentDate}</span>
              </>
            }
          />
        );
      })}
    </div>
  );
}
