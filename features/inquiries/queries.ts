import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import type {
  InquiryRecordState,
  InquiryRecordView,
} from "@/features/inquiries/types";

export const getEffectiveInquiryStatus = effectiveInquiryStatus;
export const getInquiryRecordState = inquiryRecordState;

import {
  getNormalizedInquiryFormConfig,
  getNormalizedInquirySubmittedFieldSnapshot,
} from "@/features/inquiries/form-config";
import {
  getEffectiveInquiryStatus as effectiveInquiryStatus,
  getInquiryRecordState as inquiryRecordState,
} from "@/features/inquiries/status-sql";
import { getNormalizedInquiryPageConfig } from "@/features/inquiries/page-config";
import {
  resolveInquiryFormConfigForPlan,
  resolveInquiryPageConfigForPlan,
} from "@/features/inquiries/plan-rules";
import { normalizeBusinessType } from "@/features/inquiries/business-types";
import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";
import { isInquirySitemapSlugExcluded } from "@/lib/seo/inquiry-slugs";
import { isValidDateInput } from "@/lib/zod-helpers";
import {
  getBusinessInquiryDetailCacheTags,
  getServiceCacheTags,
  getServicesCacheTags,
  getBusinessInquiryListCacheTags,
  hotBusinessCacheLife,
} from "@/lib/cache/business-tags";
import { withCircuitBreaker } from "@/lib/db/circuit-breaker";
import { getCachedEffectivePlanForBusiness } from "@/lib/billing/subscription-service";
import { db } from "@/lib/db/client";
import {
  activityLogs,
  followUps,
  inquiries,
  inquiryAttachments,
  inquiryDuplicates,
  inquiryNotes,
  quotes,
  user,
  services,
  businesses,
  } from "@/lib/db/schema";
import type {
  DashboardInquiryActivity,
  DashboardInquiryAttachment,
  DashboardInquiryDetail,
  DashboardInquiryDetailCore,
  DashboardInquiryListItem,
  DashboardInquiryNote,
  DashboardInquiryRelatedQuotes,
  InquiryEditorService,
  InquiryListQueryFilters,
  PublicInquiryBusiness,
} from "@/features/inquiries/types";
import { normalizeInquirySource } from "@/features/inquiries/types";

export async function getPublicInquiryBusinessBySlug(
  slug: string,
): Promise<PublicInquiryBusiness | null> {
  return getCachedPublicInquiryBusinessBySlug(slug);
}

async function getCachedPublicInquiryBusinessBySlug(
  slug: string,
): Promise<PublicInquiryBusiness | null> {
  "use cache";

  cacheLife(hotBusinessCacheLife);

  const business = await getInquiryBusinessBySlug({
    slug,
    includeDisabled: false,
  });

  if (business) {
    cacheTag(
      ...getServicesCacheTags(business.id),
      ...getServiceCacheTags(business.id, business.form.slug),
    );
  }

  return business;
}

async function getInquiryBusinessBySlug({
  slug,
  includeDisabled,
}: {
  slug: string;
  includeDisabled: boolean;
}): Promise<PublicInquiryBusiness | null> {
  const [business] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      businessType: businesses.businessType,
      shortDescription: businesses.shortDescription,
      logoStoragePath: businesses.logoStoragePath,
      updatedAt: businesses.updatedAt,
      inquiryHeadline: businesses.inquiryHeadline,
      serviceId: services.id,
      serviceName: services.name,
      serviceSlug: services.slug,
      formBusinessType: services.businessType,
      formIsDefault: services.isDefault,
      formPublicInquiryEnabled: services.publicInquiryEnabled,
      businessPublicInquiryEnabled: businesses.publicInquiryEnabled,
      inquiryFormConfig: services.inquiryFormConfig,
      inquiryPageConfig: services.inquiryPageConfig,
    })
    .from(businesses)
    .innerJoin(
      services,
      and(
        eq(services.businessId, businesses.id),
        eq(services.isDefault, true),
        isNull(services.archivedAt),
      ),
    )
    .where(
      and(
        eq(businesses.slug, slug),
        isNull(businesses.deletedAt),
        isNull(businesses.deletedAt),
        includeDisabled
          ? undefined
          : and(isNull(businesses.archivedAt), isNull(businesses.lockedAt)),
      ),
    )
    .limit(1);

  if (
    !business ||
    (!includeDisabled &&
      (!business.formPublicInquiryEnabled ||
        !business.businessPublicInquiryEnabled))
  ) {
    return null;
  }

  const formBusinessType = normalizeBusinessType(business.formBusinessType);

  // The plan gates the form config, the page config, and the upload limit.
  // It must come from the authoritative subscription, not the denormalized
  // `businesses.plan` read cache: the submit action resolves the same
  // effective plan, and a mismatch would silently drop the answers a
  // visitor gave to fields the render path showed but the action dropped.
  const effectivePlan = await getCachedEffectivePlanForBusiness(business.id);

  const inquiryFormConfig = getNormalizedInquiryFormConfig(
    business.inquiryFormConfig,
    {
      businessType: formBusinessType,
    },
  );
  const inquiryPageConfig = getNormalizedInquiryPageConfig(
    business.inquiryPageConfig,
    {
      businessName: business.name,
      businessShortDescription: business.shortDescription,
      legacyInquiryHeadline: business.inquiryHeadline,
      businessType: formBusinessType,
    },
  );

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    plan: effectivePlan,
    businessType: formBusinessType,
    shortDescription: business.shortDescription,
    logoUrl: business.logoStoragePath
      ? `/api/public/businesses/${business.slug}/logo?v=${business.updatedAt.getTime()}`
      : null,
    form: {
      id: business.serviceId,
      name: business.serviceName,
      slug: business.serviceSlug,
      businessType: formBusinessType,
      isDefault: business.formIsDefault,
      publicInquiryEnabled: business.formPublicInquiryEnabled,
    },
    inquiryFormConfig: resolveInquiryFormConfigForPlan(
      inquiryFormConfig,
      effectivePlan,
    ),
    inquiryPageConfig: resolveInquiryPageConfigForPlan(
      inquiryPageConfig,
      effectivePlan,
    ),
  };
}

export async function getPublicInquiryBusinessByServiceSlug({
  businessSlug,
  serviceSlug,
}: {
  businessSlug: string;
  serviceSlug: string;
}): Promise<PublicInquiryBusiness | null> {
  return getCachedPublicInquiryBusinessByServiceSlug({
    businessSlug,
    serviceSlug,
  });
}

async function getCachedPublicInquiryBusinessByServiceSlug({
  businessSlug,
  serviceSlug,
}: {
  businessSlug: string;
  serviceSlug: string;
}): Promise<PublicInquiryBusiness | null> {
  "use cache";

  cacheLife(hotBusinessCacheLife);

  const business = await getInquiryBusinessByServiceSlug({
    businessSlug,
    serviceSlug,
    includeDisabled: false,
  });

  if (business) {
    cacheTag(
      ...getServicesCacheTags(business.id),
      ...getServiceCacheTags(business.id, business.form.slug),
    );
  }

  return business;
}

export async function getInquiryBusinessPreviewByServiceSlug({
  businessSlug,
  serviceSlug,
}: {
  businessSlug: string;
  serviceSlug: string;
}): Promise<PublicInquiryBusiness | null> {
  return getCachedInquiryBusinessPreviewByServiceSlug({
    businessSlug,
    serviceSlug,
  });
}

async function getCachedInquiryBusinessPreviewByServiceSlug({
  businessSlug,
  serviceSlug,
}: {
  businessSlug: string;
  serviceSlug: string;
}): Promise<PublicInquiryBusiness | null> {
  "use cache";

  cacheLife(hotBusinessCacheLife);

  const business = await getInquiryBusinessByServiceSlug({
    businessSlug,
    serviceSlug,
    includeDisabled: true,
  });

  if (business) {
    cacheTag(
      ...getServicesCacheTags(business.id),
      ...getServiceCacheTags(business.id, business.form.slug),
    );
  }

  return business;
}

async function getInquiryBusinessByServiceSlug({
  businessSlug,
  serviceSlug,
  includeDisabled,
}: {
  businessSlug: string;
  serviceSlug: string;
  includeDisabled: boolean;
}): Promise<PublicInquiryBusiness | null> {
  const [business] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      businessType: businesses.businessType,
      shortDescription: businesses.shortDescription,
      logoStoragePath: businesses.logoStoragePath,
      updatedAt: businesses.updatedAt,
      inquiryHeadline: businesses.inquiryHeadline,
      serviceId: services.id,
      serviceName: services.name,
      serviceSlug: services.slug,
      formBusinessType: services.businessType,
      formIsDefault: services.isDefault,
      formPublicInquiryEnabled: services.publicInquiryEnabled,
      businessPublicInquiryEnabled: businesses.publicInquiryEnabled,
      inquiryFormConfig: services.inquiryFormConfig,
      inquiryPageConfig: services.inquiryPageConfig,
    })
    .from(businesses)
    .innerJoin(
      services,
      and(
        eq(services.businessId, businesses.id),
        eq(services.slug, serviceSlug),
        isNull(services.archivedAt),
      ),
    )
    .where(
      and(
        eq(businesses.slug, businessSlug),
        isNull(businesses.deletedAt),
        isNull(businesses.deletedAt),
        includeDisabled
          ? undefined
          : and(isNull(businesses.archivedAt), isNull(businesses.lockedAt)),
      ),
    )
    .limit(1);

  if (
    !business ||
    (!includeDisabled &&
      (!business.formPublicInquiryEnabled ||
        !business.businessPublicInquiryEnabled))
  ) {
    return null;
  }

  const formBusinessType = normalizeBusinessType(business.formBusinessType);

  // The plan gates the form config, the page config, and the upload limit.
  // It must come from the authoritative subscription, not the denormalized
  // `businesses.plan` read cache: the submit action resolves the same
  // effective plan, and a mismatch would silently drop the answers a
  // visitor gave to fields the render path showed but the action dropped.
  const effectivePlan = await getCachedEffectivePlanForBusiness(business.id);

  const inquiryFormConfig = getNormalizedInquiryFormConfig(
    business.inquiryFormConfig,
    {
      businessType: formBusinessType,
    },
  );
  const inquiryPageConfig = getNormalizedInquiryPageConfig(
    business.inquiryPageConfig,
    {
      businessName: business.name,
      businessShortDescription: business.shortDescription,
      legacyInquiryHeadline: business.inquiryHeadline,
      businessType: formBusinessType,
    },
  );

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    plan: effectivePlan,
    businessType: formBusinessType,
    shortDescription: business.shortDescription,
    logoUrl: business.logoStoragePath
      ? `/api/public/businesses/${business.slug}/logo?v=${business.updatedAt.getTime()}`
      : null,
    form: {
      id: business.serviceId,
      name: business.serviceName,
      slug: business.serviceSlug,
      businessType: formBusinessType,
      isDefault: business.formIsDefault,
      publicInquiryEnabled: business.formPublicInquiryEnabled,
    },
    inquiryFormConfig: resolveInquiryFormConfigForPlan(
      inquiryFormConfig,
      effectivePlan,
    ),
    inquiryPageConfig: resolveInquiryPageConfigForPlan(
      inquiryPageConfig,
      effectivePlan,
    ),
  };
}

export async function getPublicBusinessLogoAssetBySlug(slug: string) {
  const [business] = await db
    .select({
      logoStoragePath: businesses.logoStoragePath,
      logoContentType: businesses.logoContentType,
    })
    .from(businesses)
    .where(
      and(
        eq(businesses.slug, slug),
        isNull(businesses.deletedAt),
        isNull(businesses.archivedAt),
        isNull(businesses.lockedAt),
        isNull(businesses.deletedAt),
      ),
    )
    .limit(1);

  return business ?? null;
}

type GetInquiryListForBusinessInput = {
  businessId: string;
  filters: InquiryListQueryFilters;
};

export function getOperationalInquiryCondition() {
  return and(isNull(inquiries.deletedAt), isNull(inquiries.archivedAt));
}

function getInquiryViewCondition(view: InquiryRecordView) {
  switch (view) {
    case "archived":
      return and(isNull(inquiries.deletedAt), isNotNull(inquiries.archivedAt));
    case "active":
    default:
      return and(isNull(inquiries.deletedAt), isNull(inquiries.archivedAt));
  }
}

function getInquiryListConditions({
  businessId,
  filters,
}: GetInquiryListForBusinessInput) {
  const conditions = [
    eq(inquiries.businessId, businessId),
    getInquiryViewCondition(filters.view),
  ];

  if (filters.status !== "all") {
    conditions.push(
      sql`${getEffectiveInquiryStatus} = ${filters.status}`,
    );
  }

  if (filters.source && filters.source !== "all") {
    const canonicalSource = normalizeInquirySource(filters.source);
    const legacyEquivalents = Object.entries({
      "public-inquiry-page": "service_form",
      "manual-dashboard": "manual",
      ai_agent: "ai_assistant",
      ai_agent_handoff: "ai_assistant",
      ai: "ai_assistant",
    } as const)
      .filter(([, canonical]) => canonical === canonicalSource)
      .map(([legacy]) => legacy);
    conditions.push(
      or(
        eq(inquiries.source, canonicalSource),
        ...legacyEquivalents.map((legacy) => eq(inquiries.source, legacy)),
      )!,
    );
  }

  if (filters.q) {
    const pattern = `%${filters.q}%`;

    conditions.push(
      or(
        ilike(inquiries.customerName, pattern),
        ilike(inquiries.customerEmail, pattern),
        ilike(inquiries.details, pattern),
        ilike(inquiries.subject, pattern),
      )!,
    );
  }

  if (filters.form !== "all") {
    conditions.push(eq(services.slug, filters.form));
  }

  if (filters.escalated) {
    conditions.push(eq(inquiries.escalated, true));
  }

  if (filters.unread) {
    conditions.push(isNull(inquiries.firstViewedAt));
  }

  return conditions;
}

export async function getInquiryListCountForBusiness({
  businessId,
  filters,
}: GetInquiryListForBusinessInput): Promise<number> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInquiryListCacheTags(businessId));

  const conditions = getInquiryListConditions({
    businessId,
    filters,
  });

  const rows = await withCircuitBreaker(
    `dashboard:inquiries-count:${businessId}`,
    () =>
      db
        .select({
          count: count(),
        })
        .from(inquiries)
        .leftJoin(
          services,
          eq(inquiries.serviceId, services.id),
        )
        .where(and(...conditions)),
  );

  return Number(rows[0]?.count ?? 0);
}

/**
 * Shared per-business unread count for the Inquiries nav badge and the
 * "Unread only" filter chip. Unread = never opened (`firstViewedAt IS NULL`)
 * and still active (excludes archived/deleted). Tagged with the inquiry list
 * tags so every existing inquiry mutation invalidates it automatically.
 */
export async function getUnreadInquiryCountForBusiness({
  businessId,
}: {
  businessId: string;
}): Promise<number> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInquiryListCacheTags(businessId));

  const rows = await withCircuitBreaker(
    `dashboard:inquiries-unread-count:${businessId}`,
    () =>
      db
        .select({ count: count() })
        .from(inquiries)
        .where(
          and(
            eq(inquiries.businessId, businessId),
            isNull(inquiries.firstViewedAt),
            isNull(inquiries.archivedAt),
            isNull(inquiries.deletedAt),
          ),
        ),
  );

  return Number(rows[0]?.count ?? 0);
}

type GetInquiryListPageForBusinessInput = GetInquiryListForBusinessInput & {
  page: number;
  pageSize: number;
};

export async function getInquiryListPageForBusiness({
  businessId,
  filters,
  page,
  pageSize,
}: GetInquiryListPageForBusinessInput): Promise<DashboardInquiryListItem[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInquiryListCacheTags(businessId));

  const conditions = getInquiryListConditions({
    businessId,
    filters,
  });

  const submittedAtSort = filters.sort === "oldest" ? asc : desc;
  const createdAtSort = filters.sort === "oldest" ? asc : desc;
  const offset = Math.max(0, (page - 1) * pageSize);

  const orderByClause =
    [submittedAtSort(inquiries.submittedAt), createdAtSort(inquiries.createdAt)];

  return withCircuitBreaker(
    `dashboard:inquiries:${businessId}`,
    () =>
      db
        .select({
          id: inquiries.id,
          serviceId: inquiries.serviceId,
          serviceName: services.name,
          serviceSlug: services.slug,
          source: inquiries.source,
          customerName: inquiries.customerName,
          customerEmail: inquiries.customerEmail,
          serviceCategory: inquiries.serviceCategory,
          budgetText: inquiries.budgetText,
          status: getEffectiveInquiryStatus,
          recordState: getInquiryRecordState,
          subject: inquiries.subject,
          archivedAt: inquiries.archivedAt,
          escalated: inquiries.escalated,
          pendingFollowUpCount: sql<number>`(
            select count(*)::int
            from ${followUps}
            where ${followUps.businessId} = ${inquiries.businessId}
              and ${followUps.inquiryId} = ${inquiries.id}
              and ${followUps.status} = 'pending'
              and ${followUps.deletedAt} is null
          )`,
          nextFollowUpDueAt: sql<Date | null>`(
            select min(${followUps.dueAt})
            from ${followUps}
            where ${followUps.businessId} = ${inquiries.businessId}
              and ${followUps.inquiryId} = ${inquiries.id}
              and ${followUps.status} = 'pending'
              and ${followUps.deletedAt} is null
          )`,
          hasDuplicateFlag: sql<boolean>`exists(
            select 1 from inquiry_duplicates
            where inquiry_duplicates.inquiry_id = ${inquiries.id}
              and inquiry_duplicates.dismissed_at is null
          )`,
          isUnread: sql<boolean>`${inquiries.firstViewedAt} is null`,
          submittedAt: inquiries.submittedAt,
          createdAt: inquiries.createdAt,
        })
        .from(inquiries)
        .leftJoin(
          services,
          eq(inquiries.serviceId, services.id),
        )
        .where(and(...conditions))
        .orderBy(...orderByClause)
        .limit(pageSize)
        .offset(offset),
  );
}

/**
 * Ids of the inquiries matching the current filters, capped at `limit`.
 *
 * The bulk "select all matching filters" affordance needs the whole
 * matching set, but the list route only warms a window of pages around the
 * current one — the client cannot derive the full set from what it holds.
 */
export async function getInquiryIdsMatchingFiltersForBusiness({
  businessId,
  filters,
  limit,
}: GetInquiryListForBusinessInput & {
  limit: number;
}): Promise<string[]> {
  const conditions = getInquiryListConditions({
    businessId,
    filters,
  });
  const submittedAtSort = filters.sort === "oldest" ? asc : desc;
  const createdAtSort = filters.sort === "oldest" ? asc : desc;

  const rows = await db
    .select({ id: inquiries.id })
    .from(inquiries)
    .leftJoin(
      services,
      eq(inquiries.serviceId, services.id),
    )
    .where(and(...conditions))
    .orderBy(
      submittedAtSort(inquiries.submittedAt),
      createdAtSort(inquiries.createdAt),
    )
    .limit(limit);

  return rows.map((row) => row.id);
}

/**
 * Upper bound on rows materialized by a single CSV export.
 *
 * The export builds the whole CSV in memory, so an unbounded result set is
 * a memory risk on a single request.
 */
export const inquiryExportRowLimit = 10_000;

/**
 * Builds a UTC date boundary from a `YYYY-MM-DD` filter value.
 *
 * Returns null for a missing or impossible date (`2024-13-45` matches the
 * shape but is not a real date) so a bad filter cannot produce an
 * Invalid Date that later throws while serializing.
 */
function parseExportBoundary(value: string | undefined, edge: "start" | "end") {
  if (!value || !isValidDateInput(value)) {
    return null;
  }

  return new Date(
    edge === "start"
      ? `${value}T00:00:00.000Z`
      : `${value}T23:59:59.999Z`,
  );
}

type InquiryExportRow = {
  id: string;
  serviceName: string | null;
  serviceSlug: string | null;
  source: string | null;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  requestedDeadline: string | null;
  budgetText: string | null;
  subject: string | null;
  details: string;
  status: string;
  recordState: InquiryRecordState;
  archivedAt: Date | null;
  submittedAt: Date;
};

export async function getInquiryExportRowsForBusiness({
  businessId,
  filters,
  from,
  to,
}: GetInquiryListForBusinessInput & {
  from?: string;
  to?: string;
}): Promise<InquiryExportRow[]> {
  const conditions = getInquiryListConditions({
    businessId,
    filters,
  });
  const fromDate = parseExportBoundary(from, "start");
  const toDate = parseExportBoundary(to, "end");

  if (fromDate) {
    conditions.push(gte(inquiries.submittedAt, fromDate));
  }

  if (toDate) {
    conditions.push(lte(inquiries.submittedAt, toDate));
  }

  const submittedAtSort = filters.sort === "oldest" ? asc : desc;
  const createdAtSort = filters.sort === "oldest" ? asc : desc;

  return db
    .select({
      id: inquiries.id,
      serviceName: services.name,
      serviceSlug: services.slug,
      source: inquiries.source,
      customerName: inquiries.customerName,
      customerEmail: inquiries.customerEmail,
      customerContactMethod: inquiries.customerContactMethod,
      customerContactHandle: inquiries.customerContactHandle,
      requestedDeadline: inquiries.requestedDeadline,
      budgetText: inquiries.budgetText,
      subject: inquiries.subject,
      details: inquiries.details,
      status: getEffectiveInquiryStatus,
      recordState: getInquiryRecordState,
      archivedAt: inquiries.archivedAt,
      submittedAt: inquiries.submittedAt,
    })
    .from(inquiries)
    .leftJoin(
      services,
      eq(inquiries.serviceId, services.id),
    )
    .where(and(...conditions))
    .orderBy(submittedAtSort(inquiries.submittedAt), createdAtSort(inquiries.createdAt))
    // The export materializes every row in memory and joins it into a
    // single CSV string. Cap the result so a large business cannot turn
    // one request into a multi-hundred-megabyte allocation. One extra row
    // lets the caller tell "exactly at the cap" from "truncated".
    .limit(inquiryExportRowLimit + 1);
}

type GetInquiryDetailForBusinessInput = {
  businessId: string;
  inquiryId: string;
};

/**
 * Core slice of the inquiry detail: the inquiry row plus its intake form.
 *
 * Split out of `getInquiryDetailForBusiness` so the detail page can paint
 * the header and the core sections from one indexed lookup while the
 * attachment, note, activity, and related-quote feeds stream behind their
 * own boundaries. Shares `getBusinessInquiryDetailCacheTags` with the
 * aggregate, so every existing inquiry mutation still invalidates it.
 */
async function getCachedInquiryDetailCore({
  businessId,
  inquiryId,
}: GetInquiryDetailForBusinessInput): Promise<DashboardInquiryDetailCore | null> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInquiryDetailCacheTags(businessId, inquiryId));

  const [inquiry] = await db
    .select({
      id: inquiries.id,
      businessId: inquiries.businessId,
      serviceId: inquiries.serviceId,
      serviceName: services.name,
      serviceSlug: services.slug,
      serviceBusinessType: services.businessType,
      customerName: inquiries.customerName,
      customerEmail: inquiries.customerEmail,
      customerContactMethod: inquiries.customerContactMethod,
      customerContactHandle: inquiries.customerContactHandle,
      serviceCategory: inquiries.serviceCategory,
      requestedDeadline: inquiries.requestedDeadline,
      budgetText: inquiries.budgetText,
      subject: inquiries.subject,
      details: inquiries.details,
      source: inquiries.source,
      status: getEffectiveInquiryStatus,
      recordState: getInquiryRecordState,
      archivedAt: inquiries.archivedAt,
      escalated: inquiries.escalated,
      firstViewedAt: inquiries.firstViewedAt,
      submittedAt: inquiries.submittedAt,
      createdAt: inquiries.createdAt,
      submittedFieldSnapshot: inquiries.submittedFieldSnapshot,
    })
    .from(inquiries)
    .leftJoin(
      services,
      eq(inquiries.serviceId, services.id),
    )
    .where(
      and(
        eq(inquiries.id, inquiryId),
        eq(inquiries.businessId, businessId),
        isNull(inquiries.deletedAt),
      ),
    )
    .limit(1);

  if (!inquiry) {
    return null;
  }

  const serviceBusinessType = normalizeBusinessType(
    inquiry.serviceBusinessType ?? "general_project_services",
  );

  return {
    ...inquiry,
    serviceBusinessType,
    submittedFieldSnapshot: getNormalizedInquirySubmittedFieldSnapshot(
      inquiry.submittedFieldSnapshot,
    ),
  };
}

async function getCachedInquiryAttachments({
  businessId,
  inquiryId,
}: GetInquiryDetailForBusinessInput): Promise<DashboardInquiryAttachment[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInquiryDetailCacheTags(businessId, inquiryId));

  return db
    .select({
      id: inquiryAttachments.id,
      fileName: inquiryAttachments.fileName,
      contentType: inquiryAttachments.contentType,
      fileSize: inquiryAttachments.fileSize,
      createdAt: inquiryAttachments.createdAt,
    })
    .from(inquiryAttachments)
    .where(
      and(
        eq(inquiryAttachments.businessId, businessId),
        eq(inquiryAttachments.inquiryId, inquiryId),
      ),
    )
    .orderBy(desc(inquiryAttachments.createdAt));
}

async function getCachedInquiryNotes({
  businessId,
  inquiryId,
}: GetInquiryDetailForBusinessInput): Promise<DashboardInquiryNote[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInquiryDetailCacheTags(businessId, inquiryId));

  return db
    .select({
      id: inquiryNotes.id,
      body: inquiryNotes.body,
      createdAt: inquiryNotes.createdAt,
      authorName: user.name,
      authorEmail: user.email,
    })
    .from(inquiryNotes)
    .leftJoin(user, eq(inquiryNotes.authorUserId, user.id))
    .where(
      and(
        eq(inquiryNotes.businessId, businessId),
        eq(inquiryNotes.inquiryId, inquiryId),
      ),
    )
    .orderBy(desc(inquiryNotes.createdAt));
}

async function getCachedInquiryActivities({
  businessId,
  inquiryId,
}: GetInquiryDetailForBusinessInput): Promise<DashboardInquiryActivity[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInquiryDetailCacheTags(businessId, inquiryId));

  return db
    .select({
      id: activityLogs.id,
      type: activityLogs.type,
      summary: activityLogs.summary,
      createdAt: activityLogs.createdAt,
      actorName: user.name,
    })
    .from(activityLogs)
    .leftJoin(user, eq(activityLogs.actorUserId, user.id))
    .where(
      and(
        eq(activityLogs.businessId, businessId),
        eq(activityLogs.inquiryId, inquiryId),
      ),
    )
    .orderBy(desc(activityLogs.createdAt));
}

async function getCachedInquiryRelatedQuotes({
  businessId,
  inquiryId,
}: GetInquiryDetailForBusinessInput): Promise<DashboardInquiryRelatedQuotes | null> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInquiryDetailCacheTags(businessId, inquiryId));

  const relatedQuoteRows = await db
    .select({
      id: quotes.id,
      status: quotes.status,
      quoteNumber: quotes.quoteNumber,
      totalInCents: quotes.totalInCents,
      createdAt: quotes.createdAt,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.businessId, businessId),
        eq(quotes.inquiryId, inquiryId),
        isNull(quotes.deletedAt),
      ),
    )
    .orderBy(desc(quotes.createdAt));

  return relatedQuoteRows.length
    ? {
        latest: relatedQuoteRows[0],
        all: relatedQuoteRows,
        count: relatedQuoteRows.length,
      }
    : null;
}

/**
 * Whole-record inquiry payload.
 *
 * Composes the staged slices below so the print page, the export route,
 * and the integration tests keep resolving one record in a single call.
 */
export async function getInquiryDetailForBusiness({
  businessId,
  inquiryId,
}: GetInquiryDetailForBusinessInput): Promise<DashboardInquiryDetail | null> {
  const [core, attachments, notes, activities, relatedQuotes] =
    await Promise.all([
      getCachedInquiryDetailCore({ businessId, inquiryId }),
      getCachedInquiryAttachments({ businessId, inquiryId }),
      getCachedInquiryNotes({ businessId, inquiryId }),
      getCachedInquiryActivities({ businessId, inquiryId }),
      getCachedInquiryRelatedQuotes({ businessId, inquiryId }),
    ]);

  if (!core) {
    return null;
  }

  return {
    ...core,
    attachments,
    notes,
    activities,
    relatedQuotes,
  };
}

/** Core slice, for the inquiry detail page's own Suspense regions. */
export async function getInquiryDetailCoreForBusiness({
  businessId,
  inquiryId,
}: GetInquiryDetailForBusinessInput): Promise<DashboardInquiryDetailCore | null> {
  return getCachedInquiryDetailCore({ businessId, inquiryId });
}

/** Attachment metadata, for the inquiry detail page's attachments region. */
export async function getInquiryAttachmentsForBusiness({
  businessId,
  inquiryId,
}: GetInquiryDetailForBusinessInput): Promise<DashboardInquiryAttachment[]> {
  return getCachedInquiryAttachments({ businessId, inquiryId });
}

/** Owner notes, for the inquiry detail page's notes region. */
export async function getInquiryNotesForBusiness({
  businessId,
  inquiryId,
}: GetInquiryDetailForBusinessInput): Promise<DashboardInquiryNote[]> {
  return getCachedInquiryNotes({ businessId, inquiryId });
}

/** Activity log, for the inquiry detail page's activity region. */
export async function getInquiryActivitiesForBusiness({
  businessId,
  inquiryId,
}: GetInquiryDetailForBusinessInput): Promise<DashboardInquiryActivity[]> {
  return getCachedInquiryActivities({ businessId, inquiryId });
}

/** Related quotes, for the inquiry detail page's related-quotes region. */
export async function getInquiryRelatedQuotesForBusiness({
  businessId,
  inquiryId,
}: GetInquiryDetailForBusinessInput): Promise<DashboardInquiryRelatedQuotes | null> {
  return getCachedInquiryRelatedQuotes({ businessId, inquiryId });
}

export async function getServiceOptionsForBusiness(
  businessId: string,
) {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getServicesCacheTags(businessId));

  return db
    .select({
      id: services.id,
      name: services.name,
      slug: services.slug,
      isDefault: services.isDefault,
      archivedAt: services.archivedAt,
    })
    .from(services)
    .where(eq(services.businessId, businessId))
    .orderBy(desc(services.isDefault), asc(services.name));
}

export async function getInquiryEditorServicesForBusiness(
  businessId: string,
): Promise<InquiryEditorService[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getServicesCacheTags(businessId));

  const serviceRows = await db
    .select({
      id: services.id,
      name: services.name,
      slug: services.slug,
      businessType: services.businessType,
      isDefault: services.isDefault,
      publicInquiryEnabled: services.publicInquiryEnabled,
      inquiryFormConfig: services.inquiryFormConfig,
    })
    .from(services)
    .where(
      and(
        eq(services.businessId, businessId),
        isNull(services.archivedAt),
      ),
    )
    .orderBy(desc(services.isDefault), asc(services.name));

  // Same plan source as the public inquiry path — the authoritative
  // subscription, not the denormalized `businesses.plan` read cache.
  const effectivePlan = await getCachedEffectivePlanForBusiness(businessId);

  return serviceRows.map((service) => {
    const businessType = normalizeBusinessType(service.businessType);

    return {
      id: service.id,
      name: service.name,
      slug: service.slug,
      businessType,
      isDefault: service.isDefault,
      publicInquiryEnabled: service.publicInquiryEnabled,
      inquiryFormConfig: resolveInquiryFormConfigForPlan(
        getNormalizedInquiryFormConfig(service.inquiryFormConfig, {
          businessType,
        }),
        effectivePlan,
      ),
    } satisfies InquiryEditorService;
  });
}

export async function getInquiryEditorServiceForBusiness({
  businessId,
  serviceSlug,
}: {
  businessId: string;
  serviceSlug: string;
}): Promise<InquiryEditorService | null> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(
    ...getServicesCacheTags(businessId),
    ...getServiceCacheTags(businessId, serviceSlug),
  );

  const [service] = await db
    .select({
      id: services.id,
      name: services.name,
      slug: services.slug,
      businessType: services.businessType,
      isDefault: services.isDefault,
      publicInquiryEnabled: services.publicInquiryEnabled,
      inquiryFormConfig: services.inquiryFormConfig,
    })
    .from(services)
    .where(
      and(
        eq(services.businessId, businessId),
        eq(services.slug, serviceSlug),
        isNull(services.archivedAt),
      ),
    )
    .limit(1);

  if (!service) {
    return null;
  }

  const businessType = normalizeBusinessType(service.businessType);

  // Same plan source as the public inquiry path — the authoritative
  // subscription, not the denormalized `businesses.plan` read cache.
  const effectivePlan = await getCachedEffectivePlanForBusiness(businessId);

  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    businessType,
    isDefault: service.isDefault,
    publicInquiryEnabled: service.publicInquiryEnabled,
    inquiryFormConfig: resolveInquiryFormConfigForPlan(
      getNormalizedInquiryFormConfig(service.inquiryFormConfig, {
        businessType,
      }),
      effectivePlan,
    ),
  } satisfies InquiryEditorService;
}

type GetInquiryAttachmentForBusinessInput = {
  businessId: string;
  inquiryId: string;
  attachmentId: string;
};

export async function getInquiryAttachmentForBusiness({
  businessId,
  inquiryId,
  attachmentId,
}: GetInquiryAttachmentForBusinessInput) {
  const [attachment] = await db
    .select({
      id: inquiryAttachments.id,
      fileName: inquiryAttachments.fileName,
      storagePath: inquiryAttachments.storagePath,
      contentType: inquiryAttachments.contentType,
    })
    .from(inquiryAttachments)
    .innerJoin(
      inquiries,
      and(
        eq(inquiryAttachments.inquiryId, inquiries.id),
        eq(inquiryAttachments.businessId, inquiries.businessId),
      ),
    )
    .where(
      and(
        eq(inquiryAttachments.id, attachmentId),
        eq(inquiryAttachments.inquiryId, inquiryId),
        eq(inquiryAttachments.businessId, businessId),
        eq(inquiries.id, inquiryId),
        eq(inquiries.businessId, businessId),
        // A deleted inquiry keeps its rows for audit, but its customer
        // uploads must not stay downloadable.
        isNull(inquiries.deletedAt),
      ),
    )
    .limit(1);

  return attachment ?? null;
}

export type PublicInquirySitemapEntry = {
  lastModified: Date;
  pathname: string;
};

/**
 * Indexable public inquiry URLs for sitemap.xml (mirrors public page visibility).
 *
 * Filters internal/test slugs so placeholder forms never waste crawl budget.
 */
export async function listPublicInquirySitemapEntries(): Promise<
  PublicInquirySitemapEntry[]
> {
  const rows = await db
    .select({
      businessSlug: businesses.slug,
      formIsDefault: services.isDefault,
      serviceSlug: services.slug,
      businessUpdatedAt: businesses.updatedAt,
      formUpdatedAt: services.updatedAt,
    })
    .from(businesses)
    .innerJoin(
      services,
      and(
        eq(services.businessId, businesses.id),
        eq(services.publicInquiryEnabled, true),
        isNull(services.archivedAt),
      ),
    )
    .where(
      and(
        isNull(businesses.deletedAt),
        isNull(businesses.archivedAt),
        isNull(businesses.lockedAt),
      ),
    );

  return rows
    .filter((row) => !isInquirySitemapSlugExcluded(row.businessSlug))
    .map((row) => ({
      lastModified:
        row.formUpdatedAt.getTime() >= row.businessUpdatedAt.getTime()
          ? row.formUpdatedAt
          : row.businessUpdatedAt,
      pathname: getBusinessPublicInquiryUrl(
        row.businessSlug,
        row.formIsDefault ? undefined : row.serviceSlug,
      ),
    }));
}

export type InquiryDuplicateRecord = {
  id: string;
  originalInquiryId: string;
  reason: string;
  tokenOverlap: number | null;
  dismissedAt: Date | null;
};

export async function getInquiryDuplicateForBusiness({
  businessId,
  inquiryId,
}: {
  businessId: string;
  inquiryId: string;
}): Promise<InquiryDuplicateRecord | null> {
  const [duplicate] = await db
    .select({
      id: inquiryDuplicates.id,
      originalInquiryId: inquiryDuplicates.originalInquiryId,
      reason: inquiryDuplicates.reason,
      tokenOverlap: inquiryDuplicates.tokenOverlap,
      dismissedAt: inquiryDuplicates.dismissedAt,
    })
    .from(inquiryDuplicates)
    .where(
      and(
        eq(inquiryDuplicates.businessId, businessId),
        eq(inquiryDuplicates.inquiryId, inquiryId),
      ),
    )
    .limit(1);

  return duplicate ?? null;
}
