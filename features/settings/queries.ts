import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getBusinessRecordState } from "@/features/businesses/lifecycle";
import { getNormalizedInquiryFormConfig } from "@/features/inquiries/form-config";
import { getNormalizedInquiryPageConfig } from "@/features/inquiries/page-config";
import { normalizeBusinessType } from "@/features/inquiries/business-types";
import type {
  BusinessInquiryFormsSettingsView,
  BusinessInquiryFormEditorView,
  BusinessInquiryFormHeaderView,
  BusinessInquiryFormSettingsView,
  BusinessInquiryPageSettingsView,
  BusinessSettingsView,
} from "@/features/settings/types";
import {
  getBusinessInquiryFormCacheTags,
  getBusinessInquiryFormsCacheTags,
  getBusinessSettingsCacheTags,
  settingsBusinessCacheLife,
} from "@/lib/cache/business-tags";
import { normalizeBusinessInstructions } from "@/lib/ai/business-instructions";
import { db } from "@/lib/db/client";
import { inquiries, businessInquiryForms, businesses } from "@/lib/db/schema";

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
      aiAgentEnabled: businesses.aiAgentEnabled,
      aiAgentConfig: businesses.aiAgentConfig,
      activeBusinessCount: sql<number>`1`,
      updatedAt: businesses.updatedAt,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) return null;

  const agentConfig = business.aiAgentConfig as
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
    aiAgentTone:
      typeof agentConfig?.tone === "string" &&
      ["friendly", "professional", "casual"].includes(agentConfig.tone)
        ? (agentConfig.tone as "friendly" | "professional" | "casual")
        : "friendly",
    aiAgentInstructions:
      normalizeBusinessInstructions(agentConfig?.instructions) ?? "",
  };
}

export async function getBusinessInquiryPageSettingsForBusiness(
  businessId: string,
  formSlug?: string,
): Promise<BusinessInquiryPageSettingsView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(
    ...(
      formSlug
        ? getBusinessInquiryFormCacheTags(businessId, formSlug)
        : getBusinessInquiryFormsCacheTags(businessId)
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
      formId: businessInquiryForms.id,
      formName: businessInquiryForms.name,
      formSlug: businessInquiryForms.slug,
      businessType: businessInquiryForms.businessType,
      publicInquiryEnabled: businessInquiryForms.publicInquiryEnabled,
      isDefault: businessInquiryForms.isDefault,
      inquiryFormConfig: businessInquiryForms.inquiryFormConfig,
      inquiryPageConfig: businessInquiryForms.inquiryPageConfig,
    })
    .from(businesses)
    .innerJoin(
      businessInquiryForms,
      and(
        eq(businessInquiryForms.businessId, businesses.id),
        formSlug
          ? eq(businessInquiryForms.slug, formSlug)
          : eq(businessInquiryForms.isDefault, true),
        isNull(businessInquiryForms.archivedAt),
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
    formId: row.formId,
    formName: row.formName,
    formSlug: row.formSlug,
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

export async function getBusinessInquiryFormSettingsForBusiness(
  businessId: string,
  formSlug?: string,
): Promise<BusinessInquiryFormSettingsView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(
    ...(
      formSlug
        ? getBusinessInquiryFormCacheTags(businessId, formSlug)
        : getBusinessInquiryFormsCacheTags(businessId)
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
      formId: businessInquiryForms.id,
      formName: businessInquiryForms.name,
      formSlug: businessInquiryForms.slug,
      businessType: businessInquiryForms.businessType,
      publicInquiryEnabled: businessInquiryForms.publicInquiryEnabled,
      isDefault: businessInquiryForms.isDefault,
      inquiryFormConfig: businessInquiryForms.inquiryFormConfig,
      inquiryPageConfig: businessInquiryForms.inquiryPageConfig,
    })
    .from(businesses)
    .innerJoin(
      businessInquiryForms,
      and(
        eq(businessInquiryForms.businessId, businesses.id),
        formSlug
          ? eq(businessInquiryForms.slug, formSlug)
          : eq(businessInquiryForms.isDefault, true),
        isNull(businessInquiryForms.archivedAt),
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
    formId: row.formId,
    formName: row.formName,
    formSlug: row.formSlug,
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

export async function getBusinessInquiryFormsSettingsForBusiness(
  businessId: string,
): Promise<BusinessInquiryFormsSettingsView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getBusinessInquiryFormsCacheTags(businessId));

  const submittedInquiryCountSelection = sql<number>`(
    select count(*)::int
    from ${inquiries}
    where ${inquiries.businessInquiryFormId} = ${businessInquiryForms.id}
  )`;

  const [business, forms] = await Promise.all([
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
        id: businessInquiryForms.id,
        name: businessInquiryForms.name,
        slug: businessInquiryForms.slug,
        businessType: businessInquiryForms.businessType,
        isDefault: businessInquiryForms.isDefault,
        publicInquiryEnabled: businessInquiryForms.publicInquiryEnabled,
        archivedAt: businessInquiryForms.archivedAt,
        createdAt: businessInquiryForms.createdAt,
        updatedAt: businessInquiryForms.updatedAt,
        submittedInquiryCount: submittedInquiryCountSelection,
      })
      .from(businessInquiryForms)
      .where(eq(businessInquiryForms.businessId, businessId))
      .orderBy(
        desc(businessInquiryForms.isDefault),
        asc(businessInquiryForms.archivedAt),
        asc(businessInquiryForms.name),
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
    forms: forms.map((form) => {
      return {
        id: form.id,
        name: form.name,
        slug: form.slug,
        businessType: normalizeBusinessType(form.businessType),
        isDefault: form.isDefault,
        publicInquiryEnabled: form.publicInquiryEnabled,
        archivedAt: form.archivedAt,
        createdAt: form.createdAt,
        updatedAt: form.updatedAt,
        submittedInquiryCount: form.submittedInquiryCount,
      };
    }),
  };
}

/**
 * Cheap identity lookup for the service editor route.
 *
 * The page header and its links only need the business/form identity, so this
 * runs a single joined row fetch instead of the full editor payload (normalized
 * form + page configs and the form/inquiry counts), which streams separately.
 *
 * Cached under the form's own tag set so form edits (and business-level
 * settings such as the logo) invalidate it alongside the editor payload.
 */
export async function getBusinessInquiryFormHeaderForBusiness(
  businessId: string,
  formSlug: string,
): Promise<BusinessInquiryFormHeaderView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getBusinessSettingsCacheTags(businessId));
  cacheTag(...getBusinessInquiryFormCacheTags(businessId, formSlug));

  const [row] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      plan: businesses.plan,
      logoStoragePath: businesses.logoStoragePath,
      updatedAt: businesses.updatedAt,
      formId: businessInquiryForms.id,
      formName: businessInquiryForms.name,
      formSlug: businessInquiryForms.slug,
      businessType: businessInquiryForms.businessType,
      publicInquiryEnabled: businessInquiryForms.publicInquiryEnabled,
      isDefault: businessInquiryForms.isDefault,
    })
    .from(businesses)
    .innerJoin(
      businessInquiryForms,
      and(
        eq(businessInquiryForms.businessId, businesses.id),
        eq(businessInquiryForms.slug, formSlug),
        isNull(businessInquiryForms.archivedAt),
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
    formId: row.formId,
    formName: row.formName,
    formSlug: row.formSlug,
    businessType: normalizeBusinessType(row.businessType),
    publicInquiryEnabled: row.publicInquiryEnabled,
    isDefault: row.isDefault,
  };
}

export async function getBusinessInquiryFormEditorForBusiness(
  businessId: string,
  formSlug: string,
): Promise<BusinessInquiryFormEditorView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getBusinessInquiryFormCacheTags(businessId, formSlug));

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
        formId: businessInquiryForms.id,
        formName: businessInquiryForms.name,
        formSlug: businessInquiryForms.slug,
        businessType: businessInquiryForms.businessType,
        publicInquiryEnabled: businessInquiryForms.publicInquiryEnabled,
        isDefault: businessInquiryForms.isDefault,
        inquiryFormConfig: businessInquiryForms.inquiryFormConfig,
        inquiryPageConfig: businessInquiryForms.inquiryPageConfig,
      })
      .from(businesses)
      .innerJoin(
        businessInquiryForms,
        and(
          eq(businessInquiryForms.businessId, businesses.id),
          eq(businessInquiryForms.slug, formSlug),
          isNull(businessInquiryForms.archivedAt),
        ),
      )
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: businessInquiryForms.id,
      })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          isNull(businessInquiryForms.archivedAt),
        ),
      ),
    db
      .select({
        id: inquiries.id,
      })
      .from(inquiries)
      .innerJoin(
        businessInquiryForms,
        eq(inquiries.businessInquiryFormId, businessInquiryForms.id),
      )
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.slug, formSlug),
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
    formId: businessRow.formId,
    formName: businessRow.formName,
    formSlug: businessRow.formSlug,
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

export async function getDefaultBusinessInquiryFormForBusiness(
  businessId: string,
) {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getBusinessInquiryFormsCacheTags(businessId));

  const [form] = await db
    .select({
      id: businessInquiryForms.id,
      slug: businessInquiryForms.slug,
    })
    .from(businessInquiryForms)
    .where(
      and(
        eq(businessInquiryForms.businessId, businessId),
        eq(businessInquiryForms.isDefault, true),
        isNull(businessInquiryForms.archivedAt),
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

