import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getEffectivePlanForBusiness } from "@/lib/billing/subscription-service";
import { getBusinessScopeCacheTag } from "@/lib/cache/business-tags";
import { db } from "@/lib/db/client";
import { getBusinessRequestContextForSlug } from "@/lib/db/business-access";
import { analyticsGoalThresholds } from "@/lib/db/schema";
import { hasFeatureAccess } from "@/lib/plans";
import { newEntityId } from "@/lib/ids";
import { slugParamSchema as routeParamsSchema } from "@/lib/api/params";

const putBodySchema = z.object({
  metricKey: z.string().trim().min(1).max(100),
  targetValue: z.number().positive(),
});

const deleteBodySchema = z.object({
  metricKey: z.string().trim().min(1).max(100),
});

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

  if (!hasFeatureAccess(effectivePlan, "analyticsPerformance")) {
    return NextResponse.json(
      { error: "Upgrade to Pro to use goal thresholds." },
      { status: 403 },
    );
  }

  const goals = await db
    .select()
    .from(analyticsGoalThresholds)
    .where(
      eq(
        analyticsGoalThresholds.businessId,
        requestContext.businessContext.business.id,
      ),
    );

  return NextResponse.json({ goals });
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

  if (!hasFeatureAccess(effectivePlan, "analyticsPerformance")) {
    return NextResponse.json(
      { error: "Upgrade to Pro to use goal thresholds." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = putBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const { metricKey, targetValue } = parsedBody.data;
  const businessId = requestContext.businessContext.business.id;
  const now = new Date();

  const [goal] = await db
    .insert(analyticsGoalThresholds)
    .values({
      id: newEntityId(),
      businessId,
      metricKey,
      targetValue,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        analyticsGoalThresholds.businessId,
        analyticsGoalThresholds.metricKey,
      ],
      set: {
        targetValue,
        updatedAt: now,
      },
    })
    .returning();

  revalidateTag(getBusinessScopeCacheTag(businessId), { expire: 0 });

  return NextResponse.json({ goal });
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

  if (!hasFeatureAccess(effectivePlan, "analyticsPerformance")) {
    return NextResponse.json(
      { error: "Upgrade to Pro to use goal thresholds." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = deleteBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const businessId = requestContext.businessContext.business.id;

  await db
    .delete(analyticsGoalThresholds)
    .where(
      and(
        eq(analyticsGoalThresholds.businessId, businessId),
        eq(analyticsGoalThresholds.metricKey, parsedBody.data.metricKey),
      ),
    );

  revalidateTag(getBusinessScopeCacheTag(businessId), { expire: 0 });

  return NextResponse.json({ ok: true });
}
