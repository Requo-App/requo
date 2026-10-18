import dynamic from "next/dynamic";

import type { LandingFeatureId } from "@/components/marketing/marketing-data";
import { cn } from "@/lib/utils";

const MarketingFeatureMock = dynamic(
  () =>
    import("@/components/marketing/marketing-feature-mocks").then(
      (m) => m.MarketingFeatureMock,
    ),
);

const featureKickers: Record<LandingFeatureId, string> = {
  inquiries: "Capture",
  quotes: "Quote",
  ai: "Assist",
  invoices: "Invoice",
  followUps: "Follow up",
  analytics: "Improve",
};

const featureAnchorIds: Record<LandingFeatureId, string> = {
  inquiries: "inquiries",
  quotes: "quotes",
  ai: "ai",
  invoices: "invoices",
  followUps: "follow-ups",
  analytics: "analytics",
};

const featureAltAnchorIds: Record<LandingFeatureId, string[]> = {
  inquiries: ["inquiry"],
  quotes: ["quote"],
  ai: ["assist"],
  invoices: ["invoice"],
  followUps: ["followUps", "follow-up", "followup"],
  analytics: ["improve"],
};

export function MarketingFeatureRow({
  title,
  description,
  featureId,
  reverse = false,
}: {
  title: string;
  description: string;
  featureId: LandingFeatureId;
  reverse?: boolean;
}) {
  const primaryId = featureAnchorIds[featureId] ?? featureId;
  const altIds = featureAltAnchorIds[featureId] ?? [];

  return (
    <article
      className="[--page-gutter:1.25rem] scroll-mt-24 overflow-x-clip py-6 sm:[--page-gutter:1.5rem] sm:py-8 lg:[--page-gutter:2rem] lg:py-10 xl:[--page-gutter:max(2rem,calc((100vw-72rem)/2))]"
      id={primaryId}
    >
      {altIds.map((id) => (
        <span key={id} id={id} className="scroll-mt-24 sr-only" aria-hidden="true" />
      ))}
      <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
        <div
          className={cn(
            "px-[var(--page-gutter)]",
            reverse
              ? "lg:order-2 lg:pl-10 lg:pr-[var(--page-gutter)]"
              : "lg:pl-[var(--page-gutter)] lg:pr-10",
          )}
        >
          <div
            className={cn(
              "flex w-full max-w-[27rem] flex-col gap-4",
              reverse ? "lg:ml-auto" : "lg:mr-auto",
            )}
          >
            <p className="meta-label !text-primary">{featureKickers[featureId]}</p>
            <h3 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {title}
            </h3>
            <p className="text-sm leading-snug text-muted-foreground sm:text-base sm:leading-6">
              {description}
            </p>
          </div>
        </div>

        <div
          className={cn(
            "min-w-0 px-[var(--page-gutter)] lg:px-0",
            reverse && "lg:order-1",
          )}
        >
          <MarketingFeaturePreview featureId={featureId} />
        </div>
      </div>
    </article>
  );
}

function MarketingFeaturePreview({
  featureId,
}: {
  featureId: LandingFeatureId;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[40rem] pb-3 pr-3 sm:pb-5 sm:pr-5">
      <div className="absolute inset-x-3 bottom-0 top-3 rounded-2xl border border-border/50 bg-muted/50" />
      <div
        aria-label={`Preview of ${featureId}`}
        className="relative overflow-hidden rounded-2xl border border-border/70 bg-card"
      >
        <MarketingFeatureMock featureId={featureId} />
      </div>
    </div>
  );
}
