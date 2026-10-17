import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { InViewReveal } from "@/components/marketing/in-view-reveal";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import type { SolutionDetail } from "@/components/marketing/solutions-data";
import { SolutionDemo } from "@/components/marketing/solutions/solution-demo";
import {
  CustomerViewSection,
  RelatedSolutions,
  SolutionFaq,
  SolutionFeatures,
  SolutionHeroCard,
  SolutionsFinalCta,
} from "@/components/marketing/solutions/solutions-shared";
import { PublicPageShell } from "@/components/shared/public-page-shell";
import { Button } from "@/components/ui/button";

export function SolutionDetailPage({ detail }: { detail: SolutionDetail }) {
  const workflowHref = `/solutions/${detail.slug}#workflow`;
  return (
    <div className="overflow-x-clip">
      <PublicPageShell
        brandSize="lg"
        brandSubtitle={null}
        className="pb-28 pt-0 lg:pb-40"
        header={<MarketingHeader />}
      >
        <section className="relative overflow-hidden px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pb-24 lg:pt-24 xl:px-0">
          <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
            <InViewReveal className="flex w-full flex-col items-start gap-5 sm:gap-6">
              <h1 className="font-sans text-[2.5rem] font-normal leading-[1.08] tracking-[-0.035em] text-foreground sm:text-6xl sm:leading-[1.05] lg:text-[4.25rem]">
                {detail.headline}
              </h1>
              <p className="max-w-xl font-sans text-[0.95rem] font-normal leading-snug text-muted-foreground sm:text-base lg:text-lg lg:leading-snug">
                {detail.definition}
              </p>
              <div className="flex flex-row flex-wrap items-center gap-3 pt-1">
                <Button
                  asChild
                  className="rounded-lg bg-primary px-6 font-mono text-xs font-medium uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
                  size="lg"
                >
                  <Link href="/signup">
                    Start free
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
                <Button
                  asChild
                  className="rounded-lg border-border/80 bg-secondary/30 px-6 font-mono text-xs font-medium uppercase tracking-wider text-foreground hover:bg-secondary/60"
                  size="lg"
                  variant="outline"
                >
                  <Link href="#workflow">{detail.secondaryCtaLabel}</Link>
                </Button>
              </div>
            </InViewReveal>
            <InViewReveal delay={100}>
              <SolutionHeroCard card={detail.heroCard} />
            </InViewReveal>
          </div>
        </section>

        <section
          aria-labelledby="solution-features-heading"
          className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 xl:px-0"
        >
          <InViewReveal className="relative z-10 flex max-w-2xl flex-col items-start gap-3">
            <h2
              className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
              id="solution-features-heading"
            >
              {detail.featuresHeading}
            </h2>
            <p className="text-sm leading-5 text-muted-foreground sm:text-base sm:leading-6">
              {detail.featuresIntro}
            </p>
          </InViewReveal>
          <InViewReveal className="relative z-10 mt-8 sm:mt-10" delay={80}>
            <SolutionFeatures items={detail.features} />
          </InViewReveal>
        </section>

        <section
          aria-labelledby="solution-demo-heading"
          className="relative z-10 mx-auto mt-20 w-full max-w-6xl scroll-mt-24 px-4 sm:mt-28 sm:px-6 lg:px-8 xl:px-0"
          id="workflow"
        >
          <InViewReveal className="relative z-10 flex max-w-2xl flex-col items-start gap-3">
            <p className="meta-label">Same record</p>
            <h2
              className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
              id="solution-demo-heading"
            >
              {detail.demoHeadline}
            </h2>
            <p className="text-sm leading-5 text-muted-foreground sm:text-base sm:leading-6">
              {detail.demoIntro}
            </p>
          </InViewReveal>
          <InViewReveal className="relative z-10 mt-8 sm:mt-10" delay={80}>
            <SolutionDemo tabs={detail.demoTabs} />
          </InViewReveal>
        </section>

        <section
          aria-labelledby="solution-customer-heading"
          className="relative z-10 mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6 lg:px-8 xl:px-0"
        >
          <InViewReveal className="relative z-10 flex max-w-2xl flex-col items-start gap-3">
            <h2
              className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
              id="solution-customer-heading"
            >
              Your customer just taps a link.
            </h2>
            <p className="text-sm leading-5 text-muted-foreground sm:text-base sm:leading-6">
              No account, no app to install. They review the details and respond
              — you see every view, accept, and change request.
            </p>
          </InViewReveal>
          <InViewReveal className="relative z-10 mt-8 sm:mt-10" delay={80}>
            <CustomerViewSection view={detail.customerView} />
          </InViewReveal>
        </section>

        <section
          aria-labelledby="solution-faq-heading"
          className="relative z-10 mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6 lg:px-8 xl:px-0"
        >
          <InViewReveal className="relative z-10 flex max-w-2xl flex-col items-start gap-3">
            <h2
              className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
              id="solution-faq-heading"
            >
              Frequently asked questions
            </h2>
          </InViewReveal>
          <InViewReveal className="relative z-10 mt-8 sm:mt-10" delay={80}>
            <SolutionFaq items={detail.faqs} slug={detail.slug} />
          </InViewReveal>
        </section>

        <section
          aria-labelledby="solution-more-heading"
          className="relative z-10 mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6 lg:px-8 xl:px-0"
        >
          <InViewReveal className="relative z-10 flex max-w-2xl flex-col items-start gap-3">
            <h2
              className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
              id="solution-more-heading"
            >
              Explore another workflow.
            </h2>
            <p className="text-sm leading-5 text-muted-foreground sm:text-base sm:leading-6">
              Every solution runs on the same six features —{" "}
              <Link
                className="font-medium text-primary hover:underline"
                href="/features/inquiries"
              >
                inquiries
              </Link>
              {", "}
              <Link
                className="font-medium text-primary hover:underline"
                href="/features/quotes"
              >
                quotes
              </Link>
              {", "}
              <Link
                className="font-medium text-primary hover:underline"
                href="/features/follow-ups"
              >
                follow-ups
              </Link>
              {", "}
              <Link
                className="font-medium text-primary hover:underline"
                href="/features/ai"
              >
                AI drafting
              </Link>
              {", "}
              <Link
                className="font-medium text-primary hover:underline"
                href="/features/invoices"
              >
                invoices
              </Link>
              {", and "}
              <Link
                className="font-medium text-primary hover:underline"
                href="/features/analytics"
              >
                analytics
              </Link>
              .
            </p>
          </InViewReveal>
          <InViewReveal className="relative z-10 mt-8 sm:mt-10" delay={80}>
            <RelatedSolutions detail={detail} />
          </InViewReveal>
        </section>

        <InViewReveal className="mx-auto mt-20 w-full max-w-4xl px-4 sm:mt-28 sm:px-6 lg:px-8 xl:px-0">
          <SolutionsFinalCta
            headline={detail.ctaHeadline}
            sub={detail.ctaSub}
            workflowHref={workflowHref}
          />
        </InViewReveal>
      </PublicPageShell>
      <MarketingFooter />
    </div>
  );
}
