import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import {
  normalizeLegacyPublicAnalyticsEventPayload,
  publicAnalyticsEventSchema,
} from "@/features/analytics/schemas";
import {
  createBusinessScopedVisitorHash,
  isTrackablePublicInquiryForm,
  isTrackablePublicQuote,
  recordPublicInquiryFormView,
  recordPublicQuoteView,
} from "@/features/analytics/tracking";
import { normalizeReferrer } from "@/features/analytics/utils/normalize-referrer";
import { recordQuotePublicViewAt } from "@/features/quotes/mutations";
import { getOptionalSession } from "@/lib/auth/session";
import { assertPublicActionRateLimit } from "@/lib/rate-limit/redis-rate-limiter";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { businessMembers } from "@/lib/db/schema";
import type { AnalyticsEventMetadata } from "@/lib/db/schema/analytics";

async function isCurrentUserBusinessMember(
  businessId: string,
): Promise<boolean> {
  const session = await getOptionalSession();

  if (!session?.user) {
    return false;
  }

  const [membership] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, session.user.id),
      ),
    )
    .limit(1);

  return Boolean(membership);
}

function buildEventMetadata(
  rawMetadata: { referrer?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string } | undefined,
): AnalyticsEventMetadata | null {
  if (!rawMetadata) return null;

  const appOrigin = env.NEXT_PUBLIC_APP_URL ?? null;
  const referrer = normalizeReferrer(rawMetadata.referrer, appOrigin);

  const metadata: AnalyticsEventMetadata = {
    referrer,
    utmSource: rawMetadata.utmSource || undefined,
    utmMedium: rawMetadata.utmMedium || undefined,
    utmCampaign: rawMetadata.utmCampaign || undefined,
  };

  // Only store metadata if there's meaningful data
  if (!metadata.referrer && !metadata.utmSource && !metadata.utmMedium && !metadata.utmCampaign) {
    return null;
  }

  return metadata;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedBody = publicAnalyticsEventSchema.safeParse(
    normalizeLegacyPublicAnalyticsEventPayload(body),
  );

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid analytics event.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 400,
      },
    );
  }

  // Abuse backstop: analytics writes are cheap to spam and poison dashboards.
  const analyticsAllowed = await assertPublicActionRateLimit({
    action: "public-inquiry-submit",
    scope: `public-analytics:${parsedBody.data.businessId}`,
    limit: 120,
    windowMs: 60_000,
  });

  if (!analyticsAllowed) {
    return NextResponse.json(
      { ok: true, tracked: false, rateLimited: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const visitorHash = createBusinessScopedVisitorHash(
    parsedBody.data.businessId,
    request.headers,
  );

  if (parsedBody.data.eventType === "inquiry_form_viewed") {
    const isTrackable = await isTrackablePublicInquiryForm(parsedBody.data);

    if (!isTrackable) {
      return NextResponse.json(
        {
          ok: true,
          tracked: false,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    // Members of the business (owner, managers, staff) previewing their own
    // public inquiry page should not inflate the public-view count.
    if (await isCurrentUserBusinessMember(parsedBody.data.businessId)) {
      return NextResponse.json(
        {
          ok: true,
          tracked: false,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const result = await recordPublicInquiryFormView({
      businessId: parsedBody.data.businessId,
      serviceId: parsedBody.data.serviceId,
      visitorHash,
      metadata: buildEventMetadata(parsedBody.data.metadata),
    });

    return NextResponse.json(
      {
        ok: true,
        tracked: result.recorded,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const isTrackable = await isTrackablePublicQuote(parsedBody.data);

  if (!isTrackable) {
    return NextResponse.json(
      {
        ok: true,
        tracked: false,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  // Members of the business (owner, managers, staff) opening their own quote
  // link should not be counted as customer views and should not update the
  // "last viewed by customer" timestamp on the quote record.
  if (await isCurrentUserBusinessMember(parsedBody.data.businessId)) {
    return NextResponse.json(
      {
        ok: true,
        tracked: false,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const result = await recordPublicQuoteView({
    businessId: parsedBody.data.businessId,
    quoteId: parsedBody.data.quoteId,
    visitorHash,
    metadata: buildEventMetadata(parsedBody.data.metadata),
  });

  await recordQuotePublicViewAt(parsedBody.data.quoteId, parsedBody.data.businessId);

  return NextResponse.json(
    {
      ok: true,
      tracked: result.recorded,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
