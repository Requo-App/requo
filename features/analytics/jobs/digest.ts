import "server-only";

import { and, eq, gte, lt, sql } from "drizzle-orm";

import { renderAnalyticsDigestEmail } from "@/emails/templates/analytics-digest";
import { generateWithFallback, isAiConfigured, logAiInvocation } from "@/lib/ai";
import { resolveEffectivePlanFromSubscriptionFields } from "@/lib/billing/subscription-service";
import { db } from "@/lib/db/client";
import {
  analyticsDailyRollups,
  businesses,
  businessMembers,
  user,
} from "@/lib/db/schema";
import { businessSubscriptions } from "@/lib/db/schema/subscriptions";
import { sendEmailWithFallback } from "@/lib/email/send-email";
import { getEmailSender } from "@/lib/email/senders";
import { env, isAnalyticsDigestEmailEnabled, isEmailConfigured } from "@/lib/env";
import { hasFeatureAccess } from "@/lib/plans/entitlements";

export type AnalyticsDigestSummary = {
  skipped?: boolean;
  reason?: string;
  totalEligible?: number;
  sent?: number;
  failed?: number;
  errors?: Array<{ businessId: string; error: string }>;
};

type WeekMetrics = {
  formViews: number;
  inquirySubmissions: number;
  quotesSent: number;
  quotesAccepted: number;
};

async function getWeekMetrics(
  businessId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<WeekMetrics> {
  const [result] = await db
    .select({
      formViews: sql<number>`coalesce(sum(${analyticsDailyRollups.formViews}), 0)`,
      inquirySubmissions: sql<number>`coalesce(sum(${analyticsDailyRollups.inquirySubmissions}), 0)`,
      quotesSent: sql<number>`coalesce(sum(${analyticsDailyRollups.quotesSent}), 0)`,
      quotesAccepted: sql<number>`coalesce(sum(${analyticsDailyRollups.quotesAccepted}), 0)`,
    })
    .from(analyticsDailyRollups)
    .where(
      and(
        eq(analyticsDailyRollups.businessId, businessId),
        gte(analyticsDailyRollups.date, weekStart.toISOString().split("T")[0]!),
        lt(analyticsDailyRollups.date, weekEnd.toISOString().split("T")[0]!),
      ),
    );

  return {
    formViews: Number(result?.formViews ?? 0),
    inquirySubmissions: Number(result?.inquirySubmissions ?? 0),
    quotesSent: Number(result?.quotesSent ?? 0),
    quotesAccepted: Number(result?.quotesAccepted ?? 0),
  };
}

async function generateRecommendations(
  businessName: string,
  current: WeekMetrics,
  prior: WeekMetrics,
  usage: { businessId: string; userId: string },
): Promise<string[]> {
  if (!isAiConfigured()) {
    return [];
  }

  const prompt = [
    "You are a business analytics advisor for a service business. Based on the week-over-week metric changes below, provide 1-3 specific, actionable recommendations. Keep each recommendation to one sentence.",
    "",
    `Business: ${businessName}`,
    "",
    "This week vs last week:",
    `- Form views: ${current.formViews} (was ${prior.formViews})`,
    `- Inquiry submissions: ${current.inquirySubmissions} (was ${prior.inquirySubmissions})`,
    `- Quotes sent: ${current.quotesSent} (was ${prior.quotesSent})`,
    `- Quotes accepted: ${current.quotesAccepted} (was ${prior.quotesAccepted})`,
    "",
    "Respond with 1-3 recommendations, one per line. No bullet points, no numbering, no labels. Just the recommendation sentences.",
  ].join("\n");

  const startedAt = Date.now();

  try {
    const response = await generateWithFallback({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      maxOutputTokens: 300,
      qualityTier: "cheap",
      routingProfile: "short_text",
      estimatedTokens: prompt.length / 4 + 300,
    });

    // The digest is a platform-provided feature for entitled businesses, so
    // it does not charge their credit pool — but the spend still has to be
    // visible in the admin console and the token logs.
    await logAiInvocation({
      userId: usage.userId,
      businessId: usage.businessId,
      taskType: "follow_up_message",
      model: response.model,
      provider: response.provider,
      inputTokens: response.usage?.promptTokens ?? 0,
      outputTokens: response.usage?.completionTokens ?? 0,
      cacheHit: false,
      latencyMs: Date.now() - startedAt,
      status: "success",
    }).catch((logError) => {
      console.warn("[analytics-digest] Failed to log invocation:", logError);
    });

    return response.text
      .trim()
      .split("\n")
      .map((line) => line.replace(/^[-•*\d.)\s]+/, "").trim())
      .filter((line) => line.length > 0)
      .slice(0, 3);
  } catch (error) {
    console.warn(
      "[analytics-digest] AI recommendation generation failed:",
      error,
    );

    await logAiInvocation({
      userId: usage.userId,
      businessId: usage.businessId,
      taskType: "follow_up_message",
      model: "unknown",
      provider: "unknown",
      inputTokens: 0,
      outputTokens: 0,
      cacheHit: false,
      latencyMs: Date.now() - startedAt,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    }).catch(() => {});

    return [];
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function sendAnalyticsDigestEmails(): Promise<AnalyticsDigestSummary> {
  if (!isAnalyticsDigestEmailEnabled) {
    return { skipped: true, reason: "low_email_mode" };
  }

  if (!isEmailConfigured) {
    return { skipped: true, reason: "email_not_configured" };
  }

  const eligibleBusinesses = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      ownerUserId: businesses.ownerUserId,
      subscriptionStatus: businessSubscriptions.status,
      subscriptionPlan: businessSubscriptions.plan,
      subscriptionCurrentPeriodEnd: businessSubscriptions.currentPeriodEnd,
    })
    .from(businesses)
    .leftJoin(
      businessSubscriptions,
      eq(businessSubscriptions.businessId, businesses.id),
    )
    .where(
      and(
        eq(businesses.analyticsDigestEnabled, true),
        sql`${businesses.deletedAt} IS NULL`,
      ),
    );

  const entitled = eligibleBusinesses.filter((business) =>
    hasFeatureAccess(
      resolveEffectivePlanFromSubscriptionFields({
        status: business.subscriptionStatus,
        plan: business.subscriptionPlan,
        currentPeriodEnd: business.subscriptionCurrentPeriodEnd,
      }),
      "analyticsOperations",
    ),
  );

  const now = new Date();
  const thisWeekEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const thisWeekStart = new Date(thisWeekEnd);
  thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 7);

  const priorWeekEnd = new Date(thisWeekStart);
  const priorWeekStart = new Date(priorWeekEnd);
  priorWeekStart.setUTCDate(priorWeekStart.getUTCDate() - 7);

  let sent = 0;
  let failed = 0;
  const errors: Array<{ businessId: string; error: string }> = [];

  const appUrl = env.NEXT_PUBLIC_APP_URL || "https://app.requo.io";

  for (const business of entitled) {
    try {
      const [ownerMember] = await db
        .select({
          email: user.email,
          name: user.name,
        })
        .from(businessMembers)
        .innerJoin(user, eq(businessMembers.userId, user.id))
        .where(
          and(
            eq(businessMembers.businessId, business.id),
            eq(businessMembers.role, "owner"),
          ),
        )
        .limit(1);

      if (!ownerMember?.email) {
        continue;
      }

      const [currentMetrics, priorMetrics] = await Promise.all([
        getWeekMetrics(business.id, thisWeekStart, thisWeekEnd),
        getWeekMetrics(business.id, priorWeekStart, priorWeekEnd),
      ]);

      const recommendations = await generateRecommendations(
        business.name,
        currentMetrics,
        priorMetrics,
        { businessId: business.id, userId: business.ownerUserId },
      );

      const dashboardUrl = `${appUrl}/${business.slug}/analytics`;

      const template = renderAnalyticsDigestEmail({
        businessName: business.name,
        weekStartDate: formatDate(thisWeekStart),
        weekEndDate: formatDate(new Date(thisWeekEnd.getTime() - 86400000)),
        metrics: [
          {
            label: "Form views",
            current: currentMetrics.formViews,
            prior: priorMetrics.formViews,
          },
          {
            label: "Inquiries",
            current: currentMetrics.inquirySubmissions,
            prior: priorMetrics.inquirySubmissions,
          },
          {
            label: "Quotes sent",
            current: currentMetrics.quotesSent,
            prior: priorMetrics.quotesSent,
          },
          {
            label: "Quotes accepted",
            current: currentMetrics.quotesAccepted,
            prior: priorMetrics.quotesAccepted,
          },
        ],
        recommendations,
        dashboardUrl,
      });

      const weekKey = thisWeekStart.toISOString().split("T")[0]!;
      await sendEmailWithFallback({
        emailType: "notification",
        to: ownerMember.email,
        from: getEmailSender("notification"),
        subject: template.subject,
        html: template.html,
        text: template.text,
        idempotencyKey: `analytics-digest:${business.id}:${weekKey}`,
        businessId: business.id,
        metadata: {
          businessId: business.id,
          weekStart: weekKey,
          type: "analytics_digest",
        },
        tags: {
          type: "notification",
          event: "analytics_digest",
        },
      });

      sent++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push({ businessId: business.id, error: message });
      console.error(
        `[analytics-digest] Failed for business ${business.id}:`,
        error,
      );
    }
  }

  return {
    totalEligible: entitled.length,
    sent,
    failed,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
