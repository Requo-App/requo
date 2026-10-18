import {
  ArrowRight,
  BellRing,
  FileText,
  Inbox,
} from "lucide-react";
import Link from "next/link";

import { BookDemoDialog } from "@/components/marketing/book-demo-dialog";

import {
  faqItems,
  landingFeatureItems,
} from "@/components/marketing/marketing-data";
import { DashboardWalkthroughVideo } from "@/components/marketing/dashboard-walkthrough-video";
import { ScaledDashboardStage } from "@/components/marketing/scaled-dashboard-stage";
import { InViewReveal } from "@/components/marketing/in-view-reveal";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import {
  MarketingFeatureRow,
} from "@/components/marketing/marketing-feature-row";
import { WorkflowTabs } from "@/components/marketing/workflow-tabs";
import {
  ChecklistGraphic,
  IntegrationsGraphic,
  WorkflowGraphic,
} from "@/components/marketing/why-requo-graphics";
import { PublicPageShell } from "@/components/shared/public-page-shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

const whyRequoPoints = [
  {
    hook: "They asked for a quote.\nYou replied two days late.",
    detail: "You were on a job. By the time you sat down to write it, they'd already hired someone else. That's revenue lost to response time, not price.",
    icon: FileText,
    graphic: "checklist",
  },
  {
    hook: "You forgot to follow up.\nThe lead went cold.",
    detail: "No reminder, no system. Just another name you meant to get back to. Every missed follow-up is a deal that chose someone more responsive.",
    icon: BellRing,
    graphic: "workflow",
  },
  {
    hook: "Inquiries in email.\nQuotes in a spreadsheet.",
    detail: "Nothing connects. Leads slip through the cracks between tools, and you don't notice until it's too late.",
    icon: Inbox,
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
    <div className="overflow-x-clip" data-marketing-flat-cards>
      <PublicPageShell
        brandSubtitle={null}
        brandSize="lg"
        className="pb-28 pt-0 lg:pb-40"
        header={<MarketingHeader />}
      >
      <section className="relative overflow-hidden px-5 pb-14 pt-12 sm:px-6 sm:pb-28 sm:pt-16 lg:px-8 lg:pb-36 lg:pt-24 xl:px-0">
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start gap-8 sm:gap-10 lg:gap-12">
          <div className="flex w-full max-w-4xl flex-col items-start gap-5 text-left sm:gap-5">
            <h1 className="text-balance font-sans text-[2.75rem] font-medium leading-[1.02] tracking-[-0.04em] text-foreground sm:text-[3.75rem] sm:leading-[1.08] sm:tracking-[-0.035em] lg:text-[4.75rem] lg:leading-[1.05]">
              Manage every inquiry.
              <br />
              <span className="text-primary">Send every quote.</span>
            </h1>
            <p className="max-w-md font-sans text-[0.9375rem] font-normal leading-[1.6] text-muted-foreground sm:max-w-xl sm:text-base lg:text-lg lg:leading-snug">
              Capture inquiries, send quotes, and follow up on time — all in one place.
            </p>

            <div className="flex flex-row items-center gap-3 pt-2">
              <Button asChild size="lg" className="rounded-lg bg-primary px-6 font-mono text-xs font-medium uppercase tracking-wider text-primary-foreground hover:bg-primary/90">
                <Link href="/signup">
                  Start free
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <BookDemoDialog
                size="lg"
                variant="outline"
                className="rounded-lg border-border/80 bg-secondary/30 px-6 font-mono text-xs font-medium uppercase tracking-wider text-foreground hover:bg-secondary/60"
              >
                Book a demo
              </BookDemoDialog>
            </div>
          </div>

          <div className="w-full">
            {/* Device frame. A figure, not `role="img"`: the stage now carries
                a real play/pause control, which an image role would hide from
                assistive technology. */}
            <figure className="rounded-xl border border-border/80 bg-card/40 p-1.5 sm:p-2 dark:border-border/60 dark:bg-card/30">
              <figcaption className="sr-only">
                Recorded Requo walkthrough: the dashboard home with the business
                assistant, quote stats, and priority queue, an inquiry filtered
                out of the inbox, and a quote priced and saved as a draft
              </figcaption>
              <div className="overflow-hidden rounded-xl bg-background">
                <ScaledDashboardStage>
                  <DashboardWalkthroughVideo />
                </ScaledDashboardStage>
              </div>
            </figure>
          </div>
        </div>
      </section>

      <div className="mx-auto h-px w-full max-w-6xl bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      <section
        className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 sm:mt-32 sm:px-6 lg:mt-40 lg:px-8 xl:px-0"
        id="why-requo"
      >
        <InViewReveal className="relative z-10 grid gap-6 lg:grid-cols-2 lg:gap-12 xl:gap-16">
          <div className="flex flex-col gap-4">
            <p className="meta-label !text-primary">WHY REQUO</p>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl lg:text-4xl xl:text-5xl">
              Every missed inquiry is an opportunity someone else can win.
            </h2>
          </div>
          <div className="flex items-center">
            <p className="text-sm leading-snug text-muted-foreground sm:text-base sm:leading-6 lg:text-lg lg:leading-7">
              You&rsquo;re busy doing the work. Requo gives every request a clear next step before it gets forgotten.
            </p>
          </div>
        </InViewReveal>

        <div className="relative z-10 mt-14 grid gap-4 sm:mt-16 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3 lg:gap-5">
          {whyRequoPoints.map((point, index) => {
            const Icon = point.icon;
            const GraphicComponent = whyRequoGraphics[point.graphic];

            return (
              <InViewReveal delay={80 + index * 60} key={point.hook}>
                <article className="surface-card group relative flex h-full flex-col overflow-hidden rounded-2xl">
                  <GraphicComponent />

                  {/* Content */}
                  <div className="flex flex-col gap-5 p-6 sm:p-7">
                    <div className="flex items-center justify-between">
                      <span className="flex size-11 items-center justify-center rounded-xl border border-primary/15 bg-primary/8">
                        <Icon className="size-[18px] text-primary" />
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-muted-foreground/50">
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="whitespace-pre-line text-[0.95rem] font-semibold leading-snug tracking-tight text-foreground sm:text-base">
                      {point.hook}
                    </h3>
                    <p className="text-sm leading-snug text-muted-foreground">
                      {point.detail}
                    </p>
                  </div>
                </article>
              </InViewReveal>
            );
          })}
        </div>
      </section>

      <section
        className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 sm:mt-32 sm:px-6 lg:mt-40 lg:px-8 xl:px-0"
        id="workflow"
      >
        <InViewReveal className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <p className="meta-label !text-primary">HOW IT WORKS</p>
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl lg:text-4xl xl:text-5xl">
            Keep every opportunity moving.
          </h2>
          <p className="max-w-lg text-sm leading-snug text-muted-foreground sm:text-base sm:leading-6">
            Capture the request, send a quote, follow up on time, and know when it turns into work.
          </p>
        </InViewReveal>

        <InViewReveal className="relative z-10 mt-14 sm:mt-16 lg:mt-20">
          <WorkflowTabs />
        </InViewReveal>
      </section>

      <section
        className="relative z-10 left-1/2 mt-24 w-screen -translate-x-1/2 overflow-x-clip py-16 sm:mt-32 sm:py-20 lg:mt-40 lg:py-24"
        id="features"
      >
        <InViewReveal className="relative z-10 mx-auto grid w-full max-w-6xl gap-4 px-4 sm:gap-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end lg:px-8 xl:px-0">
          <div className="relative z-10 flex flex-col gap-3 sm:gap-4">
            <p className="relative z-10 meta-label !text-primary">THE REQUO WORKSPACE</p>
            <h2 className="relative z-10 max-w-3xl font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl lg:text-4xl xl:text-5xl">
              One connected workflow from inquiry to accepted quote.
            </h2>
          </div>
          <div className="relative z-10">
            <p className="relative z-10 max-w-md text-sm leading-snug text-muted-foreground sm:text-base sm:leading-6 lg:pb-1">
              Capture requests, send professional quotes, and see what needs attention without switching tools.
            </p>
          </div>
        </InViewReveal>

        <div className="relative z-10 mt-10 flex flex-col sm:mt-12">
          {landingFeatureItems.map((item, index) => (
            <InViewReveal className="w-full" delay={80 + index * 45} key={item.id}>
              <MarketingFeatureRow
                description={item.description}
                featureId={item.id}
                reverse={index % 2 === 1}
                title={item.title}
              />
            </InViewReveal>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto mt-24 w-full max-w-4xl px-4 sm:mt-32 sm:px-6 lg:mt-40 lg:px-8 xl:px-0" id="faq">
        <InViewReveal className="relative z-10 flex flex-col items-start gap-3 sm:gap-4">
          <p className="meta-label !text-primary">FAQ</p>
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
              <div className="flex items-baseline gap-2.5 sm:gap-3">
                <span className="font-mono text-[9px] font-semibold text-muted-foreground/60 sm:text-[10px]">
                  0{groupIndex + 1}
                </span>
                <p className="meta-label text-primary">{group.label}</p>
              </div>

              <Accordion
                className="w-full border-t border-border/40"
                collapsible
                defaultValue={groupIndex === 0 ? "faq-0-0" : undefined}
                type="single"
              >
                {group.indexes.map((itemIndex, qIndex) => {
                  const item = faqItems[itemIndex];

                  if (!item) return null;

                  return (
                    <AccordionItem
                      className="border-b border-border/40"
                      key={item.question}
                      value={`faq-${groupIndex}-${qIndex}`}
                    >
                      <AccordionTrigger className="py-3.5 text-left text-sm font-medium tracking-tight text-foreground sm:py-4 sm:text-base lg:text-lg hover:text-foreground/80 transition-colors">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="pb-4 text-xs leading-snug text-muted-foreground sm:pb-5 sm:text-sm sm:leading-5 lg:text-base lg:leading-6">
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

      <InViewReveal
        className="mx-auto mt-24 w-full max-w-4xl px-4 sm:mt-32 sm:px-6 lg:mt-40 lg:px-8 xl:px-0"
        delay={120}
      >
        <section className="relative flex flex-col items-center gap-6 py-10 text-center sm:gap-8 sm:py-14">
          <h2 className="max-w-3xl font-heading text-3xl font-bold tracking-tighter text-foreground sm:text-4xl lg:text-5xl xl:text-6xl">
            Stop losing track of customer requests.
          </h2>

          <Button asChild size="lg" className="rounded-full px-6 font-mono text-xs font-semibold uppercase tracking-wider">
            <Link href="/signup">
              Start free
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>

          <p className="text-xs text-muted-foreground sm:text-sm">
            Manage inquiries, send quotes, and follow up from one place.
          </p>
        </section>
      </InViewReveal>

      </PublicPageShell>
      <MarketingFooter />
    </div>
  );
}
