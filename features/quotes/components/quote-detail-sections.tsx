import Link from "next/link";
import { AtSign, ExternalLink, Mail } from "lucide-react";

import {
  DashboardDetailFeed,
  DashboardDetailFeedItem,
  DashboardEmptyState,
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import { InfoTile } from "@/components/shared/info-tile";
import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CustomerHistoryPanel } from "@/features/customer-history/components/customer-history-panel";
import { InquiryRecordStateBadge } from "@/features/inquiries/components/inquiry-record-state-badge";
import { InquiryStatusBadge } from "@/features/inquiries/components/inquiry-status-badge";
import {
  getContactHandleUrl,
  getCustomerContactEmail,
} from "@/features/inquiries/utils";
import { formatInquiryDate } from "@/features/inquiries/utils";
import { getBusinessInquiryPath, getBusinessQuoteExportPath } from "@/features/businesses/routes";
import { CopyQuoteLinkButton } from "@/features/quotes/components/copy-quote-link-button";
import { QuotePreview } from "@/features/quotes/components/quote-preview";
import { QuoteReminderBadge } from "@/features/quotes/components/quote-reminder-badge";
import type { QuoteReminderKind } from "@/features/quotes/types";
import { SendQuoteDialog } from "@/features/quotes/components/send-quote-dialog";
import type {
  DashboardQuoteActivity,
  DashboardQuoteDetailCore,
} from "@/features/quotes/types";
import { formatQuoteDateTime } from "@/features/quotes/utils";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import { getActiveAutoFollowUpCount } from "@/lib/plans/usage";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { isEmailConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";

export type SendDialogContext = {
  businessId: string;
  businessName: string;
  businessPlan: Parameters<typeof hasFeatureAccess>[0];
  businessSlug: string;
  businessLogoStoragePath: string | null;
  customerQuoteUrl: string | null;
  needsAiConfirmation: boolean;
  acknowledgeAction?: React.ComponentProps<typeof SendQuoteDialog>["acknowledgeAction"];
  quote: DashboardQuoteDetailCore;
  sendAction: React.ComponentProps<typeof SendQuoteDialog>["sendAction"];
  logEventAction: React.ComponentProps<typeof SendQuoteDialog>["logEventAction"];
  createFollowUpAction: React.ComponentProps<typeof SendQuoteDialog>["createFollowUpAction"];
  previewHref: string;
};
export function QuoteLinkedInquirySection({
  businessSlug,
  quote,
}: {
  businessSlug: string;
  quote: DashboardQuoteDetailCore;
}) {
  return (
    <DashboardSection
      description="Original inquiry context."
      footer={
        quote.linkedInquiry ? (
          <Button asChild variant="outline">
            <Link href={getBusinessInquiryPath(businessSlug, quote.linkedInquiry.id)}>
              Open inquiry
            </Link>
          </Button>
        ) : null
      }
      title="Linked inquiry"
    >
      {quote.linkedInquiry ? (
        <div className="flex flex-col gap-4">
          <DashboardDetailFeed>
            <DashboardDetailFeedItem
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <InquiryStatusBadge status={quote.linkedInquiry.status} />
                  {quote.linkedInquiry.recordState !== "active" ? (
                    <InquiryRecordStateBadge
                      state={quote.linkedInquiry.recordState}
                    />
                  ) : null}
                </div>
              }
              meta={
                <>
                  <TruncatedTextWithTooltip
                    className="max-w-52"
                    text={
                      getCustomerContactEmail(quote.linkedInquiry) ??
                      quote.linkedInquiry.customerContactHandle
                    }
                  />
                  <span aria-hidden="true">|</span>
                  <TruncatedTextWithTooltip
                    className="max-w-52"
                    text={quote.linkedInquiry.subject ?? quote.linkedInquiry.customerName}
                  />
                </>
              }
              title={quote.linkedInquiry.customerName}
            />
          </DashboardDetailFeed>
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoTile label="Subject" value={quote.linkedInquiry.subject ?? "—"} />
            <InfoTile
              label="Deadline"
              value={
                quote.linkedInquiry.requestedDeadline
                  ? formatInquiryDate(quote.linkedInquiry.requestedDeadline)
                  : "No deadline"
              }
            />
          </div>
        </div>
      ) : (
        <DashboardEmptyState
          description="This quote was created manually. Continue editing here or share the customer view when it is ready."
          title="No linked inquiry"
          variant="section"
        />
      )}
    </DashboardSection>
  );
}

export function QuoteCustomerViewSection({
  customerQuotePath,
  customerQuoteUrl,
  customerViewCopy,
  quote,
  visibleQuoteReminders,
}: {
  customerQuotePath: string | null;
  customerQuoteUrl: string | null;
  customerViewCopy: { title: string };
  quote: DashboardQuoteDetailCore;
  visibleQuoteReminders: QuoteReminderKind[];
}) {
  return (
    <DashboardSection
      contentClassName="flex flex-col gap-3"
      description="Share, open, and track the secure quote page."
      title="Customer view"
    >
      {customerQuoteUrl ? (
        <>
          <div className={cn(
            "rounded-xl border px-4 py-4 shadow-none",
            quote.status === "accepted" && "border-success/30 bg-success/10",
            quote.status === "rejected" && "border-destructive/30 bg-destructive/10",
            quote.status !== "accepted" && quote.status !== "rejected" && "soft-panel",
          )}>
            <p className="text-sm font-medium text-foreground">
              {customerViewCopy.title}
            </p>
            <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
              {quote.sentAt ? (
                <span>Sent {formatQuoteDateTime(quote.sentAt)}</span>
              ) : null}
              <span>
                {quote.publicViewedAt
                  ? `Viewed ${formatQuoteDateTime(quote.publicViewedAt)}`
                  : "Not viewed yet"}
              </span>
              {quote.customerRespondedAt ? (
                <span>Responded {formatQuoteDateTime(quote.customerRespondedAt)}</span>
              ) : null}
            </div>
          </div>

          {quote.customerResponseMessage ? (
            <div className="soft-panel shadow-none">
              <p className="meta-label">Customer message</p>
              <TruncatedTextWithTooltip
                className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground"
                lines={4}
                text={quote.customerResponseMessage}
              />
            </div>
          ) : null}

          {visibleQuoteReminders.length ? (
            <div className="flex flex-wrap gap-2">
              {visibleQuoteReminders.map((reminder) => (
                <QuoteReminderBadge key={reminder} kind={reminder} />
              ))}
            </div>
          ) : null}

          {customerQuotePath ? (
            <div className="flex items-center gap-2">
              <CopyQuoteLinkButton url={customerQuoteUrl} />
              <Button asChild size="sm" variant="ghost">
                <Link href={customerQuotePath} target="_blank">
                  Open
                  <ExternalLink data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <Alert>
          <AlertTitle>Customer link unavailable</AlertTitle>
          <AlertDescription>
            Requo couldn&apos;t recover the secure customer link for this quote,
            so public sharing is temporarily unavailable.
          </AlertDescription>
        </Alert>
      )}
    </DashboardSection>
  );
}

export function QuoteAcceptanceSection({
  acceptance,
  quote,
}: {
  acceptance: {
    signerName: string;
    signerEmail: string | null;
    acceptanceMethod: string;
    acceptanceText: string;
    quoteVersion: number;
    snapshotHash: string;
    acceptedAt: Date;
  } | null;
  quote: DashboardQuoteDetailCore;
}) {
  if (!acceptance) {
    return (
      <DashboardSection
        contentClassName="flex flex-col gap-3"
        description="Acceptance record for this quote."
        title="Acceptance"
      >
        <p className="text-sm text-muted-foreground">
          Accepted{quote.acceptedAt ? ` ${formatQuoteDateTime(quote.acceptedAt)}` : ""} (legacy
          record — signer details were not captured).
        </p>
      </DashboardSection>
    );
  }

  return (
    <DashboardSection
      contentClassName="grid gap-3 sm:grid-cols-2"
      description="Immutable record of what the customer accepted."
      title="Acceptance"
    >
      <InfoTile label="Accepted by" value={acceptance.signerName} />
      <InfoTile label="Accepted on" value={formatQuoteDateTime(acceptance.acceptedAt)} />
      <InfoTile label="Accepted version" value={`v${acceptance.quoteVersion}`} />
      {quote.completedAt ? (
        <InfoTile
          className="sm:col-span-2"
          label="Work completed"
          value={formatQuoteDateTime(quote.completedAt)}
        />
      ) : null}
      {acceptance.signerEmail ? (
        <InfoTile className="sm:col-span-2" label="Signer email" value={acceptance.signerEmail} valueClassName="break-all" />
      ) : null}
      <div className="sm:col-span-2">
        <InfoTile label="Snapshot hash" value={`${acceptance.snapshotHash.slice(0, 16)}…`} valueClassName="break-all font-mono text-xs" />
      </div>
    </DashboardSection>
  );
}

export function QuoteContactSection({
  quote,
  quoteContactEmail,
  quotePreferredContactLabel,
  showQuotePreferredContact,
}: {
  quote: DashboardQuoteDetailCore;
  quoteContactEmail: string | null;
  quotePreferredContactLabel: string;
  showQuotePreferredContact: boolean;
}) {
  return (
    <DashboardSection
      contentClassName="grid gap-3 sm:grid-cols-2"
      description="Saved customer channel for sending and follow-up."
      title="Customer contact"
    >
      <InfoTile
        className={showQuotePreferredContact ? undefined : "sm:col-span-2"}
        icon={Mail}
        label="Email"
        value={
          quoteContactEmail ? (
            <TruncatedTextWithTooltip
              className="underline-offset-4 hover:underline"
              href={`mailto:${quoteContactEmail}`}
              text={quoteContactEmail}
            />
          ) : (
            "Not provided"
          )
        }
        valueClassName="break-all"
      />
      {showQuotePreferredContact ? (
        <InfoTile
          icon={AtSign}
          label={quotePreferredContactLabel}
          value={
            getContactHandleUrl(quote.customerContactMethod, quote.customerContactHandle) ? (
              <a
                className="text-primary underline-offset-4 hover:underline break-all"
                href={getContactHandleUrl(quote.customerContactMethod, quote.customerContactHandle)!}
                rel="noopener noreferrer"
                target="_blank"
              >
                {quote.customerContactHandle}
              </a>
            ) : (
              quote.customerContactHandle
            )
          }
          valueClassName="break-all"
        />
      ) : null}
    </DashboardSection>
  );
}

export function QuoteActivitySheetSection({
  activities,
}: {
  activities: DashboardQuoteActivity[];
}) {
  const latestActivity = activities[0];

  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="Quote events and owner actions."
      title="Activity log"
    >
      {latestActivity ? (
        <>
          <DashboardDetailFeed>
            <DashboardDetailFeedItem
              meta={
                <>
                  <span>{latestActivity.actorName ?? "Requo"}</span>
                  <span aria-hidden="true">|</span>
                  <span>{formatQuoteDateTime(latestActivity.createdAt)}</span>
                </>
              }
              title={latestActivity.summary}
            />
          </DashboardDetailFeed>
          <Sheet>
            <SheetTrigger asChild>
              <Button className="w-full" type="button" variant="outline">
                View all activity
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-xl">
              <SheetHeader>
                <SheetTitle>Quote activity</SheetTitle>
                <SheetDescription>
                  Full timeline of events and owner actions for this quote.
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="min-h-0 flex-1">
                <ScrollArea className="h-full pr-4">
                  <DashboardDetailFeed>
                    {activities.map((activity) => (
                      <DashboardDetailFeedItem
                        key={activity.id}
                        meta={
                          <>
                            <span>{activity.actorName ?? "Requo"}</span>
                            <span aria-hidden="true">|</span>
                            <span>{formatQuoteDateTime(activity.createdAt)}</span>
                          </>
                        }
                        title={activity.summary}
                      />
                    ))}
                  </DashboardDetailFeed>
                </ScrollArea>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <DashboardEmptyState
          description="Send the quote or change its status to start the timeline for this quote."
          title="No quote activity yet"
          variant="section"
        />
      )}
    </DashboardSection>
  );
}

export function CustomerHistorySheetSection({
  businessSlug,
  history,
}: Parameters<typeof CustomerHistoryPanel>[0]) {
  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="Past records for this customer email inside the current business."
      title="Customer history"
    >
      {history ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoTile label="Past inquiries" value={`${history.inquiryCount}`} />
            <InfoTile label="Past quotes" value={`${history.quoteCount}`} />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button className="w-full" type="button" variant="outline">
                View customer history
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-xl">
              <SheetHeader>
                <SheetTitle>Customer history</SheetTitle>
                <SheetDescription>
                  Past inquiries and quotes for this customer.
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="min-h-0 flex-1">
                <ScrollArea className="h-full pr-4">
                  <CustomerHistoryPanel
                    businessSlug={businessSlug}
                    history={history}
                  />
                </ScrollArea>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <DashboardEmptyState
          description="No prior inquiries or quotes were found for this customer."
          title="No customer history"
          variant="section"
        />
      )}
    </DashboardSection>
  );
}
/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Plan gate + in-flight count for auto follow-up, shared by the send dialog
 * and the follow-up panel regions.
 */
// (see resolveAutoFollowUpGate below)
export async function resolveAutoFollowUpGate(
  businessId: string,
  businessPlan: Parameters<typeof hasFeatureAccess>[0],
) {
  const canAutoFollowUpByPlan = hasFeatureAccess(businessPlan, "autoFollowUps");
  const activeAutoFollowUpLimit = getUsageLimit(
    businessPlan,
    "activeAutoFollowUpsPerBusiness",
  );
  const activeAutoFollowUpCount = canAutoFollowUpByPlan
    ? await getActiveAutoFollowUpCount(businessId)
    : 0;
  const canAutoFollowUp =
    canAutoFollowUpByPlan &&
    (activeAutoFollowUpLimit === null ||
      activeAutoFollowUpCount < activeAutoFollowUpLimit);

  return {
    canAutoFollowUp,
    activeAutoFollowUpCount,
    activeAutoFollowUpLimit,
    autoFollowUpUnavailableNote:
      canAutoFollowUpByPlan && !canAutoFollowUp
        ? "You've reached your plan's limit for active auto follow-ups. Stop or complete one to start another."
        : undefined,
  };
}

export function buildSendDialogProps({
  acknowledgeAction,
  autoFollowUpUnavailableNote,
  businessLogoStoragePath,
  businessName,
  businessPlan,
  businessSlug,
  canAutoFollowUp,
  createFollowUpAction,
  customerQuoteUrl,
  items,
  logEventAction,
  needsAiConfirmation,
  previewHref,
  quote,
  sendAction,
}: SendDialogContext & {
  items: React.ComponentProps<typeof QuotePreview>["items"];
  canAutoFollowUp: boolean;
  autoFollowUpUnavailableNote?: string;
}): React.ComponentProps<typeof SendQuoteDialog> {
  return {
    sendAction,
    logEventAction,
    createFollowUpAction,
    quote,
    customerQuoteUrl,
    businessName,
    isRequoEmailAvailable:
      isEmailConfigured &&
      quote.customerContactMethod === "email" &&
      !!quote.customerEmail,
    pdfExportHref: getBusinessQuoteExportPath(businessSlug, quote.id, "pdf"),
    canAutoFollowUp,
    autoFollowUpUnavailableNote,
    unpricedItemCount: items.filter((item) => item.unitPriceInCents <= 0).length,
    needsAiConfirmation,
    acknowledgeAction,
    previewHref,
    previewData: {
      businessName,
      businessLogoStoragePath,
      businessSlug,
      quoteNumber: quote.quoteNumber,
      title: quote.title,
      customerName: quote.customerName,
      customerEmail: quote.customerEmail,
      currency: quote.currency,
      validUntil: quote.validUntil,
      notes: quote.notes,
      terms: quote.terms,
      items,
      subtotalInCents: quote.subtotalInCents,
      discountInCents: quote.discountInCents,
      taxInCents: quote.taxInCents,
      taxLabel: quote.taxLabel,
      totalInCents: quote.totalInCents,
      version: quote.version,
      showWatermark: !hasFeatureAccess(businessPlan, "removeWatermark"),
    },
  };
}
