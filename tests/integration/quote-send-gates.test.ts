import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

import { createBusinessForUser } from "@/features/businesses/mutations";
import { evaluateIntakeReadiness, getPackFollowUpHint } from "@/features/businesses/intake-bindings";
import {
  createQuoteForBusiness,
  markQuoteSentForBusiness,
} from "@/features/quotes/mutations";
import type { QuoteEditorInput } from "@/features/quotes/schemas";
import {
  auditLogs,
  businessMembers,
  businessPackAssignmentHistory,
  businessPackAssignments,
  businesses,
  inquiries,
  packRecipes,
  profiles,
  quoteItems,
  quotes,
  user,
} from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";

import { closeTestDb, testDb } from "@/tests/support/db";

const prefix = "test_send_gates";
const now = new Date("2026-05-07T00:00:00.000Z");

function slug(value: string) {
  return value.replace(/_/g, "-");
}

function quoteInput(): QuoteEditorInput {
  return {
    title: "Bathroom refresh",
    customerName: "Pat Morgan",
    customerEmail: "pat@example.com",
    customerContactMethod: "email",
    customerContactHandle: "pat@example.com",
    validUntil: "2099-12-31",
    discountInCents: 0,
    taxInCents: 0,
    items: [{ id: "line-1", description: "Tile work", quantity: 1, unitPriceInCents: 8000 }],
  };
}

async function cleanup() {
  await testDb.delete(quoteItems).where(like(quoteItems.businessId, `${prefix}%`));
  await testDb.delete(quotes).where(like(quotes.businessId, `${prefix}%`));
  await testDb.delete(inquiries).where(like(inquiries.businessId, `${prefix}%`));
  await testDb.delete(auditLogs).where(like(auditLogs.businessId, `${prefix}%`));
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

async function setupPackedBusiness(suffix: string) {
  const userId = `${prefix}_owner_${suffix}`;
  const name = `${prefix}_biz_${suffix}`;

  await testDb.insert(user).values({
    id: userId,
    name: "Gate Owner",
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });

  await createBusinessForUser({
    user: { id: userId, name: "Gate Owner", email: `${userId}@example.com` },
    businessId: slug(name),
    defaultCurrency: "USD",
    name,
    businessType: "contractor_home_improvement",
    plan: "free",
  });

  return { userId, businessId: slug(name) };
}

async function createInquiry(
  businessId: string,
  _suffix: string,
  fields: Array<{ id: string; label: string; value: string | null }>,
) {
  const id = newEntityId();

  await testDb.insert(inquiries).values({
    id,
    businessId,
    status: "new",
    customerName: "Pat Morgan",
    customerEmail: "pat@example.com",
    customerContactMethod: "email",
    customerContactHandle: "pat@example.com",
    details: "Bathroom refresh",
    submittedFieldSnapshot: {
      version: 1,
      businessType: "contractor_home_improvement",
      fields: fields.map((field) => ({
        ...field,
        displayValue: field.value ?? "",
      })),
    },
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

describe("send gates", () => {
  beforeEach(async () => {
    await cleanup();
  }, 30_000);

  afterAll(async () => {
    await cleanup();
    await closeTestDb();
  }, 30_000);

  it("blocks sending when critical intake fields are missing, passes when present", async () => {
    const { userId, businessId } = await setupPackedBusiness("r1");

    const thinInquiryId = await createInquiry(businessId, "thin", [
      { id: "f1", label: "Project details", value: "Retile the shower" },
    ]);

    const readiness = await evaluateIntakeReadiness({ businessId, inquiryId: thinInquiryId });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockedReasons.some((reason) => reason.includes("Service location"))).toBe(true);

    const thinQuote = await createQuoteForBusiness({
      businessId,
      actorUserId: userId,
      currency: "USD",
      inquiryId: thinInquiryId,
      quote: quoteInput(),
    });

    const blocked = await markQuoteSentForBusiness({
      businessId,
      quoteId: thinQuote!.id,
      actorUserId: userId,
      sendMethod: "manual",
    });

    expect(blocked).toMatchObject({ changed: false, blocked: true });

    const fullInquiryId = await createInquiry(businessId, "full", [
      { id: "f1", label: "Project details", value: "Retile the shower" },
      { id: "f2", label: "Service location", value: "12 Rose St" },
    ]);

    const ready = await evaluateIntakeReadiness({ businessId, inquiryId: fullInquiryId });
    expect(ready.ready).toBe(true);

    const fullQuote = await createQuoteForBusiness({
      businessId,
      actorUserId: userId,
      currency: "USD",
      inquiryId: fullInquiryId,
      quote: quoteInput(),
    });

    // Scope recipe still requires exclusions/allowances/assumptions.
    const { upsertScopeBlockForQuote } = await import("@/features/scope-blocks/mutations");
    for (const [kind, content] of [
      ["exclusions", { items: [{ label: "Permits" }] }],
      ["allowances", { items: [{ label: "Tile", amountCents: 5000 }] }],
      ["assumptions", { items: [{ label: "Access provided" }] }],
    ] as const) {
      await upsertScopeBlockForQuote({
        businessId,
        quoteId: fullQuote!.id,
        kind,
        content,
        actorUserId: userId,
      });
    }

    const sent = await markQuoteSentForBusiness({
      businessId,
      quoteId: fullQuote!.id,
      actorUserId: userId,
      sendMethod: "manual",
    });

    expect(sent?.changed).toBe(true);
  }, 30_000);

  it("fails closed on unknown binding versions", async () => {
    const { businessId } = await setupPackedBusiness("r2");

    const inquiryId = await createInquiry(businessId, "x", [
      { id: "f1", label: "Project details", value: "x" },
      { id: "f2", label: "Service location", value: "y" },
    ]);

    // Corrupt the active intake recipe with an unknown binding kind.
    const { newEntityId: freshId } = await import("@/lib/ids");
    await testDb
      .update(packRecipes)
      .set({ active: false })
      .where(eq(packRecipes.businessId, businessId));

    await testDb.insert(packRecipes).values({
      id: freshId(),
      businessId,
      pack: "contractors_home_services",
      kind: "intake",
      version: 2,
      active: true,
      config: {
        version: 1,
        criticalFields: [
          { label: "Project details", criticality: "critical", behaviors: ["readiness", "teleport"] },
        ],
      },
      effectiveAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const readiness = await evaluateIntakeReadiness({ businessId, inquiryId });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockedReasons.some((reason) => reason.includes("teleport"))).toBe(true);
  }, 30_000);

  it("blocks sending a quote whose validity date has already passed", async () => {
    const { userId, businessId } = await setupPackedBusiness("r5");

    const quote = await createQuoteForBusiness({
      businessId,
      actorUserId: userId,
      currency: "USD",
      inquiryId: null,
      quote: { ...quoteInput(), validUntil: "2000-01-01" },
    });

    const blocked = await markQuoteSentForBusiness({
      businessId,
      quoteId: quote!.id,
      actorUserId: userId,
      sendMethod: "manual",
    });

    expect(blocked).toMatchObject({ changed: false, blocked: true });
    expect(
      (blocked as { blockers: string[] }).blockers.some((reason) =>
        reason.includes("validity date"),
      ),
    ).toBe(true);
  }, 30_000);

  it("exposes pack follow-up hints for packed businesses only", async () => {    const packed = await setupPackedBusiness("r3");
    expect(await getPackFollowUpHint(packed.businessId)).toContain("site readiness");

    const userId = `${prefix}_owner_r4`;
    await testDb.insert(user).values({
      id: userId,
      name: "Gate Owner",
      email: `${userId}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await createBusinessForUser({
      user: { id: userId, name: "Gate Owner", email: `${userId}@example.com` },
      businessId: slug(`${prefix}_biz_r4`),
      defaultCurrency: "USD",
      name: `${prefix}_biz_r4`,
      businessType: "cleaning_services",
      plan: "free",
    });

    expect(await getPackFollowUpHint(slug(`${prefix}_biz_r4`))).toBeNull();
  }, 30_000);
});
