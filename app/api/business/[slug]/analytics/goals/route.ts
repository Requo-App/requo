import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

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

  if (
    !hasFeatureAccess(
      requestContext.businessContext.business.plan,
      "analyticsConversion",
    )
  ) {
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

  if (
    !hasFeatureAccess(
      requestContext.businessContext.business.plan,
      "analyticsConversion",
    )
  ) {
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

  return NextResponse.json({ goal });
}
