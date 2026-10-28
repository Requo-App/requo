import { ArrowRight, CheckCircle2, Eye } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { BookDemoDialog } from "@/components/marketing/book-demo-dialog";
import { InViewReveal } from "@/components/marketing/in-view-reveal";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MockBadge } from "@/components/marketing/marketing-mock-primitives";
import type {
  SolutionDetail,
  SolutionLandingContent,
  SolutionLandingWorkflowStep,
  SolutionTestimonial,
} from "@/components/marketing/solutions-data";
import {
  SolutionInquiryMiniMock,
  SolutionWorkflowMock,
} from "@/components/marketing/solutions/solution-landing-mocks";
import {
  ExploreSolutions,
  SolutionCardShell,
  SolutionFaq,
  SolutionsFeatureLine,
} from "@/components/marketing/solutions/solutions-shared";
import { PublicPageShell } from "@/components/shared/public-page-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sectionShell =
  "relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 xl:px-0";
const sectionSpacing = "py-16 sm:py-20 lg:py-24";
const headingClassName =
  "font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl";
const bodyClassName =
  "text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7";

/**
 * Keep the landing entrance inside the page's motion budget: one 8px rise over
 * 400ms. InViewReveal handles the reduced-motion and no-JS fallbacks.
 */
const revealStyle = {
  "--marketing-reveal-distance": "8px",
  "--marketing-reveal-duration": "400ms",
} as CSSProperties;

function StartFreeButton({ className }: { className?: string }) {
  return (
    <Button
      asChild
      className={cn(
        "h-11 rounded-lg px-6 font-mono text-xs font-semibold uppercase tracking-wider sm:h-11",
        className,
      )}
      size="lg"
    >
      <Link href="/signup">
        Start free
        <ArrowRight
          data-icon="inline-end"
          className="transition-transform [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)] group-hover/button:translate-x-0.5"
        />
      </Link>
    </Button>
  );
}

function DemoButton({ className }: { className?: string }) {
  return (
    <BookDemoDialog
      className={cn(
        "h-11 rounded-lg px-6 font-mono text-xs font-semibold uppercase tracking-wider sm:h-11",
        className,
      )}
      size="lg"
      variant="outline"
    >
      Book a demo
    </BookDemoDialog>
  );
}

function SolutionTestimonialSection({
  testimonial,
}: {
  testimonial?: SolutionTestimonial;
}) {
  if (!testimonial) {
    return null;
  }

  return (
    <section
      aria-labelledby="solution-testimonial-heading"
      className={cn(sectionShell, sectionSpacing)}
    >
      <InViewReveal style={revealStyle}>
        <p className="meta-label">From a Requo customer</p>
        <h2 className="sr-only" id="solution-testimonial-heading">
          Customer testimonial
        </h2>
        <blockquote className="mt-4 max-w-4xl">
          <p className="font-heading text-2xl leading-snug font-semibold tracking-tight text-balance sm:text-3xl">
            “{testimonial.quote}”
          </p>
          <footer className="mt-4 text-sm text-muted-foreground">
            {testimonial.name} · {testimonial.role}
          </footer>
        </blockquote>
      </InViewReveal>
    </section>
  );
}

function StepBody({ step }: { step: SolutionLandingWorkflowStep }) {
  const className =
    "max-w-[62ch] text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7";

  if (!step.inlineLink) {
    return <p className={className}>{step.body}</p>;
  }

  const { text, href } = step.inlineLink;
  const index = step.body.indexOf(text);

  if (index === -1) {
    return <p className={className}>{step.body}</p>;
  }

  return (
    <p className={className}>
      {step.body.slice(0, index)}
      <Link className="font-medium text-primary-ink hover:underline" href={href}>
        {text}
      </Link>
      {step.body.slice(index + text.length)}
    </p>
  );
}

export function SolutionLandingPage({
  detail,
  landing,
  breadcrumbLabel,
}: {
  detail: SolutionDetail;
  landing: SolutionLandingContent;
  breadcrumbLabel?: string;
}) {
  return (
    <div className="marketing-landing overflow-x-clip">
      <PublicPageShell
        brandSize="lg"
        brandSubtitle={null}
        className="pb-28 pt-0 lg:pb-40"
        header={<MarketingHeader />}
      >
        <section
          className={cn(
            sectionShell,
            "grid items-center gap-10 pb-14 pt-12 sm:gap-12 sm:pb-20 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-24 lg:pt-24",
          )}
        >
          <InViewReveal
            className="flex w-full flex-col items-start gap-5 sm:gap-6"
            style={revealStyle}
          >
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <Link
                    className="inline-flex min-h-11 items-center transition-colors hover:text-foreground"
                    href="/"
                  >
                    Home
                  </Link>
                  <span aria-hidden="true">/</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Link
                    className="inline-flex min-h-11 items-center transition-colors hover:text-foreground"
                    href="/solutions"
                  >
                    Solutions
                  </Link>
                  <span aria-hidden="true">/</span>
                </li>
                <li>
                  <span aria-current="page">
                    {breadcrumbLabel ?? detail.shortTitle}
                  </span>
                </li>
              </ol>
            </nav>
            <p className="meta-label">{landing.eyebrow}</p>
            <h1 className="max-w-[17ch] font-heading text-[2.5rem] leading-[1.06] font-semibold tracking-[-0.04em] text-balance text-foreground sm:text-6xl sm:leading-[1.03] lg:text-[4.25rem]">
              {detail.headline}
            </h1>
            <p className={cn("max-w-[65ch]", bodyClassName)}>
              {landing.subhead}
            </p>
            <div className="flex w-full flex-col gap-3 pt-1 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <StartFreeButton className="w-full sm:w-auto" />
              <DemoButton className="w-full sm:w-auto" />
            </div>
            <ul className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:gap-x-5">
              {landing.trustPoints.map((point) => (
                <li
                  className="flex items-center gap-2 text-xs leading-5 text-muted-foreground sm:text-sm"
                  key={point}
                >
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-primary-ink"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </InViewReveal>

          <InViewReveal className="w-full" delay={80} style={revealStyle}>
            <div className="marketing-solution-stage relative overflow-hidden rounded-xl border border-border/70 p-4 pb-10 sm:p-6 sm:pb-8 lg:p-7 lg:pb-10">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="meta-label">Sample data</span>
                <span className="meta-label">{landing.sample.label}</span>
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none relative select-none"
                inert
              >
                <div className="relative z-10 ml-auto w-[92%] sm:w-[88%]">
                  <SolutionCardShell card={detail.heroCard} />
                  <div className="absolute -top-3 right-3 z-20">
                    <MockBadge
                      className="shadow-[var(--marketing-mock-shadow)]"
                      icon={Eye}
                      label="Viewed"
                      tone="info"
                    />
                  </div>
                </div>
                <div className="relative z-20 -mt-5 w-[84%] sm:absolute sm:bottom-0 sm:left-0 sm:mt-0 sm:w-[55%]">
                  <SolutionInquiryMiniMock sample={landing.sample} />
                </div>
              </div>
            </div>
          </InViewReveal>
        </section>

        <section
          aria-labelledby="solution-moves-heading"
          className={cn(sectionShell, sectionSpacing)}
        >
          <InViewReveal
            className="flex max-w-[65ch] flex-col items-start gap-3"
            style={revealStyle}
          >
            <p className="meta-label">{landing.linkCardsEyebrow}</p>
            <h2 className={headingClassName} id="solution-moves-heading">
              {landing.linkCardsHeading}
            </h2>
            <p className={bodyClassName}>{landing.linkCardsIntro}</p>
          </InViewReveal>
          <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {landing.linkCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <InViewReveal
                  className="h-full"
                  delay={index * 60}
                  key={card.title}
                  style={revealStyle}
                >
                  <Link
                    className="motion-lift group flex h-full flex-col gap-3 rounded-xl border border-border/80 bg-card p-5 shadow-[var(--surface-card-shadow)] hover:-translate-y-0.5 hover:border-[var(--marketing-hairline-strong)] hover:shadow-[var(--marketing-shadow-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:[outline-style:solid]"
                    href={card.href}
                  >
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <h3 className="font-heading text-lg font-semibold tracking-tight">
                      {card.title}
                    </h3>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {card.body}
                    </p>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-primary-ink">
                      {card.linkLabel}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 transition-transform [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)] group-hover:translate-x-0.5"
                      />
                    </span>
                  </Link>
                </InViewReveal>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="solution-workflow-heading"
          className={cn(sectionShell, "scroll-mt-24", sectionSpacing)}
          id="workflow"
        >
          <InViewReveal
            className="flex max-w-[65ch] flex-col items-start gap-3"
            style={revealStyle}
          >
            <p className="meta-label">The workflow</p>
            <h2 className={headingClassName} id="solution-workflow-heading">
              {landing.workflowHeading}
            </h2>
            <p className={bodyClassName}>{landing.workflowIntro}</p>
          </InViewReveal>

          <div className="mt-10 flex flex-col gap-12 sm:mt-14 sm:gap-16 lg:gap-20">
            {landing.workflowSteps.map((step, index) => (
              <InViewReveal key={step.id} style={revealStyle}>
                <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-14">
                  <div
                    className={cn(
                      "flex max-w-[34rem] flex-col items-start gap-3.5",
                      index % 2 === 1 && "lg:order-2",
                    )}
                  >
                    <p className="meta-label">{step.label}</p>
                    <h3 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                      {step.title}
                    </h3>
                    <StepBody step={step} />
                    <ul className="flex flex-col gap-2 pt-1">
                      {step.points.map((point) => (
                        <li
                          className="flex items-start gap-2 text-sm leading-5 text-foreground"
                          key={point}
                        >
                          <CheckCircle2
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-primary-ink"
                          />
                          {point}
                        </li>
                      ))}
                    </ul>
                    <Link
                      className="inline-flex min-h-11 items-center gap-1.5 pt-1 text-sm font-medium text-primary-ink hover:underline"
                      href={step.href}
                    >
                      {step.linkLabel}
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </div>

                  <div
                    className={cn(
                      "w-full lg:max-w-[32rem]",
                      index % 2 === 1 ? "lg:mr-auto lg:order-1" : "lg:ml-auto",
                    )}
                  >
                    <div className="marketing-solution-stage relative overflow-hidden rounded-xl border border-border/70 p-4 sm:p-6 lg:p-7">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="meta-label">Sample data</span>
                        <span className="meta-label">{landing.sample.label}</span>
                      </div>
                      <div
                        aria-hidden="true"
                        className="pointer-events-none select-none"
                        inert
                      >
                        <SolutionWorkflowMock
                          mock={step.mock}
                          sample={landing.sample}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </InViewReveal>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="solution-proof-heading"
          className={cn(sectionShell, sectionSpacing)}
        >
          <InViewReveal
            className="flex max-w-[65ch] flex-col items-start gap-3"
            style={revealStyle}
          >
            <p className="meta-label">{landing.proofEyebrow}</p>
            <h2 className={headingClassName} id="solution-proof-heading">
              {landing.proofHeading}
            </h2>
            <p className={bodyClassName}>{landing.proofIntro}</p>
          </InViewReveal>
          <InViewReveal delay={80} style={revealStyle}>
            <dl className="mt-8 grid overflow-hidden rounded-xl border border-border/80 bg-card shadow-[var(--surface-card-shadow)] md:grid-cols-3 lg:mt-10">
              {landing.proofFacts.map((fact, index) => (
                <div
                  className={cn(
                    "flex flex-col gap-1.5 p-5 sm:p-6",
                    index > 0 &&
                      "border-t border-border/60 md:border-l md:border-t-0",
                  )}
                  key={fact.label}
                >
                  <dt className="order-2 text-sm leading-5 font-medium text-foreground">
                    {fact.label}
                  </dt>
                  <dd className="order-1 font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {fact.value}
                  </dd>
                  <dd className="order-3 text-sm leading-6 text-muted-foreground">
                    {fact.description}
                  </dd>
                </div>
              ))}
            </dl>
          </InViewReveal>
        </section>

        <SolutionTestimonialSection testimonial={landing.testimonial} />

        <section
          aria-labelledby="solution-faq-heading"
          className={cn(sectionShell, sectionSpacing)}
        >
          <InViewReveal
            className="flex max-w-[65ch] flex-col items-start gap-3"
            style={revealStyle}
          >
            <p className="meta-label">Questions</p>
            <h2 className={headingClassName} id="solution-faq-heading">
              Frequently asked questions.
            </h2>
          </InViewReveal>
          <InViewReveal className="mt-8 lg:mt-10" delay={80} style={revealStyle}>
            <SolutionFaq items={detail.faqs} slug={detail.slug} />
          </InViewReveal>
        </section>

        <section
          aria-labelledby="solution-more-heading"
          className={cn(sectionShell, sectionSpacing)}
        >
          <InViewReveal
            className="flex max-w-[65ch] flex-col items-start gap-3"
            style={revealStyle}
          >
            <p className="meta-label">More workflows</p>
            <h2 className={headingClassName} id="solution-more-heading">
              Explore another workflow.
            </h2>
            <SolutionsFeatureLine className={bodyClassName} />
          </InViewReveal>
          <InViewReveal className="mt-8 lg:mt-10" delay={80} style={revealStyle}>
            <ExploreSolutions currentSlug={detail.slug} />
          </InViewReveal>
        </section>

        <div className={cn(sectionShell, sectionSpacing)}>
          <InViewReveal style={revealStyle}>
            <section
              aria-labelledby="solutions-final-cta"
              className="relative overflow-hidden rounded-xl border border-border/80 bg-card px-6 py-12 text-center shadow-[var(--surface-card-shadow)] sm:px-10 sm:py-14 lg:px-16 lg:py-16"
            >
              <p className="meta-label">Next step</p>
              <h2
                className="mx-auto mt-3 max-w-3xl font-heading text-3xl font-semibold tracking-tighter text-balance text-foreground sm:text-4xl lg:text-5xl"
                id="solutions-final-cta"
              >
                {detail.ctaHeadline}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                {detail.ctaSub}
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <StartFreeButton className="w-full sm:w-auto" />
                <DemoButton className="w-full sm:w-auto" />
              </div>
              <ul className="mx-auto mt-5 flex max-w-2xl flex-col items-center justify-center gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6 sm:text-sm">
                {[
                  "Free plan, no time limit",
                  "No card required",
                  "Start with the workflow your business already has",
                ].map((item) => (
                  <li className="flex items-center gap-2" key={item}>
                    <CheckCircle2
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-primary-ink"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </InViewReveal>
        </div>
      </PublicPageShell>
      <MarketingFooter />
    </div>
  );
}
