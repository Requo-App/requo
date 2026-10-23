import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getEffectivePlanForBusiness } from "@/lib/billing/subscription-service";
import { getBusinessScopeCacheTag } from "@/lib/cache/business-tags";
import { db } from "@/lib/db/client";
import { getBusinessRequestContextForSlug } from "@/lib/db/business-access";
import { analyticsScheduledReports } from "@/lib/db/schema";
import { hasFeatureAccess } from "@/lib/plans";
import { newEntityId } from "@/lib/ids";
import { slugParamSchema as routeParamsSchema } from "@/lib/api/params";

const emailSchema = z.string().email();

const scheduleSchema = z.enum(["daily", "weekly", "monthly"]);

const createBodySchema = z.object({
  recipientEmails: z
    .array(emailSchema)
    .min(1, "At least one recipient email is required.")
    .max(5, "Maximum 5 recipient emails allowed."),
  schedule: scheduleSchema,
  timezone: z.string().trim().min(1, "Timezone is required."),
  enabled: z.boolean().optional().default(true),
});

const updateBodySchema = z.object({
  id: z.string().trim().min(1),
  recipientEmails: z
    .array(emailSchema)
    .min(1, "At least one recipient email is required.")
    .max(5, "Maximum 5 recipient emails allowed.")
    .optional(),
  schedule: scheduleSchema.optional(),
  timezone: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
});

const deleteBodySchema = z.object({
  id: z.string().trim().min(1),
});

/**
 * Recipient cap per plan: Pro sends to one address, Business to five. The
 * schema keeps the absolute bound; this helper narrows it to the entitlement.
 */
function getRecipientLimit(plan: Parameters<typeof hasFeatureAccess>[0]): number {
  return hasFeatureAccess(plan, "analyticsTeam") ? 5 : 1;
}

function recipientLimitError(limit: number) {
  return NextResponse.json(
    {
      error: `Your plan allows up to ${limit} recipient ${limit === 1 ? "email" : "emails"}.`,
    },
    { status: 403 },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const parsedParams = routeParamsSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const requestContext = await getBusinessRequestContextForSlug(
    parsedParams.data.slug,
  );

  if (!requestContext) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const effectivePlan = await getEffectivePlanForBusiness(
    requestContext.businessContext.business.id,
  );

  if (!hasFeatureAccess(effectivePlan, "analyticsOperations")) {
    return NextResponse.json(
      { error: "Upgrade to access scheduled reports." },
      { status: 403 },
    );
  }

  const reports = await db
    .select()
    .from(analyticsScheduledReports)
    .where(
      eq(
        analyticsScheduledReports.businessId,
        requestContext.businessContext.business.id,
      ),
    );

  return NextResponse.json({ reports });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const parsedParams = routeParamsSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const requestContext = await getBusinessRequestContextForSlug(
    parsedParams.data.slug,
  );

  if (!requestContext) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const effectivePlan = await getEffectivePlanForBusiness(
    requestContext.businessContext.business.id,
  );

  if (!hasFeatureAccess(effectivePlan, "analyticsOperations")) {
    return NextResponse.json(
      { error: "Upgrade to access scheduled reports." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = createBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const { recipientEmails, schedule, timezone, enabled } = parsedBody.data;
  const recipientLimit = getRecipientLimit(effectivePlan);
  if (recipientEmails.length > recipientLimit) {
    return recipientLimitError(recipientLimit);
  }
  const businessId = requestContext.businessContext.business.id;
  const now = new Date();

  const [report] = await db
    .insert(analyticsScheduledReports)
    .values({
      id: newEntityId(),
      businessId,
      recipientEmails,
      schedule,
      timezone,
      enabled,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  revalidateTag(getBusinessScopeCacheTag(businessId), { expire: 0 });

  return NextResponse.json({ report }, { status: 201 });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const parsedParams = routeParamsSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const requestContext = await getBusinessRequestContextForSlug(
    parsedParams.data.slug,
  );

  if (!requestContext) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const effectivePlan = await getEffectivePlanForBusiness(
    requestContext.businessContext.business.id,
  );

  if (!hasFeatureAccess(effectivePlan, "analyticsOperations")) {
    return NextResponse.json(
      { error: "Upgrade to access scheduled reports." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = updateBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...updates } = parsedBody.data;
  const recipientLimit = getRecipientLimit(effectivePlan);
  if (
    updates.recipientEmails &&
    updates.recipientEmails.length > recipientLimit
  ) {
    return recipientLimitError(recipientLimit);
  }
  const businessId = requestContext.businessContext.business.id;
  const now = new Date();

  const [report] = await db
    .update(analyticsScheduledReports)
    .set({
      ...updates,
      updatedAt: now,
    })
    .where(
      and(
        eq(analyticsScheduledReports.id, id),
        eq(analyticsScheduledReports.businessId, businessId),
      ),
    )
    .returning();

  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  revalidateTag(getBusinessScopeCacheTag(businessId), { expire: 0 });

  return NextResponse.json({ report });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const parsedParams = routeParamsSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const requestContext = await getBusinessRequestContextForSlug(
    parsedParams.data.slug,
  );

  if (!requestContext) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const effectivePlan = await getEffectivePlanForBusiness(
    requestContext.businessContext.business.id,
  );

  if (!hasFeatureAccess(effectivePlan, "analyticsOperations")) {
    return NextResponse.json(
      { error: "Upgrade to access scheduled reports." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const queryId = url.searchParams.get("id");

  let id = queryId;

  if (!id) {
    const body = await request.json().catch(() => null);
    const parsedBody = deleteBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid input. Provide a report ID.", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    id = parsedBody.data.id;
  }

  const businessId = requestContext.businessContext.business.id;

  const [deleted] = await db
    .delete(analyticsScheduledReports)
    .where(
      and(
        eq(analyticsScheduledReports.id, id),
        eq(analyticsScheduledReports.businessId, businessId),
      ),
    )
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  revalidateTag(getBusinessScopeCacheTag(businessId), { expire: 0 });

  return NextResponse.json({ success: true });
}
