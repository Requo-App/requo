import Link from "next/link";
import {
  AtSign,
  Briefcase,
  CalendarClock,
  FileText,
  Mail,
  MessageSquare,
  ReceiptText,
  Tag,
  Wallet,
} from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  DashboardDetailLayout,
  DashboardDetailFeed,
  DashboardDetailFeedItem,
  DashboardDetailHeader,
  DashboardEmptyState,
  DashboardPage,
  DashboardSection,
  DashboardSidebarStack,
} from "@/components/shared/dashboard-layout";
import { ArchivedRecordBanner } from "@/components/shared/archived-record-banner";
import { DetailSectionFallback } from "@/components/shared/detail-section-fallback";
import { RegionErrorBoundary } from "@/components/shared/region-error-boundary";
import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
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
import { InfoTile } from "@/components/shared/info-tile";
import { DashboardDetailPageSkeleton } from "@/components/shell/dashboard-detail-page-skeleton";
import { InquiryWorkflowSteps } from "@/features/businesses/components/workflow-steps";
import { getCustomerHistoryForBusiness } from "@/features/customers/queries";
import { createInquiryFollowUpAction } from "@/features/follow-ups/actions";
import { FollowUpPanel } from "@/features/follow-ups/components/follow-up-panel";
import { getFollowUpsForInquiry } from "@/features/follow-ups/queries";
import {
  getCustomSubmittedFields,
  systemFieldDefaultLabels,
} from "@/features/inquiries/form-config";
import {
  getContactMethodLabel,
  getCustomerContactEmail,
  shouldShowPreferredContactTile,
} from "@/features/inquiries/utils";
import {
  addInquiryNoteAction,
  archiveInquiryAction,
  changeInquiryStatusAction,
  deleteInquiryAction,
  unarchiveInquiryAction,
} from "@/features/inquiries/actions";
import { CopyEmailButton } from "@/features/inquiries/components/copy-email-button";
import { AgentTranscriptSection } from "@/features/inquiries/components/agent-transcript-section";
import { InquiryDuplicateBanner } from "@/features/inquiries/components/inquiry-duplicate-banner";
import { InquiryQuoteActions } from "@/features/inquiries/components/inquiry-quote-actions";
import { InquiryRecordStateBadge } from "@/features/inquiries/components/inquiry-record-state-badge";
import { InquiryManageDropdown } from "@/features/inquiries/components/inquiry-manage-dropdown";
import { InquiryStatusBadge } from "@/features/inquiries/components/inquiry-status-badge";
import { InquiryViewedTracker } from "@/features/inquiries/components/inquiry-viewed-tracker";
import {
  getInquiryActivitiesForBusiness,
  getInquiryAttachmentsForBusiness,
  getInquiryDetailCoreForBusiness,
  getInquiryDuplicateForBusiness,
  getInquiryNotesForBusiness,
  getInquiryRelatedQuotesForBusiness,
} from "@/features/inquiries/queries";
import { inquiryRouteParamsSchema } from "@/features/inquiries/schemas";
import {
  formatFileSize,
  formatInquiryBudget,
  formatInquiryDate,
  formatInquiryDateTime,
  getInquirySourceLabel,
} from "@/features/inquiries/utils";
import {
  type DashboardInquiryDetailCore,
  type DashboardInquiryRelatedQuotes,
  type InquiryNoteActionState,
  type InquiryWorkflowStatus,
} from "@/features/inquiries/types";
import type { DuplicateFlag } from "@/features/inquiries/qualification/types";
import { dismissDuplicateWarningAction } from "@/features/inquiries/qualification/actions";
import { formatQuoteMoney } from "@/features/quotes/utils";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";
import type { QuoteStatus } from "@/features/quotes/types";
import {
  getBusinessInquiriesPath,
  getBusinessInquiryExportPath,
  getBusinessInquiryPath,
  getBusinessNewQuotePath,
  getBusinessQuotePath,
  getBusinessServicePath,
} from "@/features/businesses/routes";
import { Button } from "@/components/ui/button";
import {
  MobileHeaderSlot,
  mobileNavbarIconButtonClassName,
} from "@/components/shell/mobile-header-slot";
import {
  CustomerHistorySheetSection,
  InquiryActivitySheetSection,
  InquiryNotesSheetSection,
} from "@/features/inquiries/components/inquiry-detail-sections";
import { getAppShellContext } from "@/lib/app-shell/context";
import { hasFeatureAccess } from "@/lib/plans";
import type { BusinessPlan } from "@/lib/plans/plans";
import { createNoIndexMetadata } from "@/lib/seo/site";
import type { Metadata } from "next";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Inquiry detail",
  description: "View and respond to a single inquiry for this business.",
});

type InquiryDetailPageProps = {
  params: Promise<{ businessSlug: string; id: string }>;
};

export const instant = true;

/**
 * Inquiry detail page — returns the structural shell synchronously.
 *
 * All dynamic reads (params, getAppShellContext, queries) are pushed into
 * `<Suspense>`-wrapped child server components so the shell paints instantly
 * on client navigation. Independently-failing regions (follow-ups,
 * customer history) are wrapped in co-located error boundaries.
 *
 * Staging: the frame resolves only the core row plus the related quotes the
 * header's primary action depends on, then paints the header, overview, and
 * sidebars. Attachments, notes, activity, follow-ups, and customer history
 * each stream behind their own region so a slow feed never holds back the
 * record.
 */
export default function InquiryDetailPage({
  params,
}: InquiryDetailPageProps) {
  // No awaits. Return error and suspense boundaries only; the shared
  // placeholder supplies the page wrapper (Quote detail pattern).
  return (
    <RegionErrorBoundary fallback={<DashboardDetailPageSkeleton variant="inquiry" />}>
      <Suspense fallback={<DashboardDetailPageSkeleton variant="inquiry" />}>
        <InquiryDetailRegion params={params} />
      </Suspense>
    </RegionErrorBoundary>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main detail region — resolves params + context + core row                 */
/* -------------------------------------------------------------------------- */

async function InquiryDetailRegion({
  params,
}: InquiryDetailPageProps) {
  const resolvedParams = await params;
  const { businessContext } = await getAppShellContext(resolvedParams.businessSlug);

  const parsedParams = inquiryRouteParamsSchema.safeParse(resolvedParams);

  if (!parsedParams.success) {
    notFound();
  }
  const businessSlug = businessContext.business.slug;
  const businessId = businessContext.business.id;
  const inquiryId = parsedParams.data.id;
  // The header's primary action switches on whether this inquiry already has
  // quotes, so the core row and the related quotes resolve together. The
  // heavier feeds (attachments, notes, activity) stream in their own regions.
  const [inquiry, relatedQuotes] = await Promise.all([
    getInquiryDetailCoreForBusiness({ businessId, inquiryId }),
    getInquiryRelatedQuotesForBusiness({ businessId, inquiryId }),
  ]);

  if (!inquiry) {
    notFound();
  }

  // Shared per-business read receipt runs client-side via
  // `<InquiryViewedTracker>` (Server Action + `updateTag`). Doing the DB
  // write + `updateTag` here during render throws
  // "used updateTag during render which is unsupported".
  const isUnreadInitially = !inquiry.firstViewedAt;

  const noteAction = addInquiryNoteAction.bind(null, inquiry.id);
  const statusAction = changeInquiryStatusAction.bind(null, inquiry.id);
  const archiveAction = archiveInquiryAction.bind(null, inquiry.id);
  const unarchiveAction = unarchiveInquiryAction.bind(null, inquiry.id);
  const deleteAction = deleteInquiryAction.bind(null, inquiry.id);
  const createFollowUpAction = createInquiryFollowUpAction.bind(null, inquiry.id);
  const customFields = getCustomSubmittedFields(
    inquiry.submittedFieldSnapshot,
  );
  const canExportData = hasFeatureAccess(
    businessContext.business.plan,
    "exports",
  );

  const canGenerateQuote = inquiry.recordState !== "archived";
  const workflowStatus: InquiryWorkflowStatus =
    inquiry.status === "quoted" ||
    inquiry.status === "won" ||
    inquiry.status === "lost"
      ? inquiry.status
      : "waiting";
  const customerContactEmail = getCustomerContactEmail(inquiry);
  const showPreferredContact = shouldShowPreferredContactTile(inquiry);
  const preferredContactLabel = getContactMethodLabel(
    inquiry.customerContactMethod,
  );

  return (
    <DashboardPage className="pb-24">
      <InquiryViewedTracker
        inquiryId={inquiry.id}
        isUnreadInitially={isUnreadInitially}
      />
      <Suspense fallback={null}>
        <InquiryDuplicateBannerRegion
          businessId={businessId}
          businessSlug={businessSlug}
          inquiryId={inquiry.id}
        />
      </Suspense>
      {inquiry.recordState === "archived" ? (
        <ArchivedRecordBanner
          recordLabel="inquiry"
          redirectHref={getBusinessInquiryPath(businessSlug, inquiry.id)}
          unarchiveAction={unarchiveAction}
        />
      ) : null}
      <DashboardDetailHeader
        className="[&_.dashboard-actions]:max-lg:hidden"
        eyebrow={`Inquiry ${inquiry.id.slice(0, 8)}`}
        title={inquiry.customerName}
        description={`Received ${formatInquiryDate(inquiry.submittedAt)} · ${inquiry.requestedDeadline ? `Deadline ${formatInquiryDate(inquiry.requestedDeadline)}` : "No deadline"}`}
        meta={
          <>
            <InquiryStatusBadge status={inquiry.status} />
            {inquiry.recordState !== "active" ? (
              <InquiryRecordStateBadge state={inquiry.recordState} />
            ) : null}
          </>
        }
        actions={
          <MobileHeaderSlot desktopClassName="grid w-full gap-2.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto">
            {relatedQuotes ? (
              <InquiryQuoteActions
                businessSlug={businessSlug}
                relatedQuotes={relatedQuotes}
                canGenerateQuote={canGenerateQuote}
                inquiryId={inquiry.id}
                currency={businessContext.business.defaultCurrency}
              />
            ) : canGenerateQuote ? (
              <Button
                asChild
                aria-label="Generate quote"
                title="Generate quote"
                size="sm"
                className={mobileNavbarIconButtonClassName}
              >
                <Link href={getBusinessNewQuotePath(businessSlug, inquiry.id)}>
                  <ReceiptText data-icon="inline-start" />
                  <span className="hidden lg:inline">Generate quote</span>
                </Link>
              </Button>
            ) : null}
            {relatedQuotes &&
            relatedQuotes.count === 1 &&
            canGenerateQuote ? (
              <Button
                asChild
                variant="outline"
                aria-label="Generate quote"
                title="Generate quote"
                size="sm"
                className={mobileNavbarIconButtonClassName}
              >
                <Link href={getBusinessNewQuotePath(businessSlug, inquiry.id)}>
                  <ReceiptText data-icon="inline-start" />
                  <span className="hidden lg:inline">Generate quote</span>
                </Link>
              </Button>
            ) : null}
            <InquiryManageDropdown
              workflowStatus={workflowStatus}
              recordState={inquiry.recordState}
              businessInquiryListHref={getBusinessInquiriesPath(businessSlug)}
              statusAction={statusAction}
              archiveAction={archiveAction}
              unarchiveAction={unarchiveAction}
              deleteAction={deleteAction}
              canExport={canExportData}
              pdfHref={getBusinessInquiryExportPath(
                businessSlug,
                inquiry.id,
                "pdf",
              )}
              pngHref={getBusinessInquiryExportPath(
                businessSlug,
                inquiry.id,
                "png",
              )}
            />
          </MobileHeaderSlot>
        }
      />

      <InquiryWorkflowSteps status={inquiry.status} />

      <DashboardDetailLayout className="xl:grid-cols-[1.45fr_0.95fr]">
        <DashboardSidebarStack>
          <InquiryOverviewSection
            businessSlug={businessSlug}
            customFields={customFields}
            inquiry={inquiry}
          />

          <Suspense fallback={null}>
            <InquiryAttachmentsRegion
              businessId={businessId}
              inquiryId={inquiry.id}
            />
          </Suspense>

          <div className="dashboard-detail-support-grid">
            <Suspense fallback={<DetailSectionFallback rows={2} />}>
              <InquiryNotesRegion
                businessId={businessId}
                inquiryId={inquiry.id}
                noteAction={noteAction}
              />
            </Suspense>

            <RegionErrorBoundary fallback={<CustomerHistoryFallback locked={false} />}>
              <Suspense fallback={<CustomerHistoryFallback locked={false} />}>
                <InquiryCustomerHistoryRegion
                  businessId={businessId}
                  businessSlug={businessSlug}
                  customerContactHandle={inquiry.customerContactHandle}
                  customerEmail={inquiry.customerEmail}
                  excludeQuoteId={relatedQuotes?.latest.id ?? null}
                  inquiryId={inquiry.id}
                />
              </Suspense>
            </RegionErrorBoundary>

            <Suspense fallback={<DetailSectionFallback />}>
              <InquiryActivityRegion
                businessId={businessId}
                inquiryId={inquiry.id}
              />
            </Suspense>
          </div>
        </DashboardSidebarStack>

        <DashboardSidebarStack>
          <InquiryContactSection
            customerContactEmail={customerContactEmail}
            inquiry={inquiry}
            preferredContactLabel={preferredContactLabel}
            showPreferredContact={showPreferredContact}
          />

          <div id="follow-ups">
            <RegionErrorBoundary fallback={<FollowUpPanelFallback />}>
              <Suspense fallback={<FollowUpPanelFallback />}>
                <InquiryFollowUpsRegion
                  businessId={businessId}
                  businessPlan={businessContext.business.plan}
                  businessSlug={businessSlug}
                  businessTimezone={businessContext.business.timezone}
                  createAction={createFollowUpAction}
                  inquiryId={inquiry.id}
                  customerContactMethod={inquiry.customerContactMethod}
                  customerName={inquiry.customerName}
                />
              </Suspense>
            </RegionErrorBoundary>
          </div>

          <InquiryRelatedQuotesSection
            businessSlug={businessSlug}
            canGenerateQuote={canGenerateQuote}
            currency={businessContext.business.defaultCurrency}
            inquiryId={inquiry.id}
            relatedQuotes={relatedQuotes}
          />

          <RegionErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <AgentTranscriptSection
                businessId={businessId}
                inquiryId={inquiry.id}
              />
            </Suspense>
          </RegionErrorBoundary>
        </DashboardSidebarStack>
      </DashboardDetailLayout>
    </DashboardPage>
  );
}

/* -------------------------------------------------------------------------- */
/*  Streaming regions                                                         */
/* -------------------------------------------------------------------------- */

async function InquiryDuplicateBannerRegion({
  businessId,
  businessSlug,
  inquiryId,
}: {
  businessId: string;
  businessSlug: string;
  inquiryId: string;
}) {
  const duplicateRecord = await getInquiryDuplicateForBusiness({
    businessId,
    inquiryId,
  });

  if (!duplicateRecord || duplicateRecord.dismissedAt) {
    return null;
  }

  return (
    <InquiryDuplicateBanner
      duplicate={{
        originalInquiryId: duplicateRecord.originalInquiryId,
        reason: duplicateRecord.reason as DuplicateFlag["reason"],
        tokenOverlap: duplicateRecord.tokenOverlap,
      }}
      businessSlug={businessSlug}
      dismissAction={dismissDuplicateWarningAction.bind(
        null,
        duplicateRecord.id,
        businessId,
        inquiryId,
      )}
    />
  );
}

async function InquiryAttachmentsRegion({
  businessId,
  inquiryId,
}: {
  businessId: string;
  inquiryId: string;
}) {
  const attachments = await getInquiryAttachmentsForBusiness({
    businessId,
    inquiryId,
  });

  if (!attachments.length) {
    return null;
  }

  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="Files included with the inquiry."
      title="Attachments"
    >
      <div className="soft-panel shadow-none">
        <p className="text-sm font-medium text-foreground">
          {attachments.length} file
          {attachments.length === 1 ? "" : "s"} attached
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Open the attachment list when you need the customer files.
        </p>
      </div>
      <Sheet>
        <SheetTrigger asChild>
          <Button className="w-full sm:w-fit" type="button" variant="outline">
            <FileText data-icon="inline-start" />
            View attachments
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Attachments</SheetTitle>
            <SheetDescription>
              Files included with this inquiry.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="min-h-0 flex-1">
            <ScrollArea className="h-full pr-4">
              <DashboardDetailFeed>
                {attachments.map((attachment) => (
                  <DashboardDetailFeedItem
                    key={attachment.id}
                    action={
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={`/api/inquiries/${inquiryId}/attachments/${attachment.id}`}
                        >
                          Download
                        </a>
                      </Button>
                    }
                    meta={
                      <>
                        <span>{formatFileSize(attachment.fileSize)}</span>
                        <span aria-hidden="true">|</span>
                        <TruncatedTextWithTooltip
                          className="max-w-44"
                          text={attachment.contentType}
                        />
                        <span aria-hidden="true">|</span>
                        <span>
                          {formatInquiryDateTime(attachment.createdAt)}
                        </span>
                      </>
                    }
                    title={attachment.fileName}
                  />
                ))}
              </DashboardDetailFeed>
            </ScrollArea>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </DashboardSection>
  );
}

async function InquiryNotesRegion({
  businessId,
  inquiryId,
  noteAction,
}: {
  businessId: string;
  inquiryId: string;
  noteAction: (
    state: InquiryNoteActionState,
    formData: FormData,
  ) => Promise<InquiryNoteActionState>;
}) {
  const notes = await getInquiryNotesForBusiness({ businessId, inquiryId });

  return <InquiryNotesSheetSection noteAction={noteAction} notes={notes} />;
}

async function InquiryActivityRegion({
  businessId,
  inquiryId,
}: {
  businessId: string;
  inquiryId: string;
}) {
  const activities = await getInquiryActivitiesForBusiness({
    businessId,
    inquiryId,
  });

  return <InquiryActivitySheetSection activities={activities} />;
}

async function InquiryCustomerHistoryRegion({
  businessId,
  businessSlug,
  customerContactHandle,
  customerEmail,
  excludeQuoteId,
  inquiryId,
}: {
  businessId: string;
  businessSlug: string;
  customerContactHandle: string;
  customerEmail: string | null;
  excludeQuoteId: string | null;
  inquiryId: string;
}) {
  const history = await getCustomerHistoryForBusiness({
    businessId,
    customerEmail,
    customerContactHandle,
    excludeInquiryId: inquiryId,
    excludeQuoteId,
  });

  return (
    <CustomerHistorySheetSection
      businessSlug={businessSlug}
      history={history}
      locked={false}
    />
  );
}

async function InquiryFollowUpsRegion({
  businessId,
  businessPlan,
  businessSlug,
  businessTimezone,
  createAction,
  inquiryId,
  customerContactMethod,
  customerName,
}: {
  businessId: string;
  businessPlan: BusinessPlan;
  businessSlug: string;
  businessTimezone: string;
  createAction: React.ComponentProps<typeof FollowUpPanel>["createAction"];
  inquiryId: string;
  customerContactMethod: string;
  customerName: string;
}) {
  const followUps = await getFollowUpsForInquiry({ businessId, inquiryId });

  return (
    <FollowUpPanel
      businessSlug={businessSlug}
      createAction={createAction}
      ctaDescription="Set a reminder for the next customer touchpoint on this inquiry."
      defaultChannel={customerContactMethod}
      defaultReason="Follow up with the customer to keep this inquiry moving."
      defaultTitle={`Follow up with ${customerName}`}
      followUps={followUps}
      plan={businessPlan}
      timezone={businessTimezone}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Sections                                                                  */
/* -------------------------------------------------------------------------- */

function InquiryOverviewSection({
  businessSlug,
  customFields,
  inquiry,
}: {
  businessSlug: string;
  customFields: ReturnType<typeof getCustomSubmittedFields>;
  inquiry: DashboardInquiryDetailCore;
}) {
  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="What the customer is asking for."
      title="Inquiry overview"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoTile
          icon={Briefcase}
          label="Service"
          value={
            inquiry.inquiryFormSlug ? (
              <Link
                href={getBusinessServicePath(
                  businessSlug,
                  inquiry.inquiryFormSlug,
                )}
                className="hover:underline"
              >
                {inquiry.inquiryFormName ??
                  getInquirySourceLabel(inquiry.source)}
              </Link>
            ) : (
              inquiry.inquiryFormName ??
              getInquirySourceLabel(inquiry.source)
            )
          }
        />
        <InfoTile
          icon={Wallet}
          label={systemFieldDefaultLabels.budgetText}
          value={formatInquiryBudget(inquiry.budgetText)}
        />
        <InfoTile
          icon={CalendarClock}
          label={systemFieldDefaultLabels.requestedDeadline}
          value={
            inquiry.requestedDeadline
              ? formatInquiryDate(inquiry.requestedDeadline)
              : "No deadline"
          }
        />
        <InfoTile
          icon={Tag}
          label="Source"
          value={getInquirySourceLabel(inquiry.source)}
        />
      </div>

      {inquiry.subject &&
      inquiry.subject !== (inquiry.inquiryFormName ?? "") ? (
        <div className="soft-panel shadow-none">
          <p className="meta-label">Subject</p>
          <p className="mt-2 text-sm leading-6 text-foreground">
            {inquiry.subject}
          </p>
        </div>
      ) : null}

      <div className="soft-panel flex flex-col gap-3 shadow-none">
        <div className="flex items-center gap-2">
          <MessageSquare
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          <p className="meta-label">{systemFieldDefaultLabels.details}</p>
        </div>
        <TruncatedTextWithTooltip
          className="whitespace-pre-wrap text-sm leading-6 text-foreground"
          lines={6}
          text={inquiry.details}
        />
      </div>

      {customFields.length ? (
        <Sheet>
          <SheetTrigger asChild>
            <Button className="w-full sm:w-fit" type="button" variant="outline">
              View additional details
            </Button>
          </SheetTrigger>
          <SheetContent
            className="w-full data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-3xl data-[side=right]:xl:max-w-4xl"
            motionPreset="sidebar"
          >
            <SheetHeader>
              <SheetTitle>Additional details</SheetTitle>
              <SheetDescription>
                Custom fields submitted with this inquiry.
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="min-h-0 flex-1">
              <ScrollArea className="h-full pr-4">
                <div className="grid gap-3 xl:grid-cols-2">
                  {customFields.map((field) => (
                    <InfoTile
                      key={field.id}
                      label={
                        <span className="break-words">{field.label}</span>
                      }
                      value={field.displayValue}
                    />
                  ))}
                </div>
              </ScrollArea>
            </SheetBody>
          </SheetContent>
        </Sheet>
      ) : null}
    </DashboardSection>
  );
}

function InquiryContactSection({
  customerContactEmail,
  inquiry,
  preferredContactLabel,
  showPreferredContact,
}: {
  customerContactEmail: string | null;
  inquiry: DashboardInquiryDetailCore;
  preferredContactLabel: string;
  showPreferredContact: boolean;
}) {
  return (
    <DashboardSection
      contentClassName="grid gap-3 sm:grid-cols-2"
      footer={
        customerContactEmail ? (
          <>
            <Button asChild variant="outline">
              <a href={`mailto:${customerContactEmail}`}>Email customer</a>
            </Button>
            <CopyEmailButton email={customerContactEmail} />
          </>
        ) : null
      }
      title="Customer contact"
    >
      <InfoTile
        className={showPreferredContact ? undefined : "sm:col-span-2"}
        icon={Mail}
        label="Email"
        valueClassName="break-all"
        value={
          customerContactEmail ? (
            <TruncatedTextWithTooltip
              className="underline-offset-4 hover:underline"
              href={`mailto:${customerContactEmail}`}
              text={customerContactEmail}
            />
          ) : (
            "Not provided"
          )
        }
      />

      {showPreferredContact ? (
        <InfoTile
          icon={AtSign}
          label={preferredContactLabel}
          value={inquiry.customerContactHandle}
          valueClassName="break-all"
        />
      ) : null}
    </DashboardSection>
  );
}

function InquiryRelatedQuotesSection({
  businessSlug,
  canGenerateQuote,
  currency,
  inquiryId,
  relatedQuotes,
}: {
  businessSlug: string;
  canGenerateQuote: boolean;
  currency: string;
  inquiryId: string;
  relatedQuotes: DashboardInquiryRelatedQuotes | null;
}) {
  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="Quotes linked to this inquiry."
      footer={
        canGenerateQuote ? (
          <Button asChild variant="outline">
            <Link href={getBusinessNewQuotePath(businessSlug, inquiryId)}>
              <ReceiptText data-icon="inline-start" />
              Create new quote
            </Link>
          </Button>
        ) : null
      }
      title={relatedQuotes ? `Related quotes (${relatedQuotes.count})` : "Related quotes"}
    >
      {relatedQuotes ? (
        <div className="flex flex-col gap-3">
          {relatedQuotes.all.map((quote) => (
            <Link
              key={quote.id}
              href={getBusinessQuotePath(businessSlug, quote.id)}
              className="soft-panel flex items-center justify-between gap-3 shadow-none transition-colors hover:bg-accent/50"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {quote.quoteNumber ?? quote.id}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatQuoteMoney(quote.totalInCents, currency)}
                  {" · "}
                  {formatInquiryDate(quote.createdAt)}
                </span>
              </div>
              <QuoteStatusBadge status={quote.status as QuoteStatus} />
            </Link>
          ))}
        </div>
      ) : (
        <DashboardEmptyState
          description="Create a quote from this inquiry."
          icon={ReceiptText}
          title="No related quotes yet"
          variant="section"
        />
      )}
    </DashboardSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers + fallbacks                                                       */
/* -------------------------------------------------------------------------- */

function FollowUpPanelFallback() {
  return (
    <DashboardSection
      description="Loading follow-up reminders..."
      title="Follow-ups"
    >
      <div className="flex flex-col gap-3">
        <div className="soft-panel animate-pulse shadow-none">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="mt-2 h-3 w-64 rounded bg-muted" />
        </div>
      </div>
    </DashboardSection>
  );
}

function CustomerHistoryFallback({ locked }: { locked: boolean }) {
  if (locked) {
    return (
      <DashboardSection
        contentClassName="flex flex-col gap-4"
        description="Past records for this customer email inside the current business."
        title="Customer history"
      >
        <DashboardEmptyState
          description="Upgrade to Pro to review prior inquiries and quotes for this customer."
          title="Customer history is a Pro feature"
          variant="section"
        />
      </DashboardSection>
    );
  }

  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="Past records for this customer email inside the current business."
      title="Customer history"
    >
      <div className="grid animate-pulse gap-3 sm:grid-cols-2">
        <div className="soft-panel shadow-none">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="mt-2 h-5 w-8 rounded bg-muted" />
        </div>
        <div className="soft-panel shadow-none">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="mt-2 h-5 w-8 rounded bg-muted" />
        </div>
      </div>
    </DashboardSection>
  );
}
