import { NextResponse } from "next/server";

import {
  normalizeMobileSearchQuery,
  searchMobileRecordsForBusiness,
} from "@/features/search/queries";
import { getBusinessRequestContextForSlug } from "@/lib/db/business-access";

import { slugParamSchema } from "@/lib/api/params";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const parsedParams = slugParamSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const requestContext = await getBusinessRequestContextForSlug(
    parsedParams.data.slug,
  );

  if (!requestContext) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const rawQuery = new URL(request.url).searchParams.get("q") ?? "";
  const query = normalizeMobileSearchQuery(rawQuery);

  if (!query) {
    return NextResponse.json(
      { results: [] },
      { headers: { "cache-control": "private, no-store" } },
    );
  }

  const results = await searchMobileRecordsForBusiness({
    businessId: requestContext.businessContext.business.id,
    businessSlug: requestContext.businessContext.business.slug,
    query,
  });

  return NextResponse.json(
    { results },
    { headers: { "cache-control": "private, no-store" } },
  );
}
