import dynamic from "next/dynamic";

import type { LandingFeatureId } from "@/components/marketing/marketing-data";
import { MarketingEyebrow } from "@/components/marketing/marketing-eyebrow";
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
    <article className="scroll-mt-24" id={primaryId}>
      {altIds.map((id) => (
        <span key={id} id={id} className="scroll-mt-24 sr-only" aria-hidden="true" />
      ))}
      <div
        className={cn(
          "grid gap-y-8 lg:items-center lg:gap-x-14",
          reverse ? "lg:grid-cols-[7fr_5fr]" : "lg:grid-cols-[5fr_7fr]",
        )}
      >
        <div
          className={cn("min-w-0", reverse && "lg:order-2")}
          data-feature-text
        >
          <div className="flex flex-col gap-3">
            <MarketingEyebrow>
              {featureKickers[featureId]}
            </MarketingEyebrow>
            <h3 className="font-heading text-marketing-row-title text-balance text-foreground">
              {title}
            </h3>
            <p className="max-w-[46ch] text-marketing-body leading-[1.6] text-pretty text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <div
          className={cn("min-w-0", reverse && "lg:order-1")}
          data-feature-mock
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
    <div className="w-full max-w-[40rem]">
      <MarketingFeatureMock compact featureId={featureId} />
    </div>
  );
}
