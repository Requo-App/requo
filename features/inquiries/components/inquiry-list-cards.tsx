import { Copy, PenLine, PencilRuler } from "lucide-react";
import type { ItemRefCallback, MotionState } from "@/hooks/use-animated-list";
import { MobileRecordRow } from "@/components/shared/mobile-record-row";
import type { DashboardInquiryListItem } from "@/features/inquiries/types";
import {
  formatInquiryDate,
  getInquirySourceLabel,
} from "@/features/inquiries/utils";
import { InquiryRecordStateBadge } from "@/features/inquiries/components/inquiry-record-state-badge";
import { InquiryStatusBadge } from "@/features/inquiries/components/inquiry-status-badge";
import { getBusinessInquiryPath } from "@/features/businesses/routes";

function getInquiryChannelDisplay(inquiry: DashboardInquiryListItem) {
  if (inquiry.inquiryFormName) {
    return { label: inquiry.inquiryFormName, icon: PencilRuler };
  }
  return { label: getInquirySourceLabel(inquiry.source), icon: PenLine };
}

type InquiryListCardsProps = {
  inquiries: DashboardInquiryListItem[];
  businessSlug: string;
  isSelected?: (id: string) => boolean;
  isAtLimit?: boolean;
  onToggle?: (id: string) => void;
  getMotionState?: (id: string) => MotionState;
  getItemRef?: ItemRefCallback;
};

export function InquiryListCards({
  inquiries,
  businessSlug,
  isSelected,
  isAtLimit,
  onToggle,
  getMotionState,
  getItemRef,
}: InquiryListCardsProps) {
  return (
    <div className="flex flex-col gap-2.5 p-4 xl:hidden">
      {inquiries.map((inquiry) => {
        const checked = isSelected?.(inquiry.id) ?? false;
        const disabled = !checked && (isAtLimit ?? false);
        const channel = getInquiryChannelDisplay(inquiry);
        const ChannelIcon = channel.icon;

        return (
          <MobileRecordRow
            key={inquiry.id}
            id={inquiry.id}
            href={getBusinessInquiryPath(businessSlug, inquiry.id)}
            isSelected={checked}
            isSelectionDisabled={disabled}
            onToggleSelect={onToggle}
            motionState={getMotionState?.(inquiry.id)}
            itemRef={getItemRef?.(inquiry.id)}
            title={
              <span className="flex items-center gap-1.5 min-w-0">
                {inquiry.isUnread ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full bg-primary"
                    />
                    <span className="sr-only">Unread: </span>
                  </>
                ) : null}
                <span className="truncate">{inquiry.customerName}</span>
                {inquiry.hasDuplicateFlag ? (
                  <Copy
                    aria-label="Potential duplicate"
                    className="size-3.5 shrink-0 text-warning"
                    role="img"
                  />
                ) : null}
              </span>
            }
            subtitle={
              inquiry.customerEmail ? (
                <span className="truncate">{inquiry.customerEmail}</span>
              ) : null
            }
            statusBadge={<InquiryStatusBadge status={inquiry.status} />}
            stateBadge={
              inquiry.recordState !== "active" ? (
                <InquiryRecordStateBadge state={inquiry.recordState} />
              ) : null
            }
            metadata={
              <>
                <span className="inline-flex items-center gap-1">
                  <ChannelIcon
                    aria-hidden="true"
                    className="size-3 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate max-w-[120px]">{channel.label}</span>
                </span>
                <span aria-hidden="true" className="text-muted-foreground/40">·</span>
                <span className="truncate max-w-[130px]">{getInquirySourceLabel(inquiry.source)}</span>
                <span aria-hidden="true" className="text-muted-foreground/40">·</span>
                <span>{formatInquiryDate(inquiry.submittedAt)}</span>
              </>
            }
          />
        );
      })}
    </div>
  );
}
