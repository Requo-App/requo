import type { CSSProperties } from "react";

import {
  CtaDemoButton,
  CtaPrimaryLink,
  CtaSection,
} from "@/components/marketing/cta-section";
import {
  faqItems,
  landingFeatureItems,
} from "@/components/marketing/marketing-data";
import { DashboardWalkthroughVideo } from "@/components/marketing/dashboard-walkthrough-video";
import { ScaledDashboardStage } from "@/components/marketing/scaled-dashboard-stage";
import { InViewReveal } from "@/components/marketing/in-view-reveal";
import { MarketingEyebrow } from "@/components/marketing/marketing-eyebrow";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeroParallax } from "@/components/marketing/marketing-hero-parallax";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import {
  MarketingFeatureRow,
} from "@/components/marketing/marketing-feature-row";
import { MarketingFeatureReveal } from "@/components/marketing/marketing-feature-reveal";
import { MarketingSectionHeader } from "@/components/marketing/marketing-section-header";
import { WorkflowSteps } from "@/components/marketing/workflow-steps";
import {
  ChecklistGraphic,
  IntegrationsGraphic,
  WorkflowGraphic,
} from "@/components/marketing/why-requo-graphics";
import { WhyRequoReveal } from "@/components/marketing/why-requo-reveal";
import { PublicPageShell } from "@/components/shared/public-page-shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const whyRequoPoints = [
  {
    setup: "They asked for a quote.",
    punchline: "You replied two days late.",
    detail: "You were on a job. By the time you sat down to write it, they'd already hired someone else. That's revenue lost to response time, not price.",
    graphic: "checklist",
  },
  {
    setup: "You forgot to follow up.",
    punchline: "The lead went cold.",
    detail: "No reminder, no system. Just another name you meant to get back to. Every missed follow-up is a deal that chose someone more responsive.",
    graphic: "workflow",
  },
  {
    setup: "Inquiries in email.",
    punchline: "Quotes in a spreadsheet.",
    detail: "Nothing connects. Leads slip through the cracks between tools, and you don't notice until it's too late.",
    graphic: "integrations",
  },
] as const;

const whyRequoGraphics = {
  checklist: ChecklistGraphic,
  workflow: WorkflowGraphic,
  integrations: IntegrationsGraphic,
} as const;

// Indexes map into `faqItems` in `components/marketing/marketing-data.ts`.
// Keep these ranges in sync if the list changes.
const faqGroups = [
  { label: "The basics", indexes: [0, 9, 10, 11] },
  { label: "Your workflow", indexes: [3, 4, 5, 6, 12, 13, 14] },
  { label: "Customers & team", indexes: [1, 2, 7, 8] },
] as const;

export function MarketingHero() {
  return (
    <div
      className="marketing-landing overflow-x-clip"
      data-marketing-flat-cards
    >
      <PublicPageShell
        brandSubtitle={null}
        brandSize="lg"
        className="public-page--flush pb-28 pt-0 lg:pb-40"
        header={<MarketingHeader />}
      >
      <section className="relative overflow-hidden pb-16 pt-8 sm:pb-24 sm:pt-10 lg:pb-32 lg:pt-12">
        <div className="marketing-shell-container marketing-hero-enter relative z-10 flex flex-col items-start">
          <div className="flex flex-col gap-3">
            <MarketingEyebrow>Built for service businesses</MarketingEyebrow>

            <h1 className="max-w-4xl text-balance font-sans text-[clamp(2.75rem,calc(4vw+1.5rem),4.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
              Manage every inquiry.
              <br />
              <span className="text-primary">Send every quote.</span>
            </h1>
          </div>

          <p className="mt-4 max-w-[36ch] text-pretty font-sans text-lg font-normal leading-[1.6] text-muted-foreground sm:text-xl sm:leading-[1.55]">
            Send quotes in minutes and follow up on&nbsp;time&nbsp;— so nothing
            slips through.
          </p>

          <div className="mt-6 flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:items-center">
            <CtaPrimaryLink className="w-full sm:w-auto" href="/signup" />
            <CtaDemoButton className="w-full sm:w-auto" />
          </div>

          <MarketingHeroParallax className="marketing-hero-visual mt-6 w-full sm:mt-8 lg:mt-12">
            <div aria-hidden="true" className="marketing-hero-glow" />
            {/* The window is a figure, not `role="img"`: the light-theme stage
                carries a real play/pause control, which an image role would
                hide from assistive technology. */}
            <figure className="marketing-hero-frame relative z-10">
              <figcaption className="sr-only">
                Requo product preview: the dashboard home with the business
                assistant, quote stats, and priority queue
              </figcaption>
              <div className="bg-card">
                <ScaledDashboardStage>
                  <DashboardWalkthroughVideo />
                </ScaledDashboardStage>
              </div>
            </figure>
            <div aria-hidden="true" className="marketing-hero-bottom-fade" />
          </MarketingHeroParallax>
        </div>
      </section>

      <section
        className="relative z-10 mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20 xl:px-0 xl:py-24"
        id="why-requo"
      >
        <MarketingSectionHeader
          eyebrow="Why Requo"
          intro="You’re busy doing the work. Requo gives every request a clear next step before it gets forgotten."
          title={
            <>
              <span className="block text-balance">Every missed inquiry is an opportunity</span>
              <span className="block text-primary sm:whitespace-nowrap">someone else can win.</span>
            </>
          }
        />

        <WhyRequoReveal className="relative z-10 mt-9 lg:mt-[3.25rem]">
          <ul className="grid gap-5 lg:grid-cols-3">
            {whyRequoPoints.map((point, index) => {
              const GraphicComponent = whyRequoGraphics[point.graphic];

              return (
                <li
                  className="mx-auto w-full max-w-[35rem] lg:max-w-none"
                  data-why-card
                  key={point.setup}
                  style={{ "--why-index": index } as CSSProperties}
                >
                  <article className="flex h-full flex-col">
                    <GraphicComponent />

                    <div className="flex flex-1 flex-col pb-6">
                      <span
                        aria-hidden="true"
                        className="mt-7 font-mono text-marketing-label text-muted-foreground"
                      >
                        0{index + 1}
                      </span>
                      <h3 className="mt-3 text-marketing-card-title">
                        <span className="block text-muted-foreground">
                          {point.setup}
                        </span>
                        <span className="block text-foreground">
                          {point.punchline}
                        </span>
                      </h3>
                      <p className="mt-2 text-marketing-body text-pretty text-muted-foreground">
                        {point.detail}
                      </p>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </WhyRequoReveal>
      </section>

      <section
        className="relative z-10 mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20 xl:px-0 xl:py-24"
        id="workflow"
      >
        <MarketingSectionHeader
          eyebrow="How it works"
          intro="Capture the request, send a quote, follow up on time, and know when it turns into work."
          title={
            <>
              Keep every{" "}
              <span className="text-primary">opportunity moving.</span>
            </>
          }
        />

        <InViewReveal className="relative z-10 mt-8 sm:mt-10 lg:mt-14">
          <WorkflowSteps />
        </InViewReveal>
      </section>

      <section
        className="relative z-10 mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20 xl:px-0 xl:py-24"
        id="features"
      >
        <MarketingSectionHeader
          eyebrow="The Requo business"
          intro="Capture requests, send professional quotes, and see what needs attention without switching tools."
          title={
            <>
              One connected workflow from inquiry to{" "}
              <span className="text-primary">accepted quote.</span>
            </>
          }
        />

        <div className="relative z-10 mt-14 flex flex-col gap-12 lg:mt-16 lg:gap-16">
          {landingFeatureItems.map((item, index) => (
            <MarketingFeatureReveal className="w-full" key={item.id}>
              <MarketingFeatureRow
                description={item.description}
                featureId={item.id}
                reverse={index % 2 === 1}
                title={item.title}
              />
            </MarketingFeatureReveal>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto mt-24 w-full max-w-4xl px-4 sm:mt-32 sm:px-6 lg:mt-40 lg:px-8 xl:px-0" id="faq">
        <InViewReveal className="relative z-10 flex flex-col items-start gap-3 sm:gap-4">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl lg:text-4xl xl:text-5xl">
            Questions you&rsquo;re probably asking.
          </h2>
          <p className="max-w-2xl text-sm leading-snug text-muted-foreground sm:text-base sm:leading-6 lg:text-lg lg:leading-7">
            Direct answers about how Requo works, what your customers see, and how it fits your workflow.
          </p>
        </InViewReveal>

        <div className="relative z-10 mt-8 flex flex-col gap-8 sm:mt-10 sm:gap-10">
          {faqGroups.map((group, groupIndex) => (
            <InViewReveal
              className="flex flex-col gap-2.5 sm:gap-3"
              delay={80 + groupIndex * 60}
              key={group.label}
            >
              <div className="flex items-center gap-2.5 sm:gap-3">
                <span className="font-mono text-[10px] font-semibold text-muted-foreground sm:text-[11px]">
                  0{groupIndex + 1}
                </span>
                <MarketingEyebrow>{group.label}</MarketingEyebrow>
              </div>

              <Accordion
                className="marketing-faq w-full border-t border-border/40"
                collapsible
                defaultValue={groupIndex === 0 ? "faq-0-0" : undefined}
                type="single"
              >
                {group.indexes.map((itemIndex, qIndex) => {
                  const item = faqItems[itemIndex];

                  if (!item) return null;

                  return (
                    <AccordionItem
                      className="marketing-faq-item border-b border-border/40"
                      key={item.question}
                      value={`faq-${groupIndex}-${qIndex}`}
                    >
                      <AccordionTrigger className="marketing-faq-trigger py-3.5 text-left text-sm font-medium tracking-tight text-foreground sm:py-4 sm:text-base lg:text-lg">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="marketing-faq-content pb-4 text-xs leading-snug text-muted-foreground sm:pb-5 sm:text-sm sm:leading-5 lg:text-base lg:leading-6">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </InViewReveal>
          ))}
        </div>
      </section>

      <InViewReveal className="mt-24 sm:mt-32 lg:mt-40" delay={120}>
        <CtaSection
          headline="Stop losing track of customer requests."
          headingId="home-final-cta"
          sub="Manage inquiries, send quotes, and follow up from one place."
        >
          <CtaPrimaryLink href="/signup" />
          <CtaDemoButton />
        </CtaSection>
      </InViewReveal>

      </PublicPageShell>
      <MarketingFooter />
    </div>
  );
}
