import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getBusinessRecordState } from "@/features/businesses/lifecycle";
import { getNormalizedInquiryFormConfig } from "@/features/inquiries/form-config";
import { getNormalizedInquiryPageConfig } from "@/features/inquiries/page-config";
import { normalizeBusinessType } from "@/features/inquiries/business-types";
import type {
  ServicesSettingsView,
  ServiceEditorView,
  ServiceHeaderView,
  ServiceSettingsView,
  ServicePageSettingsView,
  BusinessSettingsView,
} from "@/features/settings/types";
import {
  getServiceCacheTags,
  getServicesCacheTags,
  getBusinessSettingsCacheTags,
  settingsBusinessCacheLife,
} from "@/lib/cache/business-tags";
import { normalizeBusinessInstructions } from "@/lib/ai/business-instructions";
import { db } from "@/lib/db/client";
import { inquiries, services, businesses } from "@/lib/db/schema";

export async function getBusinessSettingsForBusiness(
  businessId: string,
): Promise<BusinessSettingsView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getBusinessSettingsCacheTags(businessId));

  const [business] = await db
    .select({
      id: businesses.id,
      businessId: businesses.id,
      businessSlug: businesses.slug,
      plan: businesses.plan,
      name: businesses.name,
      slug: businesses.slug,
      recordState: getBusinessRecordState,
      archivedAt: businesses.archivedAt,
      deletedAt: businesses.deletedAt,
      countryCode: businesses.countryCode,
      businessType: businesses.businessType,
      shortDescription: businesses.shortDescription,
      contactEmail: businesses.contactEmail,
      website: businesses.website,
      logoStoragePath: businesses.logoStoragePath,
      logoContentType: businesses.logoContentType,
      defaultEmailSignature: businesses.defaultEmailSignature,
      defaultQuoteNotes: businesses.defaultQuoteNotes,
      defaultQuoteTerms: businesses.defaultQuoteTerms,
      quoteEmailTemplate: businesses.quoteEmailTemplate,
      invoiceEmailTemplate: businesses.invoiceEmailTemplate,
      quoteFollowUpTemplate: businesses.quoteFollowUpTemplate,
      defaultQuoteValidityDays: businesses.defaultQuoteValidityDays,
      sendInquiryAckEmail: businesses.sendInquiryAckEmail,
      autoDraftQuoteOnQualify: businesses.autoDraftQuoteOnQualify,
      autoArchiveStaleInquiries: businesses.autoArchiveStaleInquiries,
      autoArchiveStaleInquiryDays: businesses.autoArchiveStaleInquiryDays,
      autoFollowUpOnQuoteViewed: businesses.autoFollowUpOnQuoteViewed,
      quoteViewedFollowUpDelayDays: businesses.quoteViewedFollowUpDelayDays,
      notifyOnNewInquiry: businesses.notifyOnNewInquiry,
      notifyOnQuoteSent: businesses.notifyOnQuoteSent,
      notifyOnQuoteResponse: businesses.notifyOnQuoteResponse,
      notifyOnMemberInviteResponse: businesses.notifyOnMemberInviteResponse,
      notifyInAppOnNewInquiry: businesses.notifyInAppOnNewInquiry,
      notifyInAppOnQuoteSent: businesses.notifyInAppOnQuoteSent,
      notifyInAppOnQuoteResponse: businesses.notifyInAppOnQuoteResponse,
      notifyInAppOnMemberInviteResponse: businesses.notifyInAppOnMemberInviteResponse,
      notifyPushOnNewInquiry: businesses.notifyPushOnNewInquiry,
      notifyPushOnQuoteSent: businesses.notifyPushOnQuoteSent,
      notifyPushOnQuoteResponse: businesses.notifyPushOnQuoteResponse,
      notifyPushOnMemberInviteResponse: businesses.notifyPushOnMemberInviteResponse,
      notifyOnFollowUpReminder: businesses.notifyOnFollowUpReminder,
      notifyInAppOnFollowUpReminder: businesses.notifyInAppOnFollowUpReminder,
      notifyOnQuoteExpiring: businesses.notifyOnQuoteExpiring,
      notifyInAppOnQuoteExpiring: businesses.notifyInAppOnQuoteExpiring,
      defaultCurrency: businesses.defaultCurrency,
      agentEnabled: businesses.agentEnabled,
      agentConfig: businesses.agentConfig,
      activeBusinessCount: sql<number>`1`,
      updatedAt: businesses.updatedAt,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) return null;

  const agentConfig = business.agentConfig as
    | { tone?: string; instructions?: string }
    | null
    | undefined;

  const {
    normalizeInvoiceEmailTemplate,
    normalizeQuoteEmailTemplate,
    normalizeQuoteFollowUpTemplate,
  } = await import("@/features/settings/email-templates");

  return {
    ...business,
    quoteEmailTemplate: normalizeQuoteEmailTemplate(
      business.quoteEmailTemplate as Parameters<
        typeof normalizeQuoteEmailTemplate
      >[0],
    ),
    invoiceEmailTemplate: normalizeInvoiceEmailTemplate(
      business.invoiceEmailTemplate as Parameters<
        typeof normalizeInvoiceEmailTemplate
      >[0],
    ),
    quoteFollowUpTemplate: normalizeQuoteFollowUpTemplate(
      business.quoteFollowUpTemplate as Parameters<
        typeof normalizeQuoteFollowUpTemplate
      >[0],
    ),
    agentTone:
      typeof agentConfig?.tone === "string" &&
      ["friendly", "professional", "casual"].includes(agentConfig.tone)
        ? (agentConfig.tone as "friendly" | "professional" | "casual")
        : "friendly",
    agentInstructions:
      normalizeBusinessInstructions(agentConfig?.instructions) ?? "",
  };
}

export async function getServicePageSettingsForBusiness(
  businessId: string,
  serviceSlug?: string,
): Promise<ServicePageSettingsView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(
    ...(
      serviceSlug
        ? getServiceCacheTags(businessId, serviceSlug)
        : getServicesCacheTags(businessId)
    ),
  );

  const [row] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      plan: businesses.plan,
      shortDescription: businesses.shortDescription,
      logoStoragePath: businesses.logoStoragePath,
      updatedAt: businesses.updatedAt,
      inquiryHeadline: businesses.inquiryHeadline,
      serviceId: services.id,
      serviceName: services.name,
      serviceSlug: services.slug,
      businessType: services.businessType,
      publicInquiryEnabled: services.publicInquiryEnabled,
      isDefault: services.isDefault,
      inquiryFormConfig: services.inquiryFormConfig,
      inquiryPageConfig: services.inquiryPageConfig,
    })
    .from(businesses)
    .innerJoin(
      services,
      and(
        eq(services.businessId, businesses.id),
        serviceSlug
          ? eq(services.slug, serviceSlug)
          : eq(services.isDefault, true),
        isNull(services.archivedAt),
      ),
    )
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!row) {
    return null;
  }

  const businessType = normalizeBusinessType(row.businessType);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    shortDescription: row.shortDescription,
    logoStoragePath: row.logoStoragePath,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    serviceSlug: row.serviceSlug,
    businessType,
    publicInquiryEnabled: row.publicInquiryEnabled,
    isDefault: row.isDefault,
    inquiryFormConfig: getNormalizedInquiryFormConfig(row.inquiryFormConfig, {
      businessType,
    }),
    inquiryPageConfig: getNormalizedInquiryPageConfig(row.inquiryPageConfig, {
      businessName: row.name,
      businessShortDescription: row.shortDescription,
      legacyInquiryHeadline: row.inquiryHeadline,
      businessType,
    }),
    updatedAt: row.updatedAt,
  };
}

export async function getServiceSettingsForBusiness(
  businessId: string,
  serviceSlug?: string,
): Promise<ServiceSettingsView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(
    ...(
      serviceSlug
        ? getServiceCacheTags(businessId, serviceSlug)
        : getServicesCacheTags(businessId)
    ),
  );

  const [row] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      plan: businesses.plan,
      updatedAt: businesses.updatedAt,
      inquiryHeadline: businesses.inquiryHeadline,
      shortDescription: businesses.shortDescription,
      serviceId: services.id,
      serviceName: services.name,
      serviceSlug: services.slug,
      businessType: services.businessType,
      publicInquiryEnabled: services.publicInquiryEnabled,
      isDefault: services.isDefault,
      inquiryFormConfig: services.inquiryFormConfig,
      inquiryPageConfig: services.inquiryPageConfig,
    })
    .from(businesses)
    .innerJoin(
      services,
      and(
        eq(services.businessId, businesses.id),
        serviceSlug
          ? eq(services.slug, serviceSlug)
          : eq(services.isDefault, true),
        isNull(services.archivedAt),
      ),
    )
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!row) {
    return null;
  }

  const businessType = normalizeBusinessType(row.businessType);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    serviceSlug: row.serviceSlug,
    businessType,
    publicInquiryEnabled: row.publicInquiryEnabled,
    isDefault: row.isDefault,
    inquiryFormConfig: getNormalizedInquiryFormConfig(row.inquiryFormConfig, {
      businessType,
    }),
    inquiryPageConfig: getNormalizedInquiryPageConfig(row.inquiryPageConfig, {
      businessName: row.name,
      businessShortDescription: row.shortDescription,
      legacyInquiryHeadline: row.inquiryHeadline,
      businessType,
    }),
    updatedAt: row.updatedAt,
  };
}

export async function getServicesSettingsForBusiness(
  businessId: string,
): Promise<ServicesSettingsView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getServicesCacheTags(businessId));

  const submittedInquiryCountSelection = sql<number>`(
    select count(*)::int
    from ${inquiries}
    where ${inquiries.serviceId} = ${services.id}
  )`;

  const [business, serviceRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        businessType: businesses.businessType,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: services.id,
        name: services.name,
        slug: services.slug,
        businessType: services.businessType,
        isDefault: services.isDefault,
        publicInquiryEnabled: services.publicInquiryEnabled,
        archivedAt: services.archivedAt,
        createdAt: services.createdAt,
        updatedAt: services.updatedAt,
        submittedInquiryCount: submittedInquiryCountSelection,
      })
      .from(services)
      .where(eq(services.businessId, businessId))
      .orderBy(
        desc(services.isDefault),
        asc(services.archivedAt),
        asc(services.name),
      ),
  ]);

  const businessRow = business[0];

  if (!businessRow) {
    return null;
  }

  const businessType = normalizeBusinessType(businessRow.businessType);

  return {
    id: businessRow.id,
    name: businessRow.name,
    slug: businessRow.slug,
    businessType,
    services: serviceRows.map((service) => {
      return {
        id: service.id,
        name: service.name,
        slug: service.slug,
        businessType: normalizeBusinessType(service.businessType),
        isDefault: service.isDefault,
        publicInquiryEnabled: service.publicInquiryEnabled,
        archivedAt: service.archivedAt,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
        submittedInquiryCount: service.submittedInquiryCount,
      };
    }),
  };
}

/**
 * Cheap identity lookup for the service editor route.
 *
 * The page header and its links only need the business/service identity, so this
 * runs a single joined row fetch instead of the full editor payload (normalized
 * form + page configs and the form/inquiry counts), which streams separately.
 *
 * Cached under the form's own tag set so form edits (and business-level
 * settings such as the logo) invalidate it alongside the editor payload.
 */
export async function getServiceHeaderForBusiness(
  businessId: string,
  serviceSlug: string,
): Promise<ServiceHeaderView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getBusinessSettingsCacheTags(businessId));
  cacheTag(...getServiceCacheTags(businessId, serviceSlug));

  const [row] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      plan: businesses.plan,
      logoStoragePath: businesses.logoStoragePath,
      updatedAt: businesses.updatedAt,
      serviceId: services.id,
      serviceName: services.name,
      serviceSlug: services.slug,
      businessType: services.businessType,
      publicInquiryEnabled: services.publicInquiryEnabled,
      isDefault: services.isDefault,
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
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    logoStoragePath: row.logoStoragePath,
    updatedAt: row.updatedAt,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    serviceSlug: row.serviceSlug,
    businessType: normalizeBusinessType(row.businessType),
    publicInquiryEnabled: row.publicInquiryEnabled,
    isDefault: row.isDefault,
  };
}

export async function getServiceEditorForBusiness(
  businessId: string,
  serviceSlug: string,
): Promise<ServiceEditorView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getServiceCacheTags(businessId, serviceSlug));

  const [row, activeFormRows, inquiryRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        plan: businesses.plan,
        shortDescription: businesses.shortDescription,
        logoStoragePath: businesses.logoStoragePath,
        updatedAt: businesses.updatedAt,
        inquiryHeadline: businesses.inquiryHeadline,
        serviceId: services.id,
        serviceName: services.name,
        serviceSlug: services.slug,
        businessType: services.businessType,
        publicInquiryEnabled: services.publicInquiryEnabled,
        isDefault: services.isDefault,
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
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: services.id,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          isNull(services.archivedAt),
        ),
      ),
    db
      .select({
        id: inquiries.id,
      })
      .from(inquiries)
      .innerJoin(
        services,
        eq(inquiries.serviceId, services.id),
      )
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.slug, serviceSlug),
        ),
      ),
  ]);

  const businessRow = row[0];

  if (!businessRow) {
    return null;
  }

  const businessType = normalizeBusinessType(businessRow.businessType);

  return {
    id: businessRow.id,
    name: businessRow.name,
    slug: businessRow.slug,
    plan: businessRow.plan,
    shortDescription: businessRow.shortDescription,
    logoStoragePath: businessRow.logoStoragePath,
    serviceId: businessRow.serviceId,
    serviceName: businessRow.serviceName,
    serviceSlug: businessRow.serviceSlug,
    businessType,
    publicInquiryEnabled: businessRow.publicInquiryEnabled,
    isDefault: businessRow.isDefault,
    inquiryFormConfig: getNormalizedInquiryFormConfig(businessRow.inquiryFormConfig, {
      businessType,
    }),
    inquiryPageConfig: getNormalizedInquiryPageConfig(businessRow.inquiryPageConfig, {
      businessName: businessRow.name,
      businessShortDescription: businessRow.shortDescription,
      legacyInquiryHeadline: businessRow.inquiryHeadline,
      businessType,
    }),
    updatedAt: businessRow.updatedAt,
    activeFormCount: activeFormRows.length,
    submittedInquiryCount: inquiryRows.length,
  };
}

export async function getDefaultServiceForBusiness(
  businessId: string,
) {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getServicesCacheTags(businessId));

  const [form] = await db
    .select({
      id: services.id,
      slug: services.slug,
    })
    .from(services)
    .where(
      and(
        eq(services.businessId, businessId),
        eq(services.isDefault, true),
        isNull(services.archivedAt),
      ),
    )
    .limit(1);

  return form ?? null;
}

export async function getBusinessLogoAssetForBusiness(businessId: string) {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getBusinessSettingsCacheTags(businessId));

  const [business] = await db
    .select({
      logoStoragePath: businesses.logoStoragePath,
      logoContentType: businesses.logoContentType,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  return business ?? null;
}

