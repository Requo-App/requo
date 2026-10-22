import type { BusinessRecordState } from "@/features/businesses/lifecycle";
import type { InquiryStatus } from "@/features/inquiries/types";
import type { PlanTier as plan } from "@/lib/plans/plans";
import type {
  QuoteReminderKind,
  QuoteStatus,
} from "@/features/quotes/types";
export {
  businessMemberRoles,
  type BusinessMemberRole,
} from "@/lib/business-members";

export type BusinessOverviewInquiryActionItem = {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  subject: string | null;
  status: InquiryStatus;
  submittedAt: Date;
};

export type BusinessOverviewQuoteActionItem = {
  id: string;
  inquiryId: string | null;
  quoteNumber: string;
  title: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  currency: string;
  totalInCents: number;
  status: QuoteStatus;
  validUntil: string;
  sentAt: Date | null;
  acceptedAt: Date | null;
  customerRespondedAt: Date | null;
  updatedAt: Date;
  reminders: QuoteReminderKind[];
};

export type BusinessOverviewCounts = {
  overdueInquiries: number;
  expiringSoonQuotes: number;
  newInquiries: number;
  recentAcceptedQuotes: number;
  declinedQuotes: number;
  draftQuotes: number;
  awaitingResponseQuotes: number;
};

export type BusinessOverviewData = {
  overdueInquiries: BusinessOverviewInquiryActionItem[];
  expiringSoonQuotes: BusinessOverviewQuoteActionItem[];
  newInquiries: BusinessOverviewInquiryActionItem[];
  recentAcceptedQuotes: BusinessOverviewQuoteActionItem[];
  declinedQuotes: BusinessOverviewQuoteActionItem[];
  draftQuotes: BusinessOverviewQuoteActionItem[];
  awaitingResponseQuotes: BusinessOverviewQuoteActionItem[];
  counts: BusinessOverviewCounts;
};

/**
 * Lightweight, all-plans money snapshot for the dashboard KPI row.
 * Both figures are quote-derived; sums assume a single business currency.
 */
export type BusinessMoneySnapshot = {
  currency: string;
  wonInCents: number;
  wonCount: number;
  inPlayInCents: number;
  inPlayCount: number;
  /** Value of quotes accepted in the 30-day window before the current one. */
  wonInCentsPrior: number;
  /** Count of quotes accepted in the 30-day window before the current one. */
  wonCountPrior: number;
};

export type BusinessDashboardSummaryData = {
  totalInquiries: number;
  totalQuotes: number;
  inquiriesThisWeek: number;
  inquiryCoverageRate: number;
  wonCount: number;
  lostCount: number;
};

export type CreateBusinessActionState = {
  error?: string;
  fieldErrors?: {
    name?: string[] | undefined;
    slug?: string[] | undefined;
    countryCode?: string[] | undefined;
    businessType?: string[] | undefined;
    defaultCurrency?: string[] | undefined;
    businessId?: string[] | undefined;
  };
};

export type BusinessQuotaSnapshot = {
  ownerUserId: string;
  plan: plan;
  current: number;
  limit: number | null;
  allowed: boolean;
  upgradePlan: plan | null;
};

export type BusinessRecordActionState = {
  error?: string;
  success?: string;
  fieldErrors?: {
    confirmation?: string[] | undefined;
  };
};

export type BusinessLifecycleView = {
  id: string;
  name: string;
  slug: string;
  businessId: string;
  businessSlug: string;
  recordState: BusinessRecordState;
  archivedAt: Date | null;
  deletedAt: Date | null;
  activeBusinessCount: number;
};

/**
 * Address shape consumed by the LocalBusiness / ProfessionalService JSON-LD
 * emitter. Keep every field optional: the schema currently has no dedicated
 * address columns, so we simply omit the shape when the data is absent.
 */
export type PublicBusinessAddress = {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
};

/**
 * Sitemap row for the public `/businesses/[slug]` route. `noIndex === true`
 * entries are produced for visibility reasons (so consumers can see what
 * was filtered) and must be dropped from the emitted sitemap to mirror the
 * page's `robots` metadata. Mirrors the public-visibility predicate used
 * by `getPublicBusinessProfileBySlug` (archived/locked/deleted all null).
 */
export type PublicBusinessSitemapEntry = {
  slug: string;
  pathname: string;
  lastModified: Date;
  noIndex: boolean;
};

/**
 * Public-facing business profile consumed by the `/businesses/[slug]` page
 * and `generateMetadata`. `isPublic` is the single noindex/sitemap source
 * of truth — a business is public when it is not archived, locked, or
 * soft-deleted. Optional address / telephone / areaServed fields are
 * returned as `undefined` because the schema does not yet carry those
 * columns.
 */
export type PublicBusinessProfile = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  logoUrl: string | null;
  updatedAt: Date;
  isPublic: boolean;
  address?: PublicBusinessAddress;
  telephone?: string;
  areaServed?: string;
};
