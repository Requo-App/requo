import { eq, inArray } from "drizzle-orm";

import { createServicePreset } from "@/features/inquiries/service-presets";
import {
  accountSubscriptions,
  activityLogs,
  analyticsEvents,
  auditLogs,
  services,
  businessMembers,
  businessNotificationStates,
  businessNotifications,
  businesses,
  businessSubscriptions,
  followUps,
  inquiries,
  quoteItems,
  quotes,
  user,
  userRecentBusinesses,
} from "@/lib/db/schema";

import { testDb } from "../db";

export type WorkflowFixtureIds = {
  ownerUserId: string;
  managerUserId: string;
  staffUserId: string;
  outsiderUserId: string;
  businessId: string;
  otherBusinessId: string;
  archivedBusinessId: string;
  serviceId: string;
  otherServiceId: string;
  archivedServiceId: string;
  inquiryId: string;
  waitingInquiryId: string;
  otherInquiryId: string;
  businessSlug: string;
  otherBusinessSlug: string;
  archivedBusinessSlug: string;
};

function slugFromPrefix(prefix: string) {
  return prefix.replace(/_/g, "-");
}

export function getWorkflowFixtureIds(prefix: string): WorkflowFixtureIds {
  const slugPrefix = slugFromPrefix(prefix);

  return {
    ownerUserId: `${prefix}_owner`,
    managerUserId: `${prefix}_manager`,
    staffUserId: `${prefix}_staff`,
    outsiderUserId: `${prefix}_outsider`,
    businessId: `${prefix}_business`,
    otherBusinessId: `${prefix}_business_other`,
    archivedBusinessId: `${prefix}_business_archived`,
    serviceId: `${prefix}_form`,
    otherServiceId: `${prefix}_form_other`,
    archivedServiceId: `${prefix}_form_archived`,
    inquiryId: `${prefix}_inquiry`,
    waitingInquiryId: `${prefix}_inquiry_waiting`,
    otherInquiryId: `${prefix}_inquiry_other`,
    businessSlug: `${slugPrefix}-business`,
    otherBusinessSlug: `${slugPrefix}-other-business`,
    archivedBusinessSlug: `${slugPrefix}-archived-business`,
  };
}

export async function cleanupWorkflowFixture(prefix: string) {
  const ids = getWorkflowFixtureIds(prefix);
  const userIds = [
    ids.ownerUserId,
    ids.managerUserId,
    ids.staffUserId,
    ids.outsiderUserId,
  ];
  const businessIds = [
    ids.businessId,
    ids.otherBusinessId,
    ids.archivedBusinessId,
  ];

  await testDb
    .delete(analyticsEvents)
    .where(inArray(analyticsEvents.businessId, businessIds));
  await testDb.delete(followUps).where(inArray(followUps.businessId, businessIds));
  await testDb
    .delete(businessNotificationStates)
    .where(inArray(businessNotificationStates.businessId, businessIds));
  await testDb
    .delete(businessNotifications)
    .where(inArray(businessNotifications.businessId, businessIds));
  await testDb
    .delete(activityLogs)
    .where(inArray(activityLogs.businessId, businessIds));
  await testDb
    .delete(userRecentBusinesses)
    .where(inArray(userRecentBusinesses.businessId, businessIds));
  await testDb
    .delete(auditLogs)
    .where(inArray(auditLogs.businessId, businessIds));
  await testDb.delete(quoteItems).where(inArray(quoteItems.businessId, businessIds));
  await testDb.delete(quotes).where(inArray(quotes.businessId, businessIds));
  await testDb.delete(inquiries).where(inArray(inquiries.businessId, businessIds));
  await testDb
    .delete(accountSubscriptions)
    .where(inArray(accountSubscriptions.userId, userIds));
  await testDb
    .delete(services)
    .where(inArray(services.businessId, businessIds));
  await testDb
    .delete(businessMembers)
    .where(inArray(businessMembers.businessId, businessIds));
  await testDb
    .delete(businessSubscriptions)
    .where(inArray(businessSubscriptions.businessId, businessIds));
  await testDb.delete(businesses).where(inArray(businesses.id, businessIds));
  await testDb.delete(user).where(inArray(user.id, userIds));
}

export async function createWorkflowFixture(prefix: string) {
  const ids = getWorkflowFixtureIds(prefix);
  const now = new Date("2026-04-20T00:00:00.000Z");
  const archivedAt = new Date("2026-04-21T00:00:00.000Z");

  await cleanupWorkflowFixture(prefix);

  await testDb.insert(user).values([
    {
      id: ids.ownerUserId,
      name: "Workflow Owner",
      email: `${prefix}.owner@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.managerUserId,
      name: "Workflow Manager",
      email: `${prefix}.manager@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.staffUserId,
      name: "Workflow Staff",
      email: `${prefix}.staff@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.outsiderUserId,
      name: "Workflow Outsider",
      email: `${prefix}.outsider@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await testDb.insert(businesses).values([
    {
      id: ids.businessId,
      ownerUserId: ids.ownerUserId,
      name: "Workflow Business",
      slug: ids.businessSlug,
      plan: "pro",
      businessType: "general_project_services",
      defaultCurrency: "USD",
      publicInquiryEnabled: true,
      notifyInAppOnNewInquiry: true,
      notifyInAppOnQuoteResponse: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.otherBusinessId,
      ownerUserId: ids.outsiderUserId,
      name: "Other Workflow Business",
      slug: ids.otherBusinessSlug,
      plan: "free",
      businessType: "general_project_services",
      defaultCurrency: "USD",
      publicInquiryEnabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.archivedBusinessId,
      ownerUserId: ids.ownerUserId,
      name: "Archived Workflow Business",
      slug: ids.archivedBusinessSlug,
      plan: "pro",
      businessType: "general_project_services",
      defaultCurrency: "USD",
      publicInquiryEnabled: true,
      archivedAt,
      archivedBy: ids.ownerUserId,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await testDb.insert(businessMembers).values([
    {
      id: `${prefix}_business_member_owner`,
      businessId: ids.businessId,
      userId: ids.ownerUserId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${prefix}_business_member_manager`,
      businessId: ids.businessId,
      userId: ids.managerUserId,
      role: "manager",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${prefix}_business_member_staff`,
      businessId: ids.businessId,
      userId: ids.staffUserId,
      role: "staff",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${prefix}_business_member_outsider`,
      businessId: ids.otherBusinessId,
      userId: ids.outsiderUserId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${prefix}_business_member_archived_owner`,
      businessId: ids.archivedBusinessId,
      userId: ids.ownerUserId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  const preset = createServicePreset({
    businessType: "general_project_services",
    businessName: "Workflow Business",
  });
  const otherPreset = createServicePreset({
    businessType: "general_project_services",
    businessName: "Other Workflow Business",
  });

  await testDb.insert(services).values([
    {
      id: ids.serviceId,
      businessId: ids.businessId,
      name: "Workflow Service",
      slug: "workflow-form",
      businessType: preset.businessType,
      isDefault: true,
      publicInquiryEnabled: true,
      inquiryFormConfig: preset.inquiryFormConfig,
      inquiryPageConfig: preset.inquiryPageConfig,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.otherServiceId,
      businessId: ids.otherBusinessId,
      name: "Other Workflow Service",
      slug: "workflow-form",
      businessType: otherPreset.businessType,
      isDefault: true,
      publicInquiryEnabled: true,
      inquiryFormConfig: otherPreset.inquiryFormConfig,
      inquiryPageConfig: otherPreset.inquiryPageConfig,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.archivedServiceId,
      businessId: ids.archivedBusinessId,
      name: "Archived Workflow Service",
      slug: "workflow-form",
      businessType: preset.businessType,
      isDefault: true,
      publicInquiryEnabled: true,
      inquiryFormConfig: preset.inquiryFormConfig,
      inquiryPageConfig: preset.inquiryPageConfig,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await testDb.insert(inquiries).values([
    {
      id: ids.inquiryId,
      businessId: ids.businessId,
      serviceId: ids.serviceId,
      status: "new",
      subject: "Window graphics",
      customerName: "Taylor Nguyen",
      customerEmail: "taylor@example.com",
      customerContactMethod: "email",
      customerContactHandle: "taylor@example.com",
      serviceCategory: null,
      details: "Needs quote for storefront window graphics.",
      submittedFieldSnapshot: {
        version: 1,
        businessType: "general_project_services",
        fields: [],
      },
      source: "service_form",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.waitingInquiryId,
      businessId: ids.businessId,
      serviceId: ids.serviceId,
      status: "waiting",
      subject: "Vehicle wrap",
      customerName: "Jordan Lee",
      customerEmail: "jordan@example.com",
      customerContactMethod: "email",
      customerContactHandle: "jordan@example.com",
      serviceCategory: null,
      details: "Needs quote for a van wrap.",
      submittedFieldSnapshot: {
        version: 1,
        businessType: "general_project_services",
        fields: [],
      },
      source: "manual",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.otherInquiryId,
      businessId: ids.otherBusinessId,
      serviceId: ids.otherServiceId,
      status: "new",
      subject: "Other inquiry",
      customerName: "Other Customer",
      customerEmail: "other@example.com",
      customerContactMethod: "email",
      customerContactHandle: "other@example.com",
      serviceCategory: null,
      details: "This belongs to another business.",
      submittedFieldSnapshot: {
        version: 1,
        businessType: "general_project_services",
        fields: [],
      },
      source: "service_form",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  return ids;
}

export async function getInquiryStatus(inquiryId: string) {
  const [row] = await testDb
    .select({ status: inquiries.status })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId))
    .limit(1);

  return row?.status ?? null;
}
