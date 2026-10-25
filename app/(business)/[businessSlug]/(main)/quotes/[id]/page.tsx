import Link from "next/link";
import { Receipt } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  DashboardDetailLayout,
  DashboardDetailHeader,
  DashboardPage,
  DashboardSection,
  DashboardSidebarStack,
} from "@/components/shared/dashboard-layout";
import { ArchivedRecordBanner } from "@/components/shared/archived-record-banner";
import { DetailSectionFallback } from "@/components/shared/detail-section-fallback";
import { RegionErrorBoundary } from "@/components/shared/region-error-boundary";
import { DetailSectionErrorFallback } from "@/components/shared/region-error-fallback";
import {
  DashboardDetailPageSkeleton,
  DashboardQuoteEditorSkeleton,
} from "@/components/shell/dashboard-detail-page-skeleton";
import { Button } from "@/components/ui/button";
import {
  MobileHeaderSlot,
  mobileNavbarIconButtonClassName,
} from "@/components/shell/mobile-header-slot";

import {
  acknowledgeQuoteUncertaintyAction,
  archiveQuoteAction,
  completeAcceptedQuoteAction,
  deleteDraftQuoteAction,
  logQuoteSendEventAction,
  restoreArchivedQuoteAction,
  sendQuoteAction,
  stopAutoFollowUpAction,
  updateQuoteAction,
  voidQuoteAction,
} from "@/features/quotes/actions";
import { createQuoteFollowUpAction } from "@/features/follow-ups/actions";
import { FollowUpPanel } from "@/features/follow-ups/components/follow-up-panel";
import {
  getContactMethodLabel,
  getCustomerContactEmail,
  shouldShowPreferredContactTile,
} from "@/features/inquiries/utils";
import { getCustomerHistoryForBusiness } from "@/features/customer-history/queries";
import { CopyQuoteLinkButton } from "@/features/quotes/components/copy-quote-link-button";
import { QuoteWorkflowSteps } from "@/features/businesses/components/workflow-steps";
import { QuoteEditor } from "@/features/quotes/components/quote-editor";
import { QuoteManageDropdown } from "@/features/quotes/components/quote-manage-dropdown";
import { QuotePreviewButton } from "@/features/quotes/components/quote-preview-button";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import { saveQuoteAsTemplateAction } from "@/features/quotes/quote-library-actions";
import { QuotePreview } from "@/features/quotes/components/quote-preview";
import { QuoteRecordStateBadge } from "@/features/quotes/components/quote-record-state-badge";
import { ReviseQuoteButton } from "@/features/quotes/components/revise-quote-button";
import { RevisionRequestFeedback } from "@/features/quotes/components/revision-request-feedback";
import { DismissibleQuoteAlert } from "@/features/quotes/components/dismissible-quote-alert";
import { SendQuoteDialog } from "@/features/quotes/components/send-quote-dialog";
import { AutoFollowUpStatus } from "@/features/quotes/components/auto-follow-up-status";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";
import { getFollowUpsForQuote } from "@/features/follow-ups/queries";
import { getQuoteLibraryForBusiness } from "@/features/quotes/quote-library-queries";
import {
  getAcceptanceForBusiness,
  getBusinessContactEmailForPreview,
  getQuoteActivitiesForBusiness,
  getQuoteDetailCoreForBusiness,
  getQuoteItemsForBusiness,
  getRevisionRequestsForQuote,
} from "@/features/quotes/queries";
import { quoteRouteParamsSchema } from "@/features/quotes/schemas";
import { getBusinessSettingsForBusiness } from "@/features/settings/queries";
import type {
  DashboardQuoteDetailCore,
} from "@/features/quotes/types";
import {
  formatQuoteDate,
  getPublicQuoteUrl,
  getQuoteEditorInitialValuesFromDetail,
  toPublicQuoteView,
} from "@/features/quotes/utils";
import {
  getBusinessInvoicePath,
  getBusinessNewInvoicePath,
  getBusinessQuoteExportPath,
  getBusinessQuotePath,
  getBusinessQuotePreviewPath,
  getBusinessQuotesPath,
} from "@/features/businesses/routes";
import { getInvoiceIdByQuoteId } from "@/features/invoices/queries";
import { env } from "@/lib/env";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildSendDialogProps,
  CustomerHistorySheetSection,
  QuoteAcceptanceSection,
  QuoteActivitySheetSection,
  QuoteContactSection,
  QuoteCustomerViewSection,
  QuoteLinkedInquirySection,
  resolveAutoFollowUpGate,
  type SendDialogContext,
} from "@/features/quotes/components/quote-detail-sections";
import { getAppShellContext } from "@/lib/app-shell/context";
import { createNoIndexMetadata } from "@/lib/seo/site";
import type { Metadata } from "next";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Quote detail",
  description: "View, edit, send, or track a single quote for this business.",
});

type QuoteDetailPageProps = {
  params: Promise<{ businessSlug: string; id: string }>;
};

export const instant = true;

/**
 * Quote detail page — returns the structural shell synchronously.
 *
 * All dynamic reads (params, getAppShellContext, quote queries) are pushed into
 * a `<Suspense>`-wrapped child server component so the shell paints instantly
 * on client navigation. A thrown frame or feed reaches the segment error
 * boundary, which renders the dashboard retry card instead of leaving the
 * loading skeleton in place.
 *
 * Staging: the frame resolves the core row plus the two cheap lookups the
 * header's actions need (contact email, linked invoice). Pricing library and
 * business settings (editor-only), line items, activity, follow-ups, and
 * customer history each stream behind their own region, so the published view
 * never waits on draft-only data and a slow feed never holds back the header.
 */
export default function QuoteDetailPage({
  params,
}: QuoteDetailPageProps) {
  return (
    <Suspense fallback={<DashboardDetailPageSkeleton variant="quote" />}>
      <QuoteDetailRegion params={params} />
    </Suspense>
  );
}

/* -------------------------------------------------------------------------- */
/*  Frame — params + context + core row + header actions                      */
/* -------------------------------------------------------------------------- */

async function QuoteDetailRegion({ params }: QuoteDetailPageProps) {
  const resolvedParams = await params;
  const { businessContext } = await getAppShellContext(resolvedParams.businessSlug);

  const parsedParams = quoteRouteParamsSchema.safeParse(resolvedParams);

  if (!parsedParams.success) {
    notFound();
  }
  const businessSlug = businessContext.business.slug;
  const businessId = businessContext.business.id;
  const quoteId = parsedParams.data.id;

  const [quote, businessContactEmail, linkedInvoice, acceptance] = await Promise.all([
    getQuoteDetailCoreForBusiness({ businessId, quoteId }),
    getBusinessContactEmailForPreview(businessId),
    getInvoiceIdByQuoteId({ businessId, quoteId }).catch((error) => {
      console.error("Failed to load linked invoice.", { quoteId }, error);
      return null;
    }),
    getAcceptanceForBusiness({ businessId, quoteId }).catch((error) => {
      console.error("Failed to load quote acceptance.", { quoteId }, error);
      return null;
    }),
  ]);

  if (!quote) {
    notFound();
  }

  const updateAction = updateQuoteAction.bind(null, quote.id);
  const archiveAction = archiveQuoteAction.bind(null, quote.id);
  const deleteDraftAction = deleteDraftQuoteAction.bind(null, quote.id);
  const completeAction = completeAcceptedQuoteAction.bind(null, quote.id);
  const restoreArchivedAction = restoreArchivedQuoteAction.bind(null, quote.id);
  const sendAction = sendQuoteAction.bind(null, quote.id);
  const logEventAction = logQuoteSendEventAction.bind(null, quote.id);
  const createFollowUpAction = createQuoteFollowUpAction.bind(null, quote.id);
  const voidAction = voidQuoteAction.bind(null, quote.id);
  const stopAutoFollowUp = stopAutoFollowUpAction.bind(null, quote.id);
  const saveAsTemplate = saveQuoteAsTemplateAction.bind(null, quote.id);
  const canSaveAsTemplate = hasFeatureAccess(
    businessContext.business.plan,
    "quoteLibrary",
  );
  const customerQuotePath = quote.publicToken
    ? getPublicQuoteUrl(quote.publicToken)
    : null;
  const customerQuoteUrl = customerQuotePath
    ? new URL(customerQuotePath, env.BETTER_AUTH_URL).toString()
    : null;

  const isArchived = quote.archivedAt !== null;
  const viewedWithoutResponse = Boolean(
    quote.status === "sent" &&
      quote.publicViewedAt &&
      !quote.customerRespondedAt,
  );
  const visibleQuoteReminders = quote.reminders.filter(
    (reminder) => reminder !== "follow_up_due",
  );
  const customerViewCopy =
    quote.status === "sent"
      ? {
          title: "Waiting for customer response",
        }
      : quote.status === "voided"
        ? {
            title: "Quote voided",
          }
        : {
            title: `Quote ${quote.status}`,
          };
  const quoteContactEmail = getCustomerContactEmail(quote);
  const showQuotePreferredContact = shouldShowPreferredContactTile(quote);
  const quotePreferredContactLabel = getContactMethodLabel(
    quote.customerContactMethod,
  );
  const needsAiConfirmation =
    quote.status === "draft" &&
    quote.aiReadiness === "needs_confirmation" &&
    !quote.aiAcknowledgedAt;
  const acknowledgeAction =
    quote.status === "draft"
      ? acknowledgeQuoteUncertaintyAction.bind(null, quote.id)
      : undefined;

  const sendDialogContext = {
    businessId,
    businessName: businessContext.business.name,
    businessPlan: businessContext.business.plan,
    businessSlug,
    businessLogoStoragePath: businessContext.business.logoStoragePath,
    customerQuoteUrl,
    needsAiConfirmation,
    acknowledgeAction,
    quote,
    sendAction,
    logEventAction,
    createFollowUpAction,
    previewHref: getBusinessQuotePreviewPath(businessSlug, quote.id),
  };

  return (
    <DashboardPage className="pb-24">
      {isArchived ? (
        <ArchivedRecordBanner
          recordLabel="quote"
          redirectHref={getBusinessQuotePath(businessSlug, quote.id)}
          unarchiveAction={restoreArchivedAction}
        />
      ) : null}
      <DashboardDetailHeader
        // Doubles the class for specificity so this beats the shared
        // `xl:max-w-xl` cap (same layer, source order not guaranteed).
        actionsClassName="[&.dashboard-detail-header-actions]:xl:max-w-none"
        className="[&_.dashboard-actions]:max-lg:hidden"
        eyebrow={`Quote ${quote.quoteNumber}`}
        title={quote.title}
        description={`${quote.customerName} · ${quote.sentAt ? `Sent ${formatQuoteDate(quote.sentAt)}` : `Created ${formatQuoteDate(quote.createdAt)}`} · Valid until ${formatQuoteDate(quote.validUntil)}`}
        meta={
          <>
            <QuoteStatusBadge status={quote.status} />
            {isArchived ? <QuoteRecordStateBadge state="archived" /> : null}
          </>
        }
        actions={
          <MobileHeaderSlot desktopClassName="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end xl:flex-nowrap [&>[data-slot=button]]:w-full sm:[&>[data-slot=button]]:w-auto">
            {quote.status === "accepted" && !linkedInvoice ? (
              <Button
                asChild
                aria-label="Create invoice"
                title="Create invoice"
                size="sm"
                className={mobileNavbarIconButtonClassName}
              >
                <Link href={getBusinessNewInvoicePath(businessSlug, quote.id)}>
                  <Receipt data-icon="inline-start" />
                  <span className="hidden lg:inline">Create invoice</span>
                </Link>
              </Button>
            ) : null}
            {quote.status === "accepted" && linkedInvoice ? (
              <Button
                asChild
                aria-label={`View invoice ${linkedInvoice.invoiceNumber}`}
                title={`View invoice ${linkedInvoice.invoiceNumber}`}
                size="sm"
                className={mobileNavbarIconButtonClassName}
              >
                <Link
                  href={getBusinessInvoicePath(businessSlug, linkedInvoice.id)}
                >
                  <Receipt data-icon="inline-start" />
                  <span className="hidden lg:inline">View invoice</span>
                </Link>
              </Button>
            ) : null}
            {/* Preview and the draft send dialog both need the line items, so
                they resolve in one feed region instead of holding the
                header's identity and management actions. */}
            <Suspense fallback={<QuoteHeaderActionsFallback />}>
              <QuoteHeaderFeedActionsRegion
                {...sendDialogContext}
                businessContactEmail={businessContactEmail}
                openQuoteHref={customerQuoteUrl}
              />
            </Suspense>
            {quote.status !== "draft" &&
            quote.status !== "accepted" &&
            customerQuoteUrl ? (
              <CopyQuoteLinkButton
                url={customerQuoteUrl}
                variant="outline"
                size="sm"
                compactOnMobile
              />
            ) : null}
            <QuoteManageDropdown
              archiveAction={archiveAction}
              businessQuoteListHref={getBusinessQuotesPath(businessSlug)}
              deleteDraftAction={deleteDraftAction}
              isArchived={isArchived}
              restoreArchivedAction={restoreArchivedAction}
              saveAsTemplateAction={canSaveAsTemplate ? saveAsTemplate : undefined}
              status={quote.status}
              voidAction={voidAction}
              pdfHref={getBusinessQuoteExportPath(businessSlug, quote.id, "pdf")}
              pngHref={getBusinessQuoteExportPath(businessSlug, quote.id, "png")}
              openQuoteHref={customerQuoteUrl}
              showMarkWorkDone={
                quote.status === "accepted" &&
                !quote.completedAt &&
                !quote.canceledAt
              }
              completeAction={completeAction}
            />
          </MobileHeaderSlot>
        }
      />

      <QuoteWorkflowSteps
        status={quote.status}
        publicViewedAt={quote.publicViewedAt}
      />

      {quote.status === "draft" ? (
        <>
          <Suspense fallback={<DashboardQuoteEditorSkeleton />}>
            <QuoteEditorRegion
              businessId={businessId}
              businessName={businessContext.business.name}
              businessLogoStoragePath={businessContext.business.logoStoragePath}
              businessPlan={businessContext.business.plan}
              businessSlug={businessSlug}
              quote={quote}
              updateAction={updateAction}
            />
          </Suspense>

          <DashboardDetailLayout className="xl:grid-cols-[1.25fr_0.75fr]">
            <DashboardSidebarStack>
              <QuoteLinkedInquirySection businessSlug={businessSlug} quote={quote} />
              <Suspense fallback={<DetailSectionFallback rows={2} />}>
                <QuoteActivityRegion businessId={businessId} quoteId={quote.id} />
              </Suspense>
              <RegionErrorBoundary fallback={<DetailSectionErrorFallback title="Customer history" />}>
                <Suspense fallback={<QuoteCustomerHistoryFallback />}>
                  <QuoteCustomerHistoryRegion
                    businessId={businessId}
                    businessSlug={businessSlug}
                    customerContactHandle={quote.customerContactHandle}
                    customerEmail={quote.customerEmail}
                    excludeInquiryId={quote.inquiryId}
                    excludeQuoteId={quote.id}
                  />
                </Suspense>
              </RegionErrorBoundary>
            </DashboardSidebarStack>

            <DashboardSidebarStack>
              <div id="send-quote">
                <DashboardSection
                  description="Send the finished draft to your customer."
                  title="Send quote"
                >
                  <Suspense fallback={<DetailSectionFallback rows={3} />}>
                    <QuoteSendSectionRegion {...sendDialogContext} />
                  </Suspense>
                </DashboardSection>
              </div>

              <div id="follow-ups">
                <RegionErrorBoundary fallback={<DetailSectionErrorFallback title="Follow-ups" />}>
                  <Suspense fallback={<FollowUpPanelFallback />}>
                    <QuoteFollowUpsRegion
                      businessId={businessId}
                      businessPlan={businessContext.business.plan}
                      businessSlug={businessSlug}
                      businessTimezone={businessContext.business.timezone}
                      createFollowUpAction={createFollowUpAction}
                      mode="draft"
                      quote={quote}
                      stopAutoFollowUp={stopAutoFollowUp}
                    />
                  </Suspense>
                </RegionErrorBoundary>
              </div>
            </DashboardSidebarStack>
          </DashboardDetailLayout>
        </>
      ) : (
        <DashboardDetailLayout className="xl:grid-cols-[minmax(0,1.05fr)_0.95fr]">
          <DashboardSidebarStack>

            <Suspense fallback={<DetailSectionFallback rows={6} />}>
              <QuotePreviewRegion
                businessId={businessId}
                businessName={businessContext.business.name}
                businessLogoStoragePath={businessContext.business.logoStoragePath}
                businessSlug={businessSlug}
                quote={quote}
              />
            </Suspense>

            <QuoteLinkedInquirySection businessSlug={businessSlug} quote={quote} />
            <Suspense fallback={<DetailSectionFallback rows={2} />}>
              <QuoteActivityRegion businessId={businessId} quoteId={quote.id} />
            </Suspense>
            <RegionErrorBoundary fallback={<DetailSectionErrorFallback title="Customer history" />}>
              <Suspense fallback={<QuoteCustomerHistoryFallback />}>
                <QuoteCustomerHistoryRegion
                  businessId={businessId}
                  businessSlug={businessSlug}
                  customerContactHandle={quote.customerContactHandle}
                  customerEmail={quote.customerEmail}
                  excludeInquiryId={quote.inquiryId}
                  excludeQuoteId={quote.id}
                />
              </Suspense>
            </RegionErrorBoundary>
          </DashboardSidebarStack>

          <DashboardSidebarStack>
            {quote.status === "revision_requested" ? (
              <Suspense fallback={<DetailSectionFallback rows={3} />}>
                <QuoteRevisionSectionRegion businessId={businessId} quoteId={quote.id} />
              </Suspense>
            ) : null}

            <QuoteCustomerViewSection
              customerQuotePath={customerQuotePath}
              customerQuoteUrl={customerQuoteUrl}
              customerViewCopy={customerViewCopy}
              quote={quote}
              visibleQuoteReminders={visibleQuoteReminders}
            />

            {quote.status === "accepted" ? (
              <QuoteAcceptanceSection acceptance={acceptance} quote={quote} />
            ) : null}

            <QuoteContactSection
              quote={quote}
              quoteContactEmail={quoteContactEmail}
              quotePreferredContactLabel={quotePreferredContactLabel}
              showQuotePreferredContact={showQuotePreferredContact}
            />

            <div id="follow-ups">
              <RegionErrorBoundary fallback={<DetailSectionErrorFallback title="Follow-ups" />}>
                <Suspense fallback={<FollowUpPanelFallback />}>
                  <QuoteFollowUpsRegion
                    businessId={businessId}
                    businessPlan={businessContext.business.plan}
                    businessSlug={businessSlug}
                    businessTimezone={businessContext.business.timezone}
                    createFollowUpAction={createFollowUpAction}
                    mode="published"
                    quote={quote}
                    stopAutoFollowUp={stopAutoFollowUp}
                    viewedWithoutResponse={viewedWithoutResponse}
                  />
                </Suspense>
              </RegionErrorBoundary>
            </div>

            {visibleQuoteReminders.includes("expiring_soon") ? (
              <DismissibleQuoteAlert
                id={`quote-${quote.id}-expiring`}
                title="Quote expiring soon"
                description={`This quote expires on ${formatQuoteDate(quote.validUntil)}.`}
              />
            ) : null}
          </DashboardSidebarStack>
        </DashboardDetailLayout>
      )}
    </DashboardPage>
  );
}

/* -------------------------------------------------------------------------- */
/*  Streaming regions                                                         */
/* -------------------------------------------------------------------------- */

async function QuoteHeaderFeedActionsRegion(
  props: SendDialogContext & {
    businessContactEmail: string | null;
    openQuoteHref: string | null;
  },
) {
  const [items, gate] = await Promise.all([
    getQuoteItemsForBusiness({ businessId: props.businessId, quoteId: props.quote.id }),
    resolveAutoFollowUpGate(props.businessId, props.businessPlan),
  ]);

  const isDraft = props.quote.status === "draft";
  const isAccepted = props.quote.status === "accepted";

  return (
    <>
      {isDraft ? (
        <SendQuoteDialog
          {...buildSendDialogProps({ ...props, ...gate, items })}
          compactOnMobile
        />
      ) : null}
      <QuotePreviewButton
        variant={isDraft || isAccepted ? "outline" : "default"}
        quote={toPublicQuoteView({
          quote: props.quote,
          business: {
            id: props.businessId,
            name: props.businessName,
            slug: props.businessSlug,
            plan: props.businessPlan,
            logoStoragePath: props.businessLogoStoragePath,
          },
          businessContactEmail: props.businessContactEmail,
          token: props.quote.publicToken ?? "",
          publicViewedAt: props.quote.publicViewedAt,
          items,
        })}
        businessPlan={props.businessPlan}
        businessContactEmail={props.businessContactEmail}
        businessName={props.businessName}
        openQuoteHref={props.openQuoteHref}
      />
    </>
  );
}

async function QuoteSendSectionRegion(props: SendDialogContext) {
  const [items, gate] = await Promise.all([
    getQuoteItemsForBusiness({ businessId: props.businessId, quoteId: props.quote.id }),
    resolveAutoFollowUpGate(props.businessId, props.businessPlan),
  ]);

  return <SendQuoteDialog {...buildSendDialogProps({ ...props, ...gate, items })} />;
}

async function QuoteEditorRegion({
  businessId,
  businessName,
  businessLogoStoragePath,
  businessPlan,
  businessSlug,
  quote,
  updateAction,
}: {
  businessId: string;
  businessName: string;
  businessLogoStoragePath: string | null;
  businessPlan: Parameters<typeof hasFeatureAccess>[0];
  businessSlug: string;
  quote: DashboardQuoteDetailCore;
  updateAction: React.ComponentProps<typeof QuoteEditor>["action"];
}) {
  // Editor-only payload: the pricing library and business defaults are not
  // needed by the published view, so they load here instead of in the frame.
  const [items, pricingLibrary, businessSettings, revisionRequests] =
    await Promise.all([
      getQuoteItemsForBusiness({ businessId, quoteId: quote.id }),
      getQuoteLibraryForBusiness(businessId),
      getBusinessSettingsForBusiness(businessId),
      quote.status === "revision_requested" || quote.status === "draft"
        ? getRevisionRequestsForQuote(businessId, quote.id)
        : Promise.resolve([]),
    ]);

  const linkedInquiry = quote.linkedInquiry;

  return (
    <>
      {revisionRequests.length > 0 ? (
        <DashboardSection
          description="Customer feedback from the previous version. Use this to guide your edits."
          title="Revision feedback"
        >
          <RevisionRequestFeedback requests={revisionRequests} />
        </DashboardSection>
      ) : null}

      <QuoteEditor
        action={updateAction}
        businessDefaults={
          businessSettings
            ? {
                defaultQuoteNotes: businessSettings.defaultQuoteNotes,
                defaultQuoteTerms: businessSettings.defaultQuoteTerms,
                defaultQuoteValidityDays: businessSettings.defaultQuoteValidityDays,
              }
            : undefined
        }
        businessName={businessName}
        businessSlug={businessSlug}
        businessLogoStoragePath={businessLogoStoragePath}
        canUseAiGenerator={hasFeatureAccess(businessPlan, "aiQuoteDrafting")}
        canUseQuoteLibrary={hasFeatureAccess(businessPlan, "quoteLibrary")}
        currency={quote.currency}
        initialValues={getQuoteEditorInitialValuesFromDetail({
          ...quote,
          items,
        })}
        key={quote.id}
        linkedInquiry={linkedInquiry}
        pricingLibrary={pricingLibrary}
        quoteNumber={quote.quoteNumber}
        revisionComment={revisionRequests[0]?.message ?? null}
        showFloatingUnsavedChanges
        submitLabel="Save changes"
        submitPendingLabel="Saving changes..."
      />
    </>
  );
}

async function QuotePreviewRegion({
  businessId,
  businessName,
  businessLogoStoragePath,
  businessSlug,
  quote,
}: {
  businessId: string;
  businessName: string;
  businessLogoStoragePath: string | null;
  businessSlug: string;
  quote: DashboardQuoteDetailCore;
}) {
  const items = await getQuoteItemsForBusiness({
    businessId,
    quoteId: quote.id,
  });

  return (
    <QuotePreview
      businessName={businessName}
      businessLogoStoragePath={businessLogoStoragePath}
      businessSlug={businessSlug}
      quoteNumber={quote.quoteNumber}
      title={quote.title}
      customerName={quote.customerName}
      customerEmail={quote.customerEmail}
      currency={quote.currency}
      validUntil={quote.validUntil}
      notes={quote.notes}
      terms={quote.terms}
      items={items}
      subtotalInCents={quote.subtotalInCents}
      discountInCents={quote.discountInCents}
      taxInCents={quote.taxInCents}
      taxLabel={quote.taxLabel}
      totalInCents={quote.totalInCents}
    />
  );
}

async function QuoteActivityRegion({
  businessId,
  quoteId,
}: {
  businessId: string;
  quoteId: string;
}) {
  const activities = await getQuoteActivitiesForBusiness({ businessId, quoteId });

  return <QuoteActivitySheetSection activities={activities} />;
}

async function QuoteCustomerHistoryRegion({
  businessId,
  businessSlug,
  customerContactHandle,
  customerEmail,
  excludeInquiryId,
  excludeQuoteId,
}: {
  businessId: string;
  businessSlug: string;
  customerContactHandle: string;
  customerEmail: string | null;
  excludeInquiryId: string | null;
  excludeQuoteId: string | null;
}) {
  const history = await getCustomerHistoryForBusiness({
    businessId,
    customerEmail,
    customerContactHandle,
    excludeInquiryId,
    excludeQuoteId,
  });

  return (
    <CustomerHistorySheetSection history={history} businessSlug={businessSlug} />
  );
}

async function QuoteRevisionSectionRegion({
  businessId,
  quoteId,
}: {
  businessId: string;
  quoteId: string;
}) {
  const revisionRequests = await getRevisionRequestsForQuote(businessId, quoteId);

  return (
    <DashboardSection
      description="The customer has requested changes. Review their feedback, then create a new version to edit and re-send."
      title="Revision requested"
    >
      <RevisionRequestFeedback requests={revisionRequests} />
      <div className="mt-4">
        <ReviseQuoteButton quoteId={quoteId} />
      </div>
    </DashboardSection>
  );
}

async function QuoteFollowUpsRegion({
  businessId,
  businessPlan,
  businessSlug,
  businessTimezone,
  createFollowUpAction,
  mode,
  quote,
  stopAutoFollowUp,
  viewedWithoutResponse = false,
}: {
  businessId: string;
  businessPlan: Parameters<typeof hasFeatureAccess>[0];
  businessSlug: string;
  businessTimezone: string;
  createFollowUpAction: React.ComponentProps<typeof FollowUpPanel>["createAction"];
  mode: "draft" | "published";
  quote: DashboardQuoteDetailCore;
  stopAutoFollowUp: React.ComponentProps<typeof AutoFollowUpStatus>["stopAction"];
  viewedWithoutResponse?: boolean;
}) {
  const [followUps, gate] = await Promise.all([
    getFollowUpsForQuote({ businessId, quoteId: quote.id }),
    resolveAutoFollowUpGate(businessId, businessPlan),
  ]);

  const hasPendingFollowUp = followUps.some(
    (followUp) => followUp.status === "pending",
  );

  return (
    <>
      {quote.autoFollowUpEnabled ? (
        <AutoFollowUpStatus
          enabled={quote.autoFollowUpEnabled}
          attempts={quote.autoFollowUpAttempts}
          maxAttempts={quote.autoFollowUpMaxAttempts}
          delayDays={quote.autoFollowUpDelayDays}
          stoppedAt={quote.autoFollowUpStoppedAt}
          activeCount={gate.activeAutoFollowUpCount}
          activeLimit={gate.activeAutoFollowUpLimit}
          stopAction={stopAutoFollowUp}
        />
      ) : null}
      <FollowUpPanel
        businessSlug={businessSlug}
        createAction={createFollowUpAction}
        ctaDescription={
          mode === "published" && viewedWithoutResponse
            ? "Set a reminder to follow up now that the customer has viewed this quote."
            : "Set a reminder to check back after sharing this quote."
        }
        defaultChannel={quote.customerContactMethod}
        defaultReason={
          mode === "published" && viewedWithoutResponse
            ? "Follow up because the customer viewed this quote but has not responded."
            : "Follow up with the customer about this quote if they have not responded."
        }
        defaultTitle={`Follow up on quote ${quote.quoteNumber}`}
        followUps={followUps}
        plan={businessPlan}
        timezone={businessTimezone}
        sharedQuoteWithoutFollowUp={
          mode === "published" && quote.status === "sent" && !hasPendingFollowUp
        }
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sections                                                                  */
/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */
/*  Fallbacks                                                                  */
/* -------------------------------------------------------------------------- */

/** Header-slot placeholder for the item-dependent header actions. */
function QuoteHeaderActionsFallback() {
  return (
    <>
      <Skeleton className="h-9 w-full rounded-md sm:h-8 sm:w-36" />
      <Skeleton className="h-9 w-full rounded-md sm:h-8 sm:w-32" />
    </>
  );
}

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

function QuoteCustomerHistoryFallback() {
  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="Past records for this customer."
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
