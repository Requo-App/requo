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
  updateTag: vi.fn(),
}));

import {
  archiveBusinessInquiryForm,
  createBusinessInquiryForm,
  deleteBusinessInquiryForm,
  setBusinessInquiryFormPublicState,
  setDefaultBusinessInquiryForm,
  unarchiveBusinessInquiryForm,
  updateBusinessInquiryFormSettings,
  updateBusinessInquiryPageSettings,
} from "@/features/settings/mutations";
import { businessInquiryPageSettingsSchema } from "@/features/settings/schemas";
import {
  createInquiryFormConfigDefaults,
  inquiryFormConfigSchema,
  type InquiryFormFieldDefinition,
} from "@/features/inquiries/form-config";
import {
  businessInquiryForms,
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
    .from(businessInquiryForms)
    .where(
      and(
        eq(businessInquiryForms.businessId, businessId),
        eq(businessInquiryForms.slug, slug),
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
    .select({ id: businessInquiryForms.id })
    .from(businessInquiryForms)
    .where(eq(businessInquiryForms.businessId, businessId));

  return rows.length;
}

async function listDefaultFormIds(businessId: string) {
  return testDb
    .select({ id: businessInquiryForms.id })
    .from(businessInquiryForms)
    .where(
      and(
        eq(businessInquiryForms.businessId, businessId),
        eq(businessInquiryForms.isDefault, true),
      ),
    );
}

function buildPageSettings(
  overrides: Record<string, unknown> = {},
) {
  return businessInquiryPageSettingsSchema.parse({
    name: "Workflow Form",
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

describe("service lifecycle mutations", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
    ACTOR_USER_ID = ids.ownerUserId;
    // The fixture business has no subscription row, so it resolves to the
    // free plan (one live service). Grant Pro so the lifecycle rules can be
    // exercised without the plan cap masking them.
    await grantPlan(ids.businessId, "pro");
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  describe("create", () => {
    it("creates a service that is not the default and has a unique slug", async () => {
      const result = await createBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Deck resurfacing", businessType: BUSINESS_TYPE },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const created = await getFormBySlug(ids.businessId, result.formSlug);
      expect(created).not.toBeNull();
      expect(created?.isDefault).toBe(false);
      expect(created?.archivedAt).toBeNull();
      expect(created?.publicInquiryEnabled).toBe(true);
    });

    it("gives a second service with the same name a distinct slug", async () => {
      const first = await createBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Deck resurfacing", businessType: BUSINESS_TYPE },
      });
      const second = await createBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Deck resurfacing", businessType: BUSINESS_TYPE },
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      expect(second.formSlug).not.toBe(first.formSlug);
    });

    it("refuses to exceed the plan's live-service allowance", async () => {
      // No subscription row means the free plan, which allows one live service.
      await revokePlan(ids.otherBusinessId);

      const result = await createBusinessInquiryForm({
        businessId: ids.otherBusinessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Second service", businessType: BUSINESS_TYPE },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("live-form-limit");
    });

    it("rejects a business that does not exist", async () => {
      const result = await createBusinessInquiryForm({
        businessId: "does-not-exist",
        actorUserId: ACTOR_USER_ID,
        values: { name: "Deck resurfacing", businessType: BUSINESS_TYPE },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("not-found");
    });
  });

  describe("the default service stays published", () => {
    it("refuses to unpublish the default service through the page action", async () => {
      const result = await updateBusinessInquiryPageSettings({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        formSlug: "workflow-form",
        values: buildPageSettings({ publicInquiryEnabled: "false" }),
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid-target");
    });

    it("refuses to unpublish the default service through the publish action", async () => {
      const result = await setBusinessInquiryFormPublicState({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: ids.formId,
        publicInquiryEnabled: false,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid-target");
    });

    it("refuses to make an unpublished service the default", async () => {
      const created = await createBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Draft service", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const formId = await getFormIdBySlug(ids.businessId, created.formSlug);
      expect(formId).not.toBeNull();

      const unpublished = await setBusinessInquiryFormPublicState({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: formId as string,
        publicInquiryEnabled: false,
      });
      expect(unpublished.ok).toBe(true);

      const result = await setDefaultBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: formId as string,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid-target");
    });
  });

  describe("default service bookkeeping", () => {
    it("leaves exactly one default service after switching", async () => {
      const created = await createBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Second service", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const formId = await getFormIdBySlug(ids.businessId, created.formSlug);
      expect(formId).not.toBeNull();

      const result = await setDefaultBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: formId as string,
      });

      expect(result.ok).toBe(true);

      const defaults = await listDefaultFormIds(ids.businessId);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(formId);
    });

    it("does not let one business change another business's default", async () => {
      const result = await setDefaultBusinessInquiryForm({
        businessId: ids.otherBusinessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: ids.formId,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("not-found");
    });
  });

  describe("archive and unarchive", () => {
    it("refuses to archive the default service", async () => {
      const result = await archiveBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: ids.formId,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("invalid-target");
    });

    it("refuses to archive the last active service", async () => {
      // The only active service is not the default, so the last-active guard
      // is the one that fires (the default guard would fire first).
      await testDb
        .update(businessInquiryForms)
        .set({ isDefault: false })
        .where(eq(businessInquiryForms.id, ids.otherFormId));

      const result = await archiveBusinessInquiryForm({
        businessId: ids.otherBusinessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: ids.otherFormId,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("last-active");
    });

    it("archives a non-default service and restores it", async () => {
      const created = await createBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Temporary service", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const formId = await getFormIdBySlug(ids.businessId, created.formSlug);
      expect(formId).not.toBeNull();

      const archived = await archiveBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: formId as string,
      });

      expect(archived.ok).toBe(true);

      const afterArchive = await getFormBySlug(ids.businessId, created.formSlug);
      expect(afterArchive?.archivedAt).not.toBeNull();

      const restored = await unarchiveBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: formId as string,
      });

      expect(restored.ok).toBe(true);

      const afterRestore = await getFormBySlug(ids.businessId, created.formSlug);
      expect(afterRestore?.archivedAt).toBeNull();
    });
  });

  describe("delete", () => {
    it("refuses to delete the last active service", async () => {
      const result = await deleteBusinessInquiryForm({
        businessId: ids.otherBusinessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: ids.otherFormId,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("last-active");
    });

    it("refuses to delete a service with linked inquiries", async () => {
      const created = await createBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Service with inquiries", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const formId = await getFormIdBySlug(ids.businessId, created.formSlug);
      expect(formId).not.toBeNull();

      await testDb
        .update(inquiries)
        .set({ businessInquiryFormId: formId })
        .where(eq(inquiries.id, ids.inquiryId));

      const result = await deleteBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: formId as string,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("has-inquiries");
    });

    it("promotes a published service when the default is deleted", async () => {
      const created = await createBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Replacement service", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      // The fixture default has linked inquiries, so detach them first.
      await testDb
        .update(inquiries)
        .set({ businessInquiryFormId: null })
        .where(
          eq(inquiries.businessId, ids.businessId),
        );

      const result = await deleteBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        targetFormId: ids.formId,
      });

      expect(result.ok).toBe(true);

      const defaults = await listDefaultFormIds(ids.businessId);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(
        await getFormIdBySlug(ids.businessId, created.formSlug),
      );
    });
  });

  describe("business scoping", () => {
    it("does not update a service that belongs to another business", async () => {
      const created = await createBusinessInquiryForm({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        values: { name: "Scoped update", businessType: BUSINESS_TYPE },
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const before = await getFormBySlug(ids.businessId, created.formSlug);

      // The same slug does not exist in the other business.
      const result = await updateBusinessInquiryFormSettings({
        businessId: ids.otherBusinessId,
        actorUserId: ACTOR_USER_ID,
        formSlug: created.formSlug,
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

      const after = await getFormBySlug(ids.businessId, created.formSlug);
      expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
    });

    it("keeps the service count of a business scoped to that business", async () => {
      const before = await countForms(ids.businessId);
      const otherBefore = await countForms(ids.otherBusinessId);

      await createBusinessInquiryForm({
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

      const result = await updateBusinessInquiryFormSettings({
        businessId: ids.businessId,
        actorUserId: ACTOR_USER_ID,
        formSlug: "workflow-form",
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
