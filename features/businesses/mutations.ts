import "server-only";

import { and, count, eq, isNull } from "drizzle-orm";

import { writeAuditLog } from "@/features/audit/mutations";
import type { BusinessRecordState } from "@/features/businesses/lifecycle";
import { assignPackForNewBusiness } from "@/features/businesses/pack-assignments";
import { getBehaviorPack } from "@/features/businesses/behavior-packs";
import { seedRecipesForBusiness } from "@/features/businesses/pack-recipes";
import type { StarterWorkflowKey } from "@/features/businesses/starter-workflows";
import { getStarterTemplateDefinition } from "@/features/businesses/starter-templates";
import {
  assertBusinessQuotaAvailableForUser,
  getOwnedBusinessCountForUser,
} from "@/features/businesses/quota";
import type { BusinessType } from "@/features/inquiries/business-types";
import { createServicePreset, normalizeServiceSlug } from "@/features/inquiries/service-presets";
import { newEntityId } from "@/lib/ids";
import {
  createInquiryFormConfigDefaults,
  type InquiryFormConfig,
} from "@/features/inquiries/form-config";
import { createInquiryPageConfigDefaults } from "@/features/inquiries/page-config";
import { ensureProfileForUser } from "@/lib/auth/business-bootstrap";
import {
  canStartBusinessTrial,
  startBusinessTrial,
} from "@/lib/billing/subscription-service";
import { db } from "@/lib/db/client";
import type { PlanTier as plan } from "@/lib/plans/plans";
import {
  activityLogs,
  services,
  businessMembers,
  businesses,
  } from "@/lib/db/schema";
import { appendRandomSlugSuffix, slugifyPublicName } from "@/lib/slugs";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { validateBusinessSlug } from "@/features/businesses/validation";
import { isLowEmailMode } from "@/lib/env";

type CreateBusinessForUserInput = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  businessId: string;
  defaultCurrency: string;
  name: string;
  preferredSlug?: string;
  businessType: BusinessType;
  starterWorkflow?: StarterWorkflowKey;
  countryCode?: string | null;
  shortDescription?: string | null;
  customerContactChannel?: string | null;
  /**
   * Named services created during onboarding. The first becomes the default
   * service; extras get their own slug. Empty/absent falls back to the
   * type-derived preset service. Trimming to the resolved plan's live limit
   * happens inside this module, after trial eligibility is known.
   */
  onboardingServices?: Array<{ name: string }>;
  inquiryFormConfigOverride?: InquiryFormConfig;
  plan?: plan;
  /**
   * Claim the owner's one-time Pro trial when this is their first active
   * business. Defaults to true for user-initiated creation.
   */
  startTrial?: boolean;
  activitySource?: string;
  activitySummary?: string;
};

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getAvailableBusinessSlug(
  tx: DatabaseTransaction,
  baseSlug: string,
) {
  let candidate = baseSlug;

  while (true) {
    const [existingBusiness] = await tx
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, candidate))
      .limit(1);

    if (!existingBusiness) {
      return candidate;
    }

    candidate = appendRandomSlugSuffix(baseSlug, {
      fallback: "business",
    });
  }
}

type CreateBusinessRecordForUserInput = CreateBusinessForUserInput & {
  tx: DatabaseTransaction;
  now?: Date;
};

/**
 * Deduplicates a service slug within a new business's services. Runs inside
 * the business-creation transaction, so earlier inserts in this transaction
 * (the default service and any prior extras) are already visible to the
 * collision check. Mirrors the settings create path's random-suffix fallback.
 */
async function getAvailableOnboardingServiceSlug(
  tx: DatabaseTransaction,
  businessId: string,
  baseSlug: string,
) {
  const normalizedBaseSlug = normalizeServiceSlug(baseSlug);
  let candidate = normalizedBaseSlug;

  while (true) {
    const [existingForm] = await tx
      .select({ id: services.id })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.slug, candidate),
        ),
      )
      .limit(1);

    if (!existingForm) {
      return candidate;
    }

    candidate = appendRandomSlugSuffix(normalizedBaseSlug, {
      fallback: "inquiry",
    });
  }
}

export async function createBusinessRecordForUser({
  tx,
  businessId,
  defaultCurrency,
  user,
  name,
  preferredSlug,
  businessType,
  starterWorkflow,
  countryCode = null,
  shortDescription,
  customerContactChannel = null,
  onboardingServices,
  inquiryFormConfigOverride,
  plan = "free",
  startTrial = true,
  activitySource = "business-hub",
  activitySummary = "Business created.",
  now = new Date(),
}: CreateBusinessRecordForUserInput) {
  // Only the owner's first active business gets the automatic trial. Existing
  // owners can start it from billing for their current Free business instead.
  const ownedBusinessCount = await getOwnedBusinessCountForUser(user.id, tx);
  const autoStartTrial =
    startTrial &&
    plan === "free" &&
    ownedBusinessCount === 0 &&
    (await canStartBusinessTrial({ userId: user.id, client: tx }));
  const resolvedPlan: plan = autoStartTrial ? "pro" : plan;

  await assertBusinessQuotaAvailableForUser({
    tx,
    ownerUserId: user.id,
    plan: resolvedPlan,
  });

  const liveServiceLimit = getUsageLimit(
    resolvedPlan,
    "liveServicesPerBusiness",
  );
  const requestedServices =
    liveServiceLimit === null
      ? (onboardingServices ?? [])
      : (onboardingServices ?? []).slice(0, liveServiceLimit);

  const trimmedName = name.trim();
  const normalizedShortDescription = shortDescription?.trim() || null;
  const normalizedCustomerContactChannel =
    customerContactChannel?.trim() || null;

  // For backward compatibility: derive template from business type when workflow not provided
  const starterTemplate = getStarterTemplateDefinition(businessType);

  const baseSlug = preferredSlug?.trim() || slugifyPublicName(trimmedName, {
    fallback: "business",
  });

  const slugValidation = validateBusinessSlug(baseSlug);
  if (!slugValidation.valid) {
    throw new Error(slugValidation.error ?? "Invalid business slug.");
  }

  const slug = await getAvailableBusinessSlug(tx, baseSlug);
  const defaultService = createServicePreset({
    businessType,
    businessName: trimmedName,
    plan: resolvedPlan,
  });
  const resolvedServiceFormConfig =
    inquiryFormConfigOverride ??
    createInquiryFormConfigDefaults({ businessType, starterWorkflow });

  /**
   * The form config actually written to the default service row. This now
   * honors the starter workflow so the public page matches what the owner
   * picked (previously the row silently used the type-derived preset while
   * `businesses.inquiryFormConfig` was workflow-aware, so the Agent and
   * the public page disagreed for recurring/consultation businesses).
   */
  const defaultServiceFormConfig = inquiryFormConfigOverride ?? resolvedServiceFormConfig;

  await tx.insert(businesses).values({
    id: businessId,
    ownerUserId: user.id,
    name: trimmedName,
    slug,
    businessType,
    countryCode,
    shortDescription: normalizedShortDescription,
    customerContactChannel: normalizedCustomerContactChannel,
    contactEmail: user.email,
    inquiryFormConfig: resolvedServiceFormConfig,
    inquiryPageConfig: createInquiryPageConfigDefaults({
      businessName: trimmedName,
      businessType,
      plan: resolvedPlan,
    }),
    defaultQuoteNotes: starterTemplate.defaultQuoteNotes,
    defaultQuoteValidityDays: starterTemplate.defaultQuoteValidityDays,
    defaultCurrency,
    // Low-email deployments default optional operational email off while
    // keeping in-app notifications on. Owners can re-enable per business
    // once low-email mode is off. Explicit quote delivery is unaffected.
    ...(isLowEmailMode
      ? {
          sendInquiryAckEmail: false,
          notifyOnFollowUpReminder: false,
          analyticsDigestEnabled: false,
        }
      : {}),
    createdAt: now,
    updatedAt: now,
  });

  if (autoStartTrial) {
    const trial = await startBusinessTrial({
      businessId,
      userId: user.id,
      currency: defaultCurrency,
      client: tx,
      now,
    });

    // The eligibility check above should make failure impossible. Abort the
    // creation rather than leaving a business with Pro-shaped defaults but no
    // trial subscription if another request claimed the trial first.
    if (!trial.ok) {
      throw new Error(`Unable to start the business trial: ${trial.reason}`);
    }
  }

  // Behavior-pack assignment (verticalization F-01): derived from the stored
  // type via the single resolver choke point. Future-only config row — the
  // stored type and all existing records are untouched.
  await assignPackForNewBusiness(tx, {
    businessId,
    businessType,
    source: "onboarding",
    actorUserId: user.id,
    now,
  });

  // Recipe seed (F-02): packed businesses start on code-default v1 recipes.
  // Unpacked (secondary) businesses evaluate against code defaults read-only.
  const behaviorPack = getBehaviorPack(businessType);

  if (behaviorPack) {
    await seedRecipesForBusiness(tx, { businessId, pack: behaviorPack, now });
  }

  // One service per named entry; first wins the default slot and the bare
  // /inquire/{slug} URL. Names are pre-validated upstream (trim + length),
  // blank extras are dropped before this point.
  const namedServices = requestedServices
    .map((service) => service.name.trim())
    .filter((name) => name.length > 0)
    .map((name) => name.slice(0, 80));
  const firstServiceName = namedServices[0] ?? defaultService.name;

  await tx.insert(services).values({
    id: newEntityId(),
    businessId,
    name: firstServiceName,
    slug: defaultService.slug,
    businessType: defaultService.businessType,
    isDefault: true,
    publicInquiryEnabled: defaultService.publicInquiryEnabled,
    inquiryFormConfig: defaultServiceFormConfig,
    inquiryPageConfig: defaultService.inquiryPageConfig,
    createdAt: now,
    updatedAt: now,
  });

  for (const serviceName of namedServices.slice(1)) {
    const serviceSlug = await getAvailableOnboardingServiceSlug(
      tx,
      businessId,
      serviceName,
    );

    await tx.insert(services).values({
      id: newEntityId(),
      businessId,
      name: serviceName,
      slug: serviceSlug,
      businessType,
      isDefault: false,
      publicInquiryEnabled: true,
      inquiryFormConfig: createInquiryFormConfigDefaults({
        businessType,
        starterWorkflow,
      }),
      inquiryPageConfig: {
        ...createInquiryPageConfigDefaults({
          businessName: trimmedName,
          businessType,
          plan: resolvedPlan,
        }),
        formTitle: serviceName,
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  await tx.insert(businessMembers).values({
    id: newEntityId(),
    businessId,
    userId: user.id,
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });

  await tx.insert(activityLogs).values({
    id: newEntityId(),
    businessId,
    actorUserId: user.id,
    type: "business.created",
    summary: activitySummary,
    metadata: {
      source: activitySource,
    },
    createdAt: now,
    updatedAt: now,
  });

  await writeAuditLog(tx, {
    businessId,
    actorUserId: user.id,
    actorName: user.name,
    actorEmail: user.email,
    entityType: "business",
    entityId: businessId,
    action: "business.created",
    metadata: {
      businessName: trimmedName,
      businessSlug: slug,
      businessType,
      source: activitySource,
    },
    createdAt: now,
  });

  return {
    id: businessId,
    slug,
  };
}

export async function createBusinessForUser({
  businessId,
  defaultCurrency,
  user,
  name,
  preferredSlug,
  businessType,
  starterWorkflow,
  countryCode,
  shortDescription,
  customerContactChannel,
  onboardingServices,
  activitySource,
  activitySummary,
  plan,
  startTrial,
}: CreateBusinessForUserInput) {
  await ensureProfileForUser(user);

  return db.transaction(async (tx) =>
    createBusinessRecordForUser({
      tx,
      businessId,
      defaultCurrency,
      user,
      name,
      preferredSlug,
      businessType,
      starterWorkflow,
      countryCode,
      shortDescription,
      customerContactChannel,
      onboardingServices,
      activitySource,
      activitySummary,
      plan,
      startTrial,
    }),
  );
}

type BusinessLifecycleMutationInput = {
  businessId: string;
  actorUserId: string;
};

type TrashBusinessInput = BusinessLifecycleMutationInput & {
  confirmation: string | null;
};

type BusinessLifecycleResult =
  | {
      ok: true;
      businessSlug: string;
      nextState: BusinessRecordState;
    }
  | {
      ok: false;
      reason:
        | "not-found"
        | "confirmation-mismatch"
        | "already-active"
        | "already-archived"
        | "already-trash"
        | "trash-required"
        | "last-active";
    };

async function requireOwnerLifecycleMembership(
  businessId: string,
  actorUserId: string,
): Promise<boolean> {
  const [membership] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, actorUserId),
        eq(businessMembers.role, "owner"),
      ),
    )
    .limit(1);

  return Boolean(membership);
}

async function getBusinessLifecycleTarget(businessId: string) {
  const [business] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      businessId: businesses.id,
      businessSlug: businesses.slug,
      archivedAt: businesses.archivedAt,
      deletedAt: businesses.deletedAt,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  return business ?? null;
}

async function getActiveBusinessCountForOwner(ownerUserId: string) {
  const [row] = await db
    .select({
      value: count(),
    })
    .from(businesses)
    .innerJoin(
      businessMembers,
      and(
        eq(businessMembers.businessId, businesses.id),
        eq(businessMembers.userId, ownerUserId),
        eq(businessMembers.role, "owner"),
      ),
    )
    .where(
      and(
        isNull(businesses.archivedAt),
        isNull(businesses.deletedAt),
      ),
    );

  return Number(row?.value ?? 0);
}

export async function archiveBusiness({
  businessId,
  actorUserId,
}: BusinessLifecycleMutationInput): Promise<BusinessLifecycleResult> {
  if (!(await requireOwnerLifecycleMembership(businessId, actorUserId))) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const business = await getBusinessLifecycleTarget(businessId);

  if (!business) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  if (business.deletedAt) {
    return {
      ok: false,
      reason: "trash-required",
    };
  }

  if (business.archivedAt) {
    return {
      ok: false,
      reason: "already-archived",
    };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({
        archivedAt: now,
        archivedBy: actorUserId,
        deletedAt: null,
        deletedBy: null,
        updatedAt: now,
      })
      .where(eq(businesses.id, businessId));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.archived",
      summary: "Business archived.",
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog(tx, {
      businessId,
      actorUserId,
      entityType: "business",
      entityId: businessId,
      action: "business.archived",
      metadata: {
        businessName: business.name,
        businessSlug: business.slug,
      },
      createdAt: now,
    });
  });

  return {
    ok: true,
    businessSlug: business.slug,
    nextState: "archived",
  };
}

export async function unarchiveBusiness({
  businessId,
  actorUserId,
}: BusinessLifecycleMutationInput): Promise<BusinessLifecycleResult> {
  if (!(await requireOwnerLifecycleMembership(businessId, actorUserId))) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const business = await getBusinessLifecycleTarget(businessId);

  if (!business) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  if (business.deletedAt) {
    return {
      ok: false,
      reason: "trash-required",
    };
  }

  if (!business.archivedAt) {
    return {
      ok: false,
      reason: "already-active",
    };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({
        archivedAt: null,
        archivedBy: null,
        updatedAt: now,
      })
      .where(eq(businesses.id, businessId));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.restored",
      summary: "Business restored to active.",
      metadata: {
        from: "archived",
      },
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog(tx, {
      businessId,
      actorUserId,
      entityType: "business",
      entityId: businessId,
      action: "business.restored",
      metadata: {
        businessName: business.name,
        businessSlug: business.slug,
        from: "archived",
      },
      createdAt: now,
    });
  });

  return {
    ok: true,
    businessSlug: business.slug,
    nextState: "active",
  };
}

export async function trashBusiness({
  businessId,
  actorUserId,
  confirmation,
}: TrashBusinessInput): Promise<BusinessLifecycleResult> {
  if (!(await requireOwnerLifecycleMembership(businessId, actorUserId))) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const business = await getBusinessLifecycleTarget(businessId);

  if (!business) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  if (confirmation && confirmation.trim() !== business.name) {
    return {
      ok: false,
      reason: "confirmation-mismatch",
    };
  }

  if (business.deletedAt) {
    return {
      ok: false,
      reason: "already-trash",
    };
  }

  if (!business.archivedAt) {
    const activeBusinessCount =
      await getActiveBusinessCountForOwner(actorUserId);

    if (activeBusinessCount <= 1) {
      return {
        ok: false,
        reason: "last-active",
      };
    }
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({
        archivedAt: null,
        archivedBy: null,
        deletedAt: now,
        deletedBy: actorUserId,
        updatedAt: now,
      })
      .where(eq(businesses.id, businessId));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.trashed",
      summary: "Business moved to trash.",
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog(tx, {
      businessId,
      actorUserId,
      entityType: "business",
      entityId: businessId,
      action: "business.trashed",
      metadata: {
        businessName: business.name,
        businessSlug: business.slug,
      },
      createdAt: now,
    });
  });

  return {
    ok: true,
    businessSlug: business.slug,
    nextState: "trash",
  };
}

export async function restoreBusiness({
  businessId,
  actorUserId,
}: BusinessLifecycleMutationInput): Promise<BusinessLifecycleResult> {
  if (!(await requireOwnerLifecycleMembership(businessId, actorUserId))) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const business = await getBusinessLifecycleTarget(businessId);

  if (!business) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  if (!business.deletedAt) {
    return {
      ok: false,
      reason: "already-active",
    };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({
        archivedAt: null,
        archivedBy: null,
        deletedAt: null,
        deletedBy: null,
        updatedAt: now,
      })
      .where(eq(businesses.id, businessId));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.restored",
      summary: "Business restored from trash.",
      metadata: {
        from: "trash",
      },
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog(tx, {
      businessId,
      actorUserId,
      entityType: "business",
      entityId: businessId,
      action: "business.restored",
      metadata: {
        businessName: business.name,
        businessSlug: business.slug,
        from: "trash",
      },
      createdAt: now,
    });
  });

  return {
    ok: true,
    businessSlug: business.slug,
    nextState: "active",
  };
}

export async function deleteBusinessPermanently({
  businessId,
  actorUserId,
  confirmation,
}: {
  businessId: string;
  actorUserId: string;
  confirmation: string;
}): Promise<
  | { ok: true }
  | { ok: false; reason: "not-found" | "confirmation-mismatch" }
> {
  if (!(await requireOwnerLifecycleMembership(businessId, actorUserId))) {
    return { ok: false, reason: "not-found" };
  }

  const business = await getBusinessLifecycleTarget(businessId);

  if (!business) {
    return { ok: false, reason: "not-found" };
  }

  if (confirmation.trim().toLowerCase() !== business.name.trim().toLowerCase()) {
    return { ok: false, reason: "confirmation-mismatch" };
  }

  await db.delete(businesses).where(eq(businesses.id, businessId));

  return { ok: true };
}
