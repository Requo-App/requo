"use client";

import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { Fragment } from "react";

import { BrandMark } from "@/components/shared/brand-mark";
import { CtaSection } from "@/components/marketing/cta-section";
import { Button } from "@/components/ui/button";
import { PublicPageShell } from "@/components/shared/public-page-shell";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { cn } from "@/lib/utils";
import type { BillingCurrency } from "@/lib/billing/types";
import { PricingIntervalToggle } from "@/components/marketing/pricing-interval-toggle";
import {
  pricingComparison,
  aiDraftingClarification,
  pricingFaqs,
  proTrialSummary,
} from "@/lib/plans/catalog";
import { authClient } from "@/lib/auth/client";
import { homePath } from "@/features/businesses/routes";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/*──────────────────────────────────────────────────────────────────────────────
 * Component
 *────────────────────────────────────────────────────────────────────────────*/

export function PricingPage({
  currency,
}: {
  currency: BillingCurrency;
}) {
  return (
    <PublicPageShell
      brandSubtitle={null}
      brandSize="lg"
      className="pb-14 lg:pb-20"
      header={<MarketingHeader />}
    >
      {/* Hero */}
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 pb-0 pt-10 text-center sm:px-6 sm:pb-0 sm:pt-14 lg:px-8">
        <h1 className="font-heading text-4xl font-semibold leading-[1.02] tracking-tighter text-balance sm:text-5xl xl:text-[3.5rem]">
          Requo pricing: free, Pro, and Business plans
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base sm:leading-7">
          Requo pricing is per business: start free with the complete
          inquiry-to-payment workflow, then upgrade for automatic follow-ups,
          more live services, more AI drafting, and team access.{" "}
          {proTrialSummary}. Local pricing is shown for supported countries;
          subscriptions are billed per business in the currency shown at
          checkout.
        </p>
      </div>

      {/* Plan cards with toggle */}
      <PricingIntervalToggle currency={currency} />

      <section className="mx-auto w-full max-w-[76rem] rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-col gap-2 px-5 py-6 sm:px-8 sm:py-7">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Compare plans
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            See exactly what each plan includes. {aiDraftingClarification}
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border bg-muted">
                <th className="w-[40%] px-8 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Feature
                </th>
                <th className="w-[20%] px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Free
                </th>
                <th className="w-[20%] px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-foreground">
                  Pro
                </th>
                <th className="w-[20%] px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Business
                </th>
              </tr>
            </thead>
            <tbody>
              {pricingComparison.map((category) => (
                <Fragment key={category.category}>
                  <tr className="border-t border-border">
                    <td
                      colSpan={4}
                      className="px-8 pb-2 pt-6 text-xs font-semibold uppercase tracking-wider text-primary-ink"
                    >
                      {category.category}
                    </td>
                  </tr>
                  {category.features.map((row) => (
                    <tr
                      className="border-b border-border last:border-b-0"
                      key={row.label}
                    >
                      <td className="px-8 py-3.5 text-sm text-foreground">
                        {row.label}
                      </td>
                      <PricingCell value={row.free} />
                      <PricingCell value={row.pro} highlighted />
                      <PricingCell value={row.business} />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked view */}
        <div className="flex flex-col gap-0 md:hidden">
          {pricingComparison.map((category) => (
            <div key={category.category} className="border-t border-border">
              <p className="px-5 pb-2 pt-5 text-xs font-semibold uppercase tracking-wider text-primary-ink">
                {category.category}
              </p>
              <div className="flex flex-col">
                {category.features.map((row) => (
                  <div
                    key={row.label}
                    className="border-b border-border px-5 py-3.5 last:border-b-0"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {row.label}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Free
                        </p>
                        <p className="mt-1">
                          <MobileCell value={row.free} />
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-foreground">
                          Pro
                        </p>
                        <p className="mt-1">
                          <MobileCell value={row.pro} />
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Business
                        </p>
                        <p className="mt-1">
                          <MobileCell value={row.business} />
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section
        aria-labelledby="pricing-faq-heading"
        className="mx-auto mt-10 w-full max-w-3xl px-5 sm:px-6 lg:mt-14 lg:px-8"
      >
        <h2
          className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
          id="pricing-faq-heading"
        >
          Pricing questions, answered.
        </h2>
        <Accordion
          className="mt-4 w-full border-t border-border/40"
          collapsible
          defaultValue="pricing-faq-0"
          type="single"
        >
          {pricingFaqs.map((item, index) => (
            <AccordionItem
              className="border-b border-border/40"
              key={item.question}
              value={`pricing-faq-${index}`}
            >
              <AccordionTrigger className="py-3.5 text-left text-sm font-medium tracking-tight text-foreground transition-colors hover:text-foreground/80 sm:py-4 sm:text-base">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-xs leading-normal text-muted-foreground sm:pb-5 sm:text-sm sm:leading-6">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* CTA */}
      <CtaSection
        className="mt-10 lg:mt-14"
        headline="Stop losing leads to slow follow-up."
        headingId="pricing-cta-heading"
        sub="Every inquiry gets a response. Every quote gets a follow-up. Start capturing the revenue you're already generating interest for."
      >
        <PricingCtaActions />
      </CtaSection>

      {/* Brand and legal */}
      <div className="mx-auto mt-12 w-full max-w-[76rem] px-5 sm:px-6 lg:px-8 xl:px-0">
        <div className="flex flex-col gap-4 border-t border-border pt-6 lg:flex-row lg:items-center lg:justify-between">
          <BrandMark subtitle="Never lose a job to a slow response" />
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <Link className="transition-colors hover:text-foreground" href="/">
              Home
            </Link>
            <Link className="transition-colors hover:text-foreground" href="/privacy">
              Privacy Policy
            </Link>
            <Link className="transition-colors hover:text-foreground" href="/terms">
              Terms of Service
            </Link>
            <Link className="transition-colors hover:text-foreground" href="/refund-policy">
              Refund Policy
            </Link>
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}

/*──────────────────────────────────────────────────────────────────────────────
 * Helper components
 *────────────────────────────────────────────────────────────────────────────*/

function PricingCell({
  value,
  highlighted,
}: {
  value: string | boolean | number;
  highlighted?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3.5 text-center",
        highlighted ? "bg-muted" : "",
      )}
    >
      {typeof value === "boolean" ? (
        value ? (
          <Check className="mx-auto size-4 text-primary-ink" />
        ) : (
          <Minus className="mx-auto size-3.5 text-muted-foreground" />
        )
      ) : (
        <span className="text-sm font-medium tabular-nums text-foreground">
          {value}
        </span>
      )}
    </td>
  );
}

function MobileCell({ value }: { value: string | boolean | number }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto size-3.5 text-primary-ink" />
    ) : (
      <Minus className="mx-auto size-3 text-muted-foreground" />
    );
  }

  return (
    <span className="text-xs font-medium tabular-nums text-foreground">
      {value}
    </span>
  );
}

function PricingCtaActions() {
  const { data: session } = authClient.useSession();

  if (session?.user) {
    return (
      <Button asChild className="w-full font-mono text-xs uppercase tracking-wider sm:w-auto" size="lg">
        <Link href={homePath}>
          Go to dashboard
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button asChild className="w-full font-mono text-xs uppercase tracking-wider sm:w-auto" size="lg">
        <Link href="/signup">
          Start free
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
      <Button
        asChild
        className="w-full font-mono text-xs uppercase tracking-wider sm:w-auto"
        size="lg"
        variant="outline"
      >
        <Link href="/login">Log in</Link>
      </Button>
    </>
  );
}

