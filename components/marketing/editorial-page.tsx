import Link from "next/link";
import type { ReactNode } from "react";

import { InViewReveal } from "@/components/marketing/in-view-reveal";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import {
  SolutionFaq,
  SolutionsFinalCta,
} from "@/components/marketing/solutions/solutions-shared";
import { PublicPageShell } from "@/components/shared/public-page-shell";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export type EditorialBreadcrumb = {
  name: string;
  href?: string;
};

export type EditorialFaq = {
  question: string;
  answer: string;
};

/**
 * Lean marketing template for feature, comparison, guide, about, and hub
 * pages: one H1, a 40–60 word definition block, custom
 * sections, FAQs, and the shared final CTA. Pages own their JSON-LD.
 */
export function EditorialPage({
  breadcrumbs,
  eyebrow,
  title,
  definition,
  secondaryCta,
  faqSlug,
  faqs,
  ctaHeadline,
  ctaSub,
  children,
}: {
  breadcrumbs?: readonly EditorialBreadcrumb[];
  eyebrow: string;
  title: string;
  definition: string;
  secondaryCta?: { label: string; href: string };
  faqSlug: string;
  faqs: readonly EditorialFaq[];
  ctaHeadline: string;
  ctaSub: string;
  children?: ReactNode;
}) {
  return (
    <div className="overflow-x-clip">
      <PublicPageShell
        brandSize="lg"
        brandSubtitle={null}
        className="pb-28 pt-0 lg:pb-40"
        header={<MarketingHeader />}
      >
        <section className="relative overflow-hidden px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pb-24 lg:pt-24 xl:px-0">
          <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start gap-5 sm:gap-6">
            <InViewReveal className="flex w-full flex-col items-start gap-5 sm:gap-6">
              {breadcrumbs && breadcrumbs.length > 0 ? (
                <nav aria-label="Breadcrumb">
                  <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {breadcrumbs.map((crumb, index) => (
                      <li
                        className="flex items-center gap-1.5"
                        key={crumb.name}
                      >
                        {index > 0 ? (
                          <span aria-hidden="true">/</span>
                        ) : null}
                        {crumb.href && index < breadcrumbs.length - 1 ? (
                          <Link
                            className="transition-colors hover:text-foreground"
                            href={crumb.href}
                          >
                            {crumb.name}
                          </Link>
                        ) : (
                          <span aria-current="page">{crumb.name}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </nav>
              ) : null}
              <p className="meta-label-plain text-primary-ink">{eyebrow}</p>
              <h1 className="max-w-3xl font-sans text-[2.5rem] font-normal leading-[1.08] tracking-[-0.035em] text-foreground sm:text-6xl sm:leading-[1.05] lg:text-[4.25rem]">
                {title}
              </h1>
              <p className="max-w-2xl font-sans text-[0.95rem] font-normal leading-snug text-muted-foreground sm:text-base lg:text-lg lg:leading-snug">
                {definition}
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
                {secondaryCta ? (
                  <Button
                    asChild
                    className="rounded-lg border-border/80 bg-secondary/30 px-6 font-mono text-xs font-medium uppercase tracking-wider text-foreground hover:bg-secondary/60"
                    size="lg"
                    variant="outline"
                  >
                    <Link href={secondaryCta.href}>
                      {secondaryCta.label}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </InViewReveal>
          </div>
        </section>

        {children}

        <section
          aria-labelledby={`${faqSlug}-faq-heading`}
          className="mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6 lg:px-8 xl:px-0"
        >
          <InViewReveal className="flex max-w-2xl flex-col items-start gap-3">
            <h2
              className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
              id={`${faqSlug}-faq-heading`}
            >
              Frequently asked questions
            </h2>
          </InViewReveal>
          <InViewReveal className="mt-8 sm:mt-10" delay={80}>
            <SolutionFaq
              items={faqs}
              slug={faqSlug}
            />
          </InViewReveal>
        </section>

        <InViewReveal className="mx-auto mt-20 w-full max-w-4xl px-4 sm:mt-28 sm:px-6 lg:px-8 xl:px-0">
          <SolutionsFinalCta
            headline={ctaHeadline}
            sub={ctaSub}
            workflowHref="/#workflow"
          />
        </InViewReveal>
      </PublicPageShell>
      <MarketingFooter />
    </div>
  );
}
