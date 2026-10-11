import type { ItemRefCallback, MotionState } from "@/hooks/use-animated-list";
import { MobileRecordRow } from "@/components/shared/mobile-record-row";
import { InvoiceStatusBadge } from "@/features/invoices/components/invoice-status-badge";
import { formatQuoteMoney } from "@/features/invoices/utils";
import { getBusinessInvoicePath } from "@/features/businesses/routes";
import type { InvoiceListItem } from "@/features/invoices/types";

type InvoiceListCardsProps = {
  invoices: InvoiceListItem[];
  businessSlug: string;
  isSelected?: (id: string) => boolean;
  isAtLimit?: boolean;
  onToggle?: (id: string) => void;
  getMotionState?: (id: string) => MotionState;
  getItemRef?: ItemRefCallback;
};

export function InvoiceListCards({
  invoices,
  businessSlug,
  isSelected,
  isAtLimit,
  onToggle,
  getMotionState,
  getItemRef,
}: InvoiceListCardsProps) {
  return (
    <div className="flex flex-col gap-2.5 p-4 xl:hidden">
      {invoices.map((invoice) => {
        const checked = isSelected?.(invoice.id) ?? false;
        const disabled = !checked && (isAtLimit ?? false);

        return (
          <MobileRecordRow
            key={invoice.id}
            id={invoice.id}
            href={getBusinessInvoicePath(businessSlug, invoice.id)}
            isSelected={checked}
            isSelectionDisabled={disabled}
            onToggleSelect={onToggle}
            motionState={getMotionState?.(invoice.id)}
            itemRef={getItemRef?.(invoice.id)}
            title={
              <span className="truncate">
                {invoice.invoiceNumber} <span className="text-muted-foreground font-normal">· {invoice.title}</span>
              </span>
            }
            subtitle={
              <span className="truncate">
                {invoice.customerName}
                {invoice.customerEmail ? ` (${invoice.customerEmail})` : ""}
              </span>
            }
            statusBadge={<InvoiceStatusBadge status={invoice.status} />}
            metadata={
              <>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatQuoteMoney(invoice.balanceInCents, invoice.currency)}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  of {formatQuoteMoney(invoice.totalInCents, invoice.currency)}
                </span>
                <span aria-hidden="true" className="text-muted-foreground/40">·</span>
                <span>Due {invoice.dueDate}</span>
              </>
            }
          />
        );
      })}
    </div>
  );
}
