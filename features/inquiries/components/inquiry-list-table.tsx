import Link from "next/link";
import { PenLine, PencilRuler } from "lucide-react";
import type { ItemRefCallback, MotionState } from "@/hooks/use-animated-list";

import { cn } from "@/lib/utils";
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
import type { DashboardInquiryListItem } from "@/features/inquiries/types";
import {
  formatInquiryDate,
  getInquirySourceLabel,
} from "@/features/inquiries/utils";
import { InquiryRecordStateBadge } from "@/features/inquiries/components/inquiry-record-state-badge";
import { InquiryStatusBadge } from "@/features/inquiries/components/inquiry-status-badge";
import { getBusinessInquiryPath } from "@/features/businesses/routes";
import { Copy } from "lucide-react";

function getInquiryChannelDisplay(inquiry: DashboardInquiryListItem) {
  if (inquiry.serviceName) {
    return { label: inquiry.serviceName, icon: PencilRuler };
  }
  return { label: getInquirySourceLabel(inquiry.source), icon: PenLine };
}

type InquiryListTableProps = {
  inquiries: DashboardInquiryListItem[];
  businessSlug: string;
  isSelected?: (id: string) => boolean;
  isAtLimit?: boolean;
  onToggle?: (id: string) => void;
  allOnPageSelected?: boolean;
  onSelectAllOnPage?: () => void;
  getMotionState?: (id: string) => MotionState;
  getItemRef?: ItemRefCallback;
};

export function InquiryListTable({
  inquiries,
  businessSlug,
  isSelected,
  isAtLimit,
  onToggle,
  allOnPageSelected,
  onSelectAllOnPage,
  getMotionState,
  getItemRef,
}: InquiryListTableProps) {
  return (
    <div className="hidden overflow-x-auto no-scrollbar xl:block">
      <Table className="min-w-[69rem] table-fixed">
        <TableCaption className="sr-only">Newest inquiries appear first.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[3rem]">
              <Checkbox
                aria-label="Select all inquiries on this page"
                checked={allOnPageSelected}
                onCheckedChange={onSelectAllOnPage}
              />
            </TableHead>
            <TableHead className="w-[17rem]">Customer</TableHead>
            <TableHead className="w-[13rem]">Service</TableHead>
            <TableHead className="w-[13rem]">Source</TableHead>
            <TableHead className="w-[8.75rem]">Status</TableHead>
            <TableHead className="w-[8rem]">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inquiries.map((inquiry) => {
            const inquiryHref = getBusinessInquiryPath(businessSlug, inquiry.id);
            const checked = isSelected?.(inquiry.id) ?? false;
            const disabled = !checked && (isAtLimit ?? false);

            return (
              <TableRow className="motion-list-item group/row" data-motion-state={getMotionState?.(inquiry.id)} key={inquiry.id} ref={getItemRef?.(inquiry.id)}>
                <TableCell className="w-[3rem]">
                  <Checkbox
                    aria-label={`Select inquiry from ${inquiry.customerName}`}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => onToggle?.(inquiry.id)}
                  />
                </TableCell>
                <TableCell className="w-[17rem]">
                  <div className="table-meta-stack max-w-full">
                    <div className="flex items-center gap-1.5">
                      {inquiry.isUnread ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full bg-primary"
                          />
                          <span className="sr-only">Unread: </span>
                        </>
                      ) : null}
                      <TruncatedTextWithTooltip
                        className={cn(
                          "table-link",
                          inquiry.isUnread && "font-semibold",
                        )}
                        href={inquiryHref}
                        prefetch={true}
                        text={inquiry.customerName}
                      />
                      {inquiry.hasDuplicateFlag ? (
                        <Copy
                          aria-label="Potential duplicate"
                          className="size-3.5 shrink-0 text-warning-ink"
                          role="img"
                        />
                      ) : null}
                    </div>
                    <TruncatedTextWithTooltip
                      className="table-supporting-text"
                      href={inquiryHref}
                      prefetch={true}
                      text={inquiry.customerEmail ?? ""}
                    />
                  </div>
                </TableCell>
                <TableCell className="w-[13rem]">
                  {(() => {
                    const channel = getInquiryChannelDisplay(inquiry);
                    const Icon = channel.icon;
                    return (
                      <Link
                        className="inline-flex items-center gap-1.5 text-sm text-foreground transition-colors hover:text-primary-ink group-hover/row:text-primary-ink"
                        href={inquiryHref}
                        prefetch={true}
                      >
                        <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{channel.label}</span>
                      </Link>
                    );
                  })()}
                </TableCell>
                <TableCell className="w-[13rem]">
                  <TruncatedTextWithTooltip
                    className="table-emphasis"
                    href={inquiryHref}
                    prefetch={true}
                    text={getInquirySourceLabel(inquiry.source)}
                  />
                </TableCell>
                <TableCell className="w-[8.75rem]">
                  <Link
                    className="inline-flex max-w-full flex-wrap gap-2"
                    href={inquiryHref}
                    prefetch={true}
                  >
                    <InquiryStatusBadge status={inquiry.status} />
                    {inquiry.recordState !== "active" ? (
                      <InquiryRecordStateBadge state={inquiry.recordState} />
                    ) : null}
                  </Link>
                </TableCell>
                <TableCell className="w-[8rem]">
                  <Link
                    className="block text-sm text-muted-foreground transition-colors hover:text-primary-ink group-hover/row:text-primary-ink"
                    href={inquiryHref}
                    prefetch={true}
                  >
                    {formatInquiryDate(inquiry.submittedAt)}
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
