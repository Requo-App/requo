import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { createQuoteAction } from "@/features/quotes/actions";
import { QuoteEditor } from "@/features/quotes/components/quote-editor";
import { NewQuoteWithTemplatePicker } from "@/features/quotes/components/new-quote-with-template-picker";
import { getQuoteLibraryForBusiness } from "@/features/quotes/quote-library-queries";
import { getInquiryQuotePrefillForBusiness } from "@/features/quotes/queries";
import { getBusinessSettingsForBusiness } from "@/features/settings/queries";
import { inquiryRouteParamsSchema } from "@/features/inquiries/schemas";
import {
  createQuoteEditorLineItem,
  getDefaultQuoteValidityDate,
  getQuoteEditorInitialValuesFromInquiry,
} from "@/features/quotes/utils";
import { getAppShellContext } from "@/lib/app-shell/context";
import { timed } from "@/lib/dev/server-timing";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { hasFeatureAccess } from "@/lib/plans";

type NewQuotePageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = createNoIndexMetadata({
  title: "New quote",
  description: "Draft a new quote for a customer, optionally linked to an inquiry.",
});

export const instant = true;

/**
 * New quote page — returns the structural shell synchronously.
 *
 * All dynamic reads (params, searchParams, getAppShellContext, settings/inquiry
 * queries) are pushed into a `<Suspense>`-wrapped child server component so the
 * shell paints instantly on client navigation. Failures reach the dashboard
 * segment `error.tsx` retry card.
 */
export default function NewQuotePage({
  params,
  searchParams,
}: NewQuotePageProps) {
  return (
    <DashboardPage>
      <Suspense fallback={<NewQuoteEditorSkeleton />}>
        <NewQuoteContent params={params} searchParams={searchParams} />
      </Suspense>
    </DashboardPage>
  );
}

export function NewQuoteEditorSkeleton() {
  return (
    <>
      <PageHeader
        eyebrow="New quote"
        title="Create a new quote"
      />
      <div className="flex flex-col gap-6">
        <div className="section-panel animate-pulse">
          <div className="flex flex-col gap-5">
            <div className="h-6 w-32 rounded-md bg-muted" />
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-3">
                <div className="h-4 w-24 rounded-md bg-muted" />
                <div className="h-12 w-full rounded-xl bg-muted" />
              </div>
              <div className="grid gap-3">
                <div className="h-4 w-24 rounded-md bg-muted" />
                <div className="h-12 w-full rounded-xl bg-muted" />
              </div>
            </div>
            <div className="grid gap-3">
              <div className="h-4 w-24 rounded-md bg-muted" />
              <div className="h-12 w-full rounded-xl bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

async function NewQuoteContent({
  params,
  searchParams,
}: NewQuotePageProps) {
  const [{ businessSlug }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const rawInquiryId = Array.isArray(rawSearchParams.inquiryId)
    ? rawSearchParams.inquiryId[0]
    : rawSearchParams.inquiryId;
  const parsedInquiryId = inquiryRouteParamsSchema.safeParse({
    id: rawInquiryId,
  });
  const inquiryId = parsedInquiryId.success ? parsedInquiryId.data.id : undefined;
  const [businessSettings, inquiryPrefill, pricingLibrary] = await timed(
    "newQuote.parallelSettingsInquiryPricingLibrary",
    Promise.all([
      getBusinessSettingsForBusiness(businessContext.business.id),
      inquiryId
        ? getInquiryQuotePrefillForBusiness({
            businessId: businessContext.business.id,
            inquiryId,
          })
        : Promise.resolve(null),
      getQuoteLibraryForBusiness(businessContext.business.id),
    ]),
  );

  if (!businessSettings) {
    notFound();
  }

  if (rawInquiryId && inquiryId && !inquiryPrefill) {
    notFound();
  }

  const initialValues = inquiryPrefill
    ? getQuoteEditorInitialValuesFromInquiry(inquiryPrefill, {
        defaultQuoteNotes: businessSettings.defaultQuoteNotes,
        defaultQuoteTerms: businessSettings.defaultQuoteTerms,
        defaultQuoteValidityDays: businessSettings.defaultQuoteValidityDays,
      })
    : {
        title: "",
        customerName: "",
        customerEmail: null,
        customerContactMethod: "email" as const,
        customerContactHandle: "",
        notes: businessSettings.defaultQuoteNotes ?? "",
        terms: businessSettings.defaultQuoteTerms ?? "",
        validUntil: getDefaultQuoteValidityDate(
          businessSettings.defaultQuoteValidityDays,
        ),
        discount: "",
        discountType: "amount" as const,
        tax: "",
        taxType: "amount" as const,
        taxLabel: "",
        items: [createQuoteEditorLineItem()],
      };
  const linkedInquiry = inquiryPrefill
      ? {
          id: inquiryPrefill.id,
          customerName: inquiryPrefill.customerName,
          customerEmail: inquiryPrefill.customerEmail,
          customerContactMethod: inquiryPrefill.customerContactMethod,
          customerContactHandle: inquiryPrefill.customerContactHandle,
          recordState: inquiryPrefill.recordState,
          subject: inquiryPrefill.subject,
          requestedDeadline: inquiryPrefill.requestedDeadline,
          status: inquiryPrefill.status,
          details: inquiryPrefill.details,
          budgetText: inquiryPrefill.budgetText,
        }
    : null;
  const action = createQuoteAction.bind(null, inquiryPrefill?.id ?? null);
  const canUseLibrary = hasFeatureAccess(
    businessContext.business.plan,
    "quoteLibrary",
  );
  const templates = canUseLibrary
    ? pricingLibrary.filter((e) => e.kind === "template")
    : [];
  const showTemplatePicker = !linkedInquiry && templates.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="New quote"
        title={
          linkedInquiry
            ? "Turn this inquiry into a quote"
            : "Create a new quote"
        }
      />

      {showTemplatePicker ? (
        <NewQuoteWithTemplatePicker
          action={action}
          baseInitialValues={initialValues}
          businessDefaults={{
            defaultQuoteNotes: businessSettings.defaultQuoteNotes,
            defaultQuoteTerms: businessSettings.defaultQuoteTerms,
            defaultQuoteValidityDays: businessSettings.defaultQuoteValidityDays,
          }}
          businessName={businessContext.business.name}
          businessSlug={businessContext.business.slug}
          businessLogoStoragePath={businessContext.business.logoStoragePath}
          canUseAiGenerator={hasFeatureAccess(
            businessContext.business.plan,
            "aiQuoteDrafting",
          )}
          canUseQuoteLibrary={canUseLibrary}
          currency={businessContext.business.defaultCurrency}
          key="with-picker"
          linkedInquiry={null}
          pricingLibrary={pricingLibrary}
          submitLabel="Create draft quote"
          submitPendingLabel="Creating draft..."
          templates={templates}
        />
      ) : (
        <QuoteEditor
          action={action}
          businessDefaults={{
            defaultQuoteNotes: businessSettings.defaultQuoteNotes,
            defaultQuoteTerms: businessSettings.defaultQuoteTerms,
            defaultQuoteValidityDays: businessSettings.defaultQuoteValidityDays,
          }}
          businessName={businessContext.business.name}
          businessSlug={businessContext.business.slug}
          businessLogoStoragePath={businessContext.business.logoStoragePath}
          canUseAiGenerator={hasFeatureAccess(
            businessContext.business.plan,
            "aiQuoteDrafting",
          )}
          canUseQuoteLibrary={canUseLibrary}
          currency={businessContext.business.defaultCurrency}
          initialValues={initialValues}
          key={inquiryPrefill?.id ?? "manual"}
          linkedInquiry={linkedInquiry}
          pricingLibrary={pricingLibrary}
          submitLabel="Create draft quote"
          submitPendingLabel="Creating draft..."
        />
      )}
    </>
  );
}
