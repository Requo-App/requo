import Link from "next/link";
import type { ItemRefCallback, MotionState } from "@/hooks/use-animated-list";

import { Checkbox } from "@/components/ui/checkbox";
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
import { InvoiceStatusBadge } from "@/features/invoices/components/invoice-status-badge";
import type { InvoiceListItem } from "@/features/invoices/types";
import { formatQuoteMoney } from "@/features/invoices/utils";
import { getBusinessInvoicePath } from "@/features/businesses/routes";

type InvoiceListTableProps = {
  invoices: InvoiceListItem[];
  businessSlug: string;
  isSelected?: (id: string) => boolean;
  isAtLimit?: boolean;
  onToggle?: (id: string) => void;
  allOnPageSelected?: boolean;
  onSelectAllOnPage?: () => void;
  getMotionState?: (id: string) => MotionState;
  getItemRef?: ItemRefCallback;
};

export function InvoiceListTable({
  invoices,
  businessSlug,
  isSelected,
  isAtLimit,
  onToggle,
  allOnPageSelected,
  onSelectAllOnPage,
  getMotionState,
  getItemRef,
}: InvoiceListTableProps) {
  return (
    <div className="hidden overflow-x-auto no-scrollbar xl:block">
      <Table className="min-w-[70rem] table-fixed 2xl:min-w-[76rem]">
        <TableCaption className="sr-only">Newest invoices appear first.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[3rem]">
              <Checkbox
                aria-label="Select all invoices on this page"
                checked={allOnPageSelected}
                onCheckedChange={onSelectAllOnPage}
              />
            </TableHead>
            <TableHead className="w-[16rem]">Invoice</TableHead>
            <TableHead className="w-[14rem]">Customer</TableHead>
            <TableHead className="w-[8rem]">Due date</TableHead>
            <TableHead className="w-[8rem]">Total</TableHead>
            <TableHead className="w-[8rem]">Balance</TableHead>
            <TableHead className="w-[9rem]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => {
            const invoiceHref = getBusinessInvoicePath(businessSlug, invoice.id);
            const checked = isSelected?.(invoice.id) ?? false;
            const disabled = !checked && (isAtLimit ?? false);

            return (
              <TableRow className="motion-list-item group/row" data-motion-state={getMotionState?.(invoice.id)} key={invoice.id} ref={getItemRef?.(invoice.id)}>
                <TableCell className="w-[3rem]">
                  <Checkbox
                    aria-label={`Select invoice ${invoice.invoiceNumber}`}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => onToggle?.(invoice.id)}
                  />
                </TableCell>
                <TableCell className="w-[16rem]">
                  <div className="table-meta-stack max-w-full">
                    <TruncatedTextWithTooltip
                      className="table-link"
                      href={invoiceHref}
                      prefetch={true}
                      text={invoice.invoiceNumber}
                    />
                    <TruncatedTextWithTooltip
                      className="table-supporting-text"
                      href={invoiceHref}
                      prefetch={true}
                      text={invoice.title}
                    />
                  </div>
                </TableCell>
                <TableCell className="w-[14rem]">
                  <div className="table-meta-stack max-w-full">
                    <TruncatedTextWithTooltip
                      className="table-emphasis"
                      href={invoiceHref}
                      prefetch={true}
                      text={invoice.customerName}
                    />
                    <TruncatedTextWithTooltip
                      className="table-supporting-text"
                      href={invoiceHref}
                      prefetch={true}
                      text={invoice.customerEmail ?? ""}
                    />
                  </div>
                </TableCell>
                <TableCell className="w-[8rem]">
                  <Link
                    className="block text-sm text-muted-foreground transition-colors hover:text-primary group-hover/row:text-primary"
                    href={invoiceHref}
                    prefetch={true}
                  >
                    {invoice.dueDate}
                  </Link>
                </TableCell>
                <TableCell className="w-[8rem]">
                  <Link
                    className="block text-sm text-muted-foreground tabular-nums transition-colors hover:text-primary group-hover/row:text-primary"
                    href={invoiceHref}
                    prefetch={true}
                  >
                    {formatQuoteMoney(invoice.totalInCents, invoice.currency)}
                  </Link>
                </TableCell>
                <TableCell className="w-[8rem]">
                  <Link
                    className="block text-sm font-semibold text-foreground tabular-nums transition-colors hover:text-primary group-hover/row:text-primary"
                    href={invoiceHref}
                    prefetch={true}
                  >
                    {formatQuoteMoney(invoice.balanceInCents, invoice.currency)}
                  </Link>
                </TableCell>
                <TableCell className="w-[9rem]">
                  <Link
                    className="inline-flex max-w-full flex-wrap gap-2"
                    href={invoiceHref}
                    prefetch={true}
                  >
                    <InvoiceStatusBadge status={invoice.status} />
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
