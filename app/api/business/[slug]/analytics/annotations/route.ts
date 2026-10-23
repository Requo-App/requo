import { and, eq, gte, lte } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getEffectivePlanForBusiness } from "@/lib/billing/subscription-service";
import { getBusinessScopeCacheTag } from "@/lib/cache/business-tags";
import { db } from "@/lib/db/client";
import { getBusinessRequestContextForSlug } from "@/lib/db/business-access";
import { analyticsAnnotations } from "@/lib/db/schema";
import { hasFeatureAccess } from "@/lib/plans";
import { newEntityId } from "@/lib/ids";
import { slugParamSchema as routeParamsSchema } from "@/lib/api/params";

const createAnnotationSchema = z.object({
  date: z.string().date(), // ISO date format YYYY-MM-DD
  label: z.string().trim().min(1).max(200),
  color: z.string().trim().max(7).regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const updateAnnotationSchema = z.object({
  id: z.string().trim().min(1),
  date: z.string().date().optional(),
  label: z.string().trim().min(1).max(200).optional(),
  color: z
    .string()
    .trim()
    .max(7)
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

const deleteAnnotationSchema = z.object({
  id: z.string().trim().min(1),
});

export async function GET(
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
      { error: "Upgrade to Pro to use annotations." },
      { status: 403 },
    );
  }

  const businessId = requestContext.businessContext.business.id;

  // Optional date range filtering via query params
  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");

  const conditions = [eq(analyticsAnnotations.businessId, businessId)];

  if (since) {
    conditions.push(gte(analyticsAnnotations.date, since));
  }
  if (until) {
    conditions.push(lte(analyticsAnnotations.date, until));
  }

  const annotations = await db
    .select()
    .from(analyticsAnnotations)
    .where(and(...conditions));

  return NextResponse.json({ annotations });
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

  if (!hasFeatureAccess(effectivePlan, "analyticsPerformance")) {
    return NextResponse.json(
      { error: "Upgrade to Pro to use annotations." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = createAnnotationSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const { date, label, color } = parsedBody.data;
  const businessId = requestContext.businessContext.business.id;
  const now = new Date();

  const [annotation] = await db
    .insert(analyticsAnnotations)
    .values({
      id: newEntityId(),
      businessId,
      date,
      label,
      color: color ?? null,
      createdBy: requestContext.user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  revalidateTag(getBusinessScopeCacheTag(businessId), { expire: 0 });

  return NextResponse.json({ annotation }, { status: 201 });
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
      { error: "Upgrade to Pro to use annotations." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = updateAnnotationSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...updates } = parsedBody.data;
  const businessId = requestContext.businessContext.business.id;
  const now = new Date();

  // Build update set from provided fields
  const updateSet: Record<string, unknown> = { updatedAt: now };
  if (updates.date !== undefined) updateSet.date = updates.date;
  if (updates.label !== undefined) updateSet.label = updates.label;
  if (updates.color !== undefined) updateSet.color = updates.color;

  const [annotation] = await db
    .update(analyticsAnnotations)
    .set(updateSet)
    .where(
      and(
        eq(analyticsAnnotations.id, id),
        eq(analyticsAnnotations.businessId, businessId),
      ),
    )
    .returning();

  if (!annotation) {
    return NextResponse.json({ error: "Annotation not found." }, { status: 404 });
  }

  revalidateTag(getBusinessScopeCacheTag(businessId), { expire: 0 });

  return NextResponse.json({ annotation });
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
      { error: "Upgrade to Pro to use annotations." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = deleteAnnotationSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = parsedBody.data;
  const businessId = requestContext.businessContext.business.id;

  const [deleted] = await db
    .delete(analyticsAnnotations)
    .where(
      and(
        eq(analyticsAnnotations.id, id),
        eq(analyticsAnnotations.businessId, businessId),
      ),
    )
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Annotation not found." }, { status: 404 });
  }

  revalidateTag(getBusinessScopeCacheTag(businessId), { expire: 0 });

  return NextResponse.json({ success: true });
}
