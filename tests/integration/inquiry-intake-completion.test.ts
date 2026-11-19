import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

import { createBusinessForUser } from "@/features/businesses/mutations";
import {
  evaluateIntakeReadiness,
  getCriticalIntakeFieldLabelsForBusiness,
  listCriticalIntakeGaps,
} from "@/features/businesses/intake-bindings";
import {
  getRecipeCriticalFieldId,
  getRecipeCriticalFieldIdForLabel,
} from "@/features/inquiries/form-config";
import { completeInquiryIntakeFieldsForBusiness } from "@/features/inquiries/mutations";
import {
  activityLogs,
  auditLogs,
  businessMembers,
  businessPackAssignmentHistory,
  businessPackAssignments,
  businesses,
  inquiries,
  packRecipes,
  profiles,
  user,
} from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";

import { closeTestDb, testDb } from "@/tests/support/db";

const prefix = "test_intake_completion";
const now = new Date("2026-06-10T00:00:00.000Z");

function slug(value: string) {
  return value.replace(/_/g, "-");
}

async function cleanup() {
  await testDb.delete(activityLogs).where(like(activityLogs.businessId, `${prefix}%`));
  await testDb.delete(auditLogs).where(like(auditLogs.businessId, `${prefix}%`));
  await testDb.delete(inquiries).where(like(inquiries.businessId, `${prefix}%`));
  await testDb.delete(packRecipes).where(like(packRecipes.businessId, `${prefix}%`));
  await testDb
    .delete(businessPackAssignmentHistory)
    .where(like(businessPackAssignmentHistory.businessId, `${prefix}%`));
  await testDb
    .delete(businessPackAssignments)
    .where(like(businessPackAssignments.businessId, `${prefix}%`));
  await testDb.delete(businessMembers).where(like(businessMembers.userId, `${prefix}%`));
  await testDb.delete(businesses).where(like(businesses.ownerUserId, `${prefix}%`));
  await testDb.delete(profiles).where(like(profiles.userId, `${prefix}%`));
  await testDb.delete(user).where(like(user.id, `${prefix}%`));
}

async function setupBusiness(suffix: string) {
  const userId = `${prefix}_owner_${suffix}`;
  const name = `${prefix}_biz_${suffix}`;

  await testDb.insert(user).values({
    id: userId,
    name: "Intake Owner",
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });

  await createBusinessForUser({
    user: { id: userId, name: "Intake Owner", email: `${userId}@example.com` },
    businessId: slug(name),
    defaultCurrency: "USD",
    name,
    businessType: "contractor_home_improvement",
    plan: "free",
    startTrial: false,
  });

  return { userId, businessId: slug(name) };
}

async function createInquiry(businessId: string) {
  const id = newEntityId();

  await testDb.insert(inquiries).values({
    id,
    businessId,
    status: "new",
    customerName: "Pat Morgan",
    customerEmail: "pat@example.com",
    customerContactMethod: "email",
    customerContactHandle: "pat@example.com",
    details: "Retile the shower",
    submittedFieldSnapshot: {
      version: 1,
      businessType: "contractor_home_improvement",
      fields: [
        {
          id: "details",
          label: "Project details",
          value: "Retile the shower",
          displayValue: "Retile the shower",
          fieldKind: "system",
        },
      ],
    },
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

describe("historical inquiry intake completion", () => {
  beforeEach(async () => {
    await cleanup();
  }, 30_000);

  afterAll(async () => {
    await cleanup();
    await closeTestDb();
  }, 30_000);

  it("collects a missing recipe-critical value without bypassing readiness", async () => {
    const { userId, businessId } = await setupBusiness("r1");
    const inquiryId = await createInquiry(businessId);

    expect(
      await getCriticalIntakeFieldLabelsForBusiness({
        businessId,
        businessType: "contractor_home_improvement",
      }),
    ).toContain("Service location");

    const gaps = await listCriticalIntakeGaps({ businessId, inquiryId });
    expect(gaps).toContainEqual({
      fieldId: getRecipeCriticalFieldIdForLabel("Service location"),
      label: "Service location",
      reason: "missing",
    });

    const before = await evaluateIntakeReadiness({ businessId, inquiryId });
    expect(before.ready).toBe(false);

    // Keys outside the resolved gap set are ignored.
    const ignored = await completeInquiryIntakeFieldsForBusiness({
      businessId,
      inquiryId,
      actorUserId: userId,
      values: { "not-a-real-field": "hijacked" },
    });
    expect(ignored).toMatchObject({ updated: false });

    const updated = await completeInquiryIntakeFieldsForBusiness({
      businessId,
      inquiryId,
      actorUserId: userId,
      values: {
        [getRecipeCriticalFieldIdForLabel("Service location")]: "12 Rose St",
      },
    });
    expect(updated).toMatchObject({
      updated: true,
      updatedFields: ["Service location"],
    });

    const [persisted] = await testDb
      .select({ snapshot: inquiries.submittedFieldSnapshot })
      .from(inquiries)
      .where(eq(inquiries.id, inquiryId))
      .limit(1);

    expect(
      persisted?.snapshot?.fields.find(
        (field) => field.id === getRecipeCriticalFieldIdForLabel("Service location"),
      ),
    ).toMatchObject({
      label: "Service location",
      value: "12 Rose St",
      displayValue: "12 Rose St",
    });

    const after = await evaluateIntakeReadiness({ businessId, inquiryId });
    expect(after.ready).toBe(true);

    const activities = await testDb
      .select({ type: activityLogs.type })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.businessId, businessId),
          eq(activityLogs.inquiryId, inquiryId),
        ),
      );
    expect(activities.map((row) => row.type)).toContain(
      "inquiry.intake_completed",
    );
  }, 30_000);

  it("still matches snapshots written with the legacy critical-field id", async () => {
    const { businessId } = await setupBusiness("legacy");
    const inquiryId = newEntityId();

    await testDb.insert(inquiries).values({
      id: inquiryId,
      businessId,
      status: "new",
      customerName: "Pat Morgan",
      customerEmail: "pat@example.com",
      customerContactMethod: "email",
      customerContactHandle: "pat@example.com",
      details: "Retile the shower",
      submittedFieldSnapshot: {
        version: 1,
        businessType: "contractor_home_improvement",
        fields: [
          {
            id: "details",
            label: "Project details",
            value: "Retile the shower",
            displayValue: "Retile the shower",
            fieldKind: "system",
          },
          {
            // Snapshot written before ids gained a label hash suffix.
            id: getRecipeCriticalFieldId("Service location"),
            label: "Service location",
            value: "12 Rose St",
            displayValue: "12 Rose St",
            fieldKind: "custom",
          },
        ],
      },
      createdAt: now,
      updatedAt: now,
    });

    expect(
      await listCriticalIntakeGaps({ businessId, inquiryId }),
    ).toEqual([]);
    expect(
      await evaluateIntakeReadiness({ businessId, inquiryId }),
    ).toMatchObject({ ready: true });
  }, 30_000);

  it("does not update another business's inquiry", async () => {
    const first = await setupBusiness("r2a");
    const second = await setupBusiness("r2b");
    const inquiryId = await createInquiry(first.businessId);
    const gaps = await listCriticalIntakeGaps({
      businessId: first.businessId,
      inquiryId,
    });

    const result = await completeInquiryIntakeFieldsForBusiness({
      businessId: second.businessId,
      inquiryId,
      actorUserId: second.userId,
      values: {
        [gaps[0]?.fieldId ?? "missing"]: "12 Rose St",
      },
    });

    expect(result).toMatchObject({ updated: false, updatedFields: [] });

    const [persisted] = await testDb
      .select({ snapshot: inquiries.submittedFieldSnapshot, details: inquiries.details })
      .from(inquiries)
      .where(eq(inquiries.id, inquiryId))
      .limit(1);

    expect(persisted?.details).toBe("Retile the shower");
    expect(
      persisted?.snapshot?.fields.some(
        (field) => field.id === getRecipeCriticalFieldIdForLabel("Service location"),
      ),
    ).toBe(false);

    const activities = await testDb
      .select({ id: activityLogs.id })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.businessId, second.businessId),
          eq(activityLogs.inquiryId, inquiryId),
        ),
      );
    expect(activities).toHaveLength(0);
  }, 30_000);
});
