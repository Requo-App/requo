import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * DB-backed regression tests for the service (business inquiry form) lifecycle.
 *
 * Covers the rules the service mutations enforce on the server: the plan's
 * live-service allowance, the "the default service stays published" invariant,
 * the "one default service per business" invariant, the last-active-service
 * guard, and business scoping on every write.
 */

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

const authState = vi.hoisted(() => ({ userId: "", businessSlug: "" }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: authState.userId }),
  getOptionalSession: async () => ({ user: { id: authState.userId } }),
}));

vi.mock("next/headers", async () => {
  const { activeBusinessSlugCookieName } = await import("@/features/businesses/routes");

  return {
    cookies: async () => ({
      get: (name: string) => name === activeBusinessSlugCookieName
        ? { name, value: authState.businessSlug }
        : undefined,
    }),
  };
});

vi.mock("next/server", () => ({ after: vi.fn() }));

import {
  deleteServiceAction,
  updateServicePageAction,
} from "@/features/settings/actions";

import {
  archiveService,
  createService,
  deleteService,
  duplicateService,
  setServicePublicState,
  setDefaultService,
  unarchiveService,
  updateServiceSettings,
  updateServicePageSettings,
} from "@/features/settings/mutations";
import { servicePageSettingsSchema } from "@/features/settings/schemas";
import {
  createInquiryFormConfigDefaults,
  inquiryFormConfigSchema,
  type InquiryFormFieldDefinition,
} from "@/features/inquiries/form-config";
import {
  services,
  businessSubscriptions,
  inquiries,
} from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const prefix = derivePerFilePrefix(__filename);
let ids: WorkflowFixtureIds;

let ACTOR_USER_ID = "";
const BUSINESS_TYPE = "general_project_services" as const;

/**
 * `businesses.plan` is only a denormalized read cache — the effective plan
 * resolves through `business_subscriptions` and fails closed to `free` when no
 * row exists. Granting a plan therefore means writing a subscription row.
 */
async function grantPlan(
  businessId: string,
  plan: "pro" | "business",
) {
  await testDb
    .delete(businessSubscriptions)
    .where(eq(businessSubscriptions.businessId, businessId));

  await testDb.insert(businessSubscriptions).values({
    id: `${prefix}_subscription_${businessId}`,
    businessId,
    status: "active",
    plan,
    billingProvider: "polar",
    billingCurrency: "USD",
  });
}

async function revokePlan(businessId: string) {
  await testDb
    .delete(businessSubscriptions)
    .where(eq(businessSubscriptions.businessId, businessId));
}

async function getFormBySlug(businessId: string, slug: string) {
  const [row] = await testDb
    .select()
    .from(services)
    .where(
      and(
        eq(services.businessId, businessId),
        eq(services.slug, slug),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function getFormIdBySlug(businessId: string, slug: string) {
  const form = await getFormBySlug(businessId, slug);

  return form?.id ?? null;
}

async function countForms(businessId: string) {
  const rows = await testDb
    .select({ id: services.id })
    .from(services)
    .where(eq(services.businessId, businessId));

  return rows.length;
}

async function listDefaultFormIds(businessId: string) {
  return testDb
    .select({ id: services.id })
    .from(services)
    .where(
      and(
        eq(services.businessId, businessId),
        eq(services.isDefault, true),
      ),
    );
}

function buildPageSettings(
  overrides: Record<string, unknown> = {},
) {
  return servicePageSettingsSchema.parse({
    name: "Workflow Service",
    slug: "workflow-form",
    businessType: BUSINESS_TYPE,
    publicInquiryEnabled: "true",
    template: "no_supporting_cards",
    mobileLayout: "full",
    showSupportingCards: "false",
    showShowcaseImage: "false",
    showBusinessContact: "true",
    eyebrow: "",
    headline: "Tell us about your project",
    description: "",
    brandTagline: "",
    formTitle: "Request",
    formDescription: "",
    thankYouMessage: "",
    businessContactPhone: "",
    businessContactEmail: "",
    businessFacebookUrl: "",
    businessInstagramUrl: "",
    businessTwitterXUrl: "",
    businessLinkedinUrl: "",
    showcaseImageUrl: "",
    showcaseImageFrame: "landscape",
    showcaseImageSize: "standard",
    showcaseImageCropX: "0",
    showcaseImageCropY: "0",
    showcaseImageCropZoom: "1",
    cards: "[]",
    ...overrides,
  });
}

function buildPageFormData(overrides: Record<string, unknown> = {}) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(buildPageSettings(overrides))) {
    formData.set(key, typeof value === "object" ? JSON.stringify(value) : String(value ?? ""));
  }

  return formData;
}

describe("service lifecycle mutations", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
    ACTOR_USER_ID = ids.ownerUserId;
    authState.userId = ids.ownerUserId;
    authState.businessSlug = ids.businessSlug;
    // The fixture business has no subscription row, so it resolves to the
    // free plan (two live services). Grant Pro so the lifecycle rules can be
    // exercised without the plan cap masking them.
    await grantPlan(ids.businessId, "pro");
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  describe("create", () => {
    it("creates a service that is not the default and has a unique slug", async () => {
      const result = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Deck resurfacing", businessType: BUSINESS_TYPE },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const created = await getFormBySlug(ids.businessId, result.serviceSlug);
      expect(created).not.toBeNull();
      expect(created?.isDefault).toBe(false);
      expect(created?.archivedAt).toBeNull();
      expect(created?.publicInquiryEnabled).toBe(true);
    });

    it("gives a second service with the same name a distinct slug", async () => {
      const first = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Deck resurfacing", businessType: BUSINESS_TYPE },
      });
      const second = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Deck resurfacing", businessType: BUSINESS_TYPE },
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      expect(second.serviceSlug).not.toBe(first.serviceSlug);
    });

    it("refuses to exceed the plan's live-service allowance", async () => {
      // No subscription row means the Free plan, which allows two live
      // services. The fixture already has one.
      await revokePlan(ids.otherBusinessId);

      const second = await createService({
        businessId: ids.otherBusinessId,
        actorUserId: ids.outsiderUserId,
        values: { name: "Second service", businessType: BUSINESS_TYPE },
      });
      expect(second.ok).toBe(true);

      const result = await createService({
        businessId: ids.otherBusinessId,
        actorUserId: ids.outsiderUserId,
        values: { name: "Third service", businessType: BUSINESS_TYPE },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("live-form-limit");
    });

    it("rejects a business that does not exist", async () => {
      const result = await createService({
        businessId: "does-not-exist",
        actorUserId: ACTOR_USER_ID,
        values: { name: "Deck resurfacing", businessType: BUSINESS_TYPE },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("not-found");
    });
  });

  describe("page publication", () => {
    it.each([true, false])("preserves a manager's stored publication state (%s)", async (published) => {
      await testDb.update(services)
        .set({ isDefault: false, publicInquiryEnabled: published })
        .where(eq(services.id, ids.serviceId));
      authState.userId = ids.managerUserId;

      const result = await updateServicePageAction("workflow-form", {}, buildPageFormData({
        publicInquiryEnabled: String(!published),
        headline: "Manager's updated headline",
      }));

      expect(result.success).toBe("Service page saved.");
      const saved = await getFormBySlug(ids.businessId, "workflow-form");
      expect(saved?.publicInquiryEnabled).toBe(published);
      expect(saved?.inquiryPageConfig.headline).toBe("Manager's updated headline");
    });

    it.each([true, false])("allows an owner to change publication from %s", async (published) => {
      await testDb.update(services)
        .set({ isDefault: false, publicInquiryEnabled: published })
        .where(eq(services.id, ids.serviceId));

      const result = await updateServicePageAction("workflow-form", {}, buildPageFormData({
        publicInquiryEnabled: String(!published),
      }));

      expect(result.success).toBe("Service page saved.");
      expect((await getFormBySlug(ids.businessId, "workflow-form"))?.publicInquiryEnabled).toBe(!published);
    });

    it("allows editing a published service after a downgrade below current usage", async () => {
      const created = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Second live service", businessType: BUSINESS_TYPE },
      });
      expect(created.ok).toBe(true);
      await revokePlan(ids.businessId);

      const result = await updateServicePageSettings({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        serviceSlug: "workflow-form",
        values: buildPageSettings({ headline: "Updated after downgrade" }),
      });

      expect(result.ok).toBe(true);
      expect((await getFormBySlug(ids.businessId, "workflow-form"))?.inquiryPageConfig.headline).toBe("Updated after downgrade");
    });

    it("enforces the live-service allowance when an owner publishes a draft through page save", async () => {
      const live = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Second live service", businessType: BUSINESS_TYPE },
      });
      expect(live.ok).toBe(true);

      const created = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Draft service", businessType: BUSINESS_TYPE },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      await testDb.update(services)
        .set({ publicInquiryEnabled: false })
        .where(eq(services.slug, created.serviceSlug));
      // Free keeps both live services (the default plus `live`) and has no
      // slot for publishing the third.
      await revokePlan(ids.businessId);

      const result = await updateServicePageAction(created.serviceSlug, {}, buildPageFormData({
        name: "Draft service",
        slug: created.serviceSlug,
      }));

      expect(result.error).toContain("This plan supports 2 live services");
      expect((await getFormBySlug(ids.businessId, created.serviceSlug))?.publicInquiryEnabled).toBe(false);
    });
  });

  describe("duplicate", () => {
    it("refuses to duplicate when the free plan's live-service slots are full", async () => {
      const second = await createService({
        businessId: ids.otherBusinessId,
        actorUserId: ids.outsiderUserId,
        values: { name: "Second service", businessType: BUSINESS_TYPE },
      });
      expect(second.ok).toBe(true);

      const before = await countForms(ids.otherBusinessId);
      const result = await duplicateService({
        businessId: ids.otherBusinessId,
        actorUserId: ids.outsiderUserId,
        targetServiceId: ids.otherServiceId,
      });

      expect(result).toEqual({ ok: false, reason: "live-form-limit" });
      expect(await countForms(ids.otherBusinessId)).toBe(before);
    });

    it("can duplicate a draft when the live-service allowance is full", async () => {
      await testDb.update(services)
        .set({ isDefault: false, publicInquiryEnabled: false })
        .where(eq(services.id, ids.serviceId));
      const live = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Live service", businessType: BUSINESS_TYPE },
      });
      expect(live.ok).toBe(true);
      await revokePlan(ids.businessId);

      const result = await duplicateService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: ids.serviceId,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect((await getFormBySlug(ids.businessId, result.serviceSlug))?.publicInquiryEnabled).toBe(false);
    });
  });

  describe("the default service stays published", () => {
    it("refuses to unpublish the default service through the page action", async () => {
      const result = await updateServicePageSettings({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        serviceSlug: "workflow-form",
        values: buildPageSettings({ publicInquiryEnabled: "false" }),
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid-target");
    });

    it("refuses to unpublish the default service through the publish action", async () => {
      const result = await setServicePublicState({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: ids.serviceId,
        publicInquiryEnabled: false,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid-target");
    });

    it("refuses to make an unpublished service the default", async () => {
      const created = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Draft service", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const serviceId = await getFormIdBySlug(ids.businessId, created.serviceSlug);
      expect(serviceId).not.toBeNull();

      const unpublished = await setServicePublicState({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: serviceId as string,
        publicInquiryEnabled: false,
      });
      expect(unpublished.ok).toBe(true);

      const result = await setDefaultService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: serviceId as string,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid-target");
    });
  });

  describe("default service bookkeeping", () => {
    it("leaves exactly one default service after switching", async () => {
      const created = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Second service", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const serviceId = await getFormIdBySlug(ids.businessId, created.serviceSlug);
      expect(serviceId).not.toBeNull();

      const result = await setDefaultService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: serviceId as string,
      });

      expect(result.ok).toBe(true);

      const defaults = await listDefaultFormIds(ids.businessId);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(serviceId);
    });

    it("does not let one business change another business's default", async () => {
      const result = await setDefaultService({
        businessId: ids.otherBusinessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: ids.serviceId,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("not-found");
    });
  });

  describe("archive and unarchive", () => {
    it("refuses to archive the default service", async () => {
      const result = await archiveService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: ids.serviceId,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid-target");
    });

    it("refuses to archive the last active service", async () => {
      // The only active service is not the default, so the last-active guard
      // is the one that fires (the default guard would fire first).
      await testDb
        .update(services)
        .set({ isDefault: false })
        .where(eq(services.id, ids.otherServiceId));

      const result = await archiveService({
        businessId: ids.otherBusinessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: ids.otherServiceId,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("last-active");
    });

    it("archives a non-default service and restores it", async () => {
      const created = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Temporary service", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const serviceId = await getFormIdBySlug(ids.businessId, created.serviceSlug);
      expect(serviceId).not.toBeNull();

      const archived = await archiveService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: serviceId as string,
      });

      expect(archived.ok).toBe(true);

      const afterArchive = await getFormBySlug(ids.businessId, created.serviceSlug);
      expect(afterArchive?.archivedAt).not.toBeNull();

      const restored = await unarchiveService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: serviceId as string,
      });

      expect(restored.ok).toBe(true);

      const afterRestore = await getFormBySlug(ids.businessId, created.serviceSlug);
      expect(afterRestore?.archivedAt).toBeNull();
    });
  });

  describe("delete", () => {
    it("deletes an archived service when only one active service remains", async () => {
      const created = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Archived service", businessType: BUSINESS_TYPE },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const targetServiceId = (await getFormIdBySlug(ids.businessId, created.serviceSlug))!;
      const archived = await archiveService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId,
      });
      expect(archived.ok).toBe(true);

      const result = await deleteService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId,
      });

      expect(result.ok).toBe(true);
      expect(await getFormBySlug(ids.businessId, created.serviceSlug)).toBeNull();
      expect(await listDefaultFormIds(ids.businessId)).toEqual([{ id: ids.serviceId }]);
    });

    it("preserves the default and asks for a published replacement when only drafts remain", async () => {
      const created = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Draft replacement", businessType: BUSINESS_TYPE },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      await testDb.update(services)
        .set({ publicInquiryEnabled: false })
        .where(and(eq(services.businessId, ids.businessId), eq(services.slug, created.serviceSlug)));
      await testDb.update(inquiries).set({ serviceId: null })
        .where(eq(inquiries.businessId, ids.businessId));
      const before = await getFormBySlug(ids.businessId, "workflow-form");

      const result = await deleteService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: ids.serviceId,
      });
      expect(result).toEqual({ ok: false, reason: "invalid-target" });

      const formData = new FormData();
      formData.set("targetServiceId", ids.serviceId);
      const actionResult = await deleteServiceAction({}, formData);
      expect(actionResult.error).toBe("Publish another service before deleting the default service.");
      expect(await getFormBySlug(ids.businessId, "workflow-form")).toEqual(before);
      expect(await listDefaultFormIds(ids.businessId)).toEqual([{ id: ids.serviceId }]);
    });

    it("refuses to delete the last active service", async () => {
      const result = await deleteService({
        businessId: ids.otherBusinessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: ids.otherServiceId,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("last-active");
    });

    it("refuses to delete a service with linked inquiries", async () => {
      const created = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Service with inquiries", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const serviceId = await getFormIdBySlug(ids.businessId, created.serviceSlug);
      expect(serviceId).not.toBeNull();

      await testDb
        .update(inquiries)
        .set({ serviceId: serviceId })
        .where(eq(inquiries.id, ids.inquiryId));

      const result = await deleteService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: serviceId as string,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("has-inquiries");
    });

    it("promotes a published service when the default is deleted", async () => {
      const created = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Replacement service", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      // The fixture default has linked inquiries, so detach them first.
      await testDb
        .update(inquiries)
        .set({ serviceId: null })
        .where(
          eq(inquiries.businessId, ids.businessId),
        );

      const result = await deleteService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetServiceId: ids.serviceId,
      });

      expect(result.ok).toBe(true);

      const defaults = await listDefaultFormIds(ids.businessId);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(
        await getFormIdBySlug(ids.businessId, created.serviceSlug),
      );
    });
  });

  describe("business scoping", () => {
    it("does not update a service that belongs to another business", async () => {
      const created = await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Scoped update", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const before = await getFormBySlug(ids.businessId, created.serviceSlug);

      // The same slug does not exist in the other business.
      const result = await updateServiceSettings({
        businessId: ids.otherBusinessId,
        actorUserId: ACTOR_USER_ID,
        serviceSlug: created.serviceSlug,
        values: {
          businessType: BUSINESS_TYPE,
          inquiryFormConfig: inquiryFormConfigSchema.parse(
            createInquiryFormConfigDefaults({
              businessType: BUSINESS_TYPE,
            }),
          ),
        },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("not-found");

      const after = await getFormBySlug(ids.businessId, created.serviceSlug);
      expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
    });

    it("keeps the service count of a business scoped to that business", async () => {
      const before = await countForms(ids.businessId);
      const otherBefore = await countForms(ids.otherBusinessId);

      await createService({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Scoped service", businessType: BUSINESS_TYPE },
      });

      expect(await countForms(ids.businessId)).toBe(before + 1);
      expect(await countForms(ids.otherBusinessId)).toBe(otherBefore);
    });
  });

  describe("custom field limit", () => {
    it("drops custom fields beyond the plan allowance when saving the intake form", async () => {
      await revokePlan(ids.businessId);

      const config = createInquiryFormConfigDefaults({
        businessType: BUSINESS_TYPE,
      });
      const customFields: InquiryFormFieldDefinition[] = Array.from(
        { length: 8 },
        (_, index) => ({
          kind: "custom",
          id: `custom-${index}`,
          fieldType: "short_text",
          label: `Field ${index}`,
          required: false,
          placeholder: "",
        }),
      );
      const withCustomFields = inquiryFormConfigSchema.parse({
        ...config,
        projectFields: [...config.projectFields, ...customFields],
      });

      const result = await updateServiceSettings({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        serviceSlug: "workflow-form",
        values: {
          businessType: BUSINESS_TYPE,
          inquiryFormConfig: withCustomFields,
        },
      });

      expect(result.ok).toBe(true);

      const stored = await getFormBySlug(ids.businessId, "workflow-form");
      const storedConfig = stored?.inquiryFormConfig as {
        projectFields: Array<{ kind: string }>;
      };
      const customFieldCount = storedConfig.projectFields.filter(
        (field) => field.kind === "custom",
      ).length;

      expect(customFieldCount).toBeLessThanOrEqual(3);
    });
  });
});
