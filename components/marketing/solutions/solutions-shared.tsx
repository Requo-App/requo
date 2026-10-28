import {
  ArrowRight,
  CheckCircle2,
  Eye,
  Link2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  getSolutionRelated,
  solutionHref,
  type SolutionCardData,
  type SolutionFaq,
  type SolutionFeature,
} from "@/components/marketing/solutions-data";
import type { SolutionDetail } from "@/components/marketing/solutions-data";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { InvoiceStatusBadge } from "@/features/invoices/components/invoice-status-badge";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";

/**
 * Single product-card shell used by the hero card, the demo tabs, and the
 * customer view — identical header, rows, total, and footer everywhere.
 */
export function SolutionCardShell({
  card,
  actions,
}: {
  card: SolutionCardData;
  actions?: ReactNode;
}) {
  const StatusIcon = card.invoiceStatus ? CheckCircle2 : Eye;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/40 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-tight text-foreground">
            {card.cardTitle}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {card.cardSubtitle}
          </p>
        </div>
        {card.invoiceStatus ? (
          <InvoiceStatusBadge status={card.invoiceStatus} />
        ) : (
          <QuoteStatusBadge status={card.quoteStatus} />
        )}
      </div>
      <dl className="flex flex-col gap-3.5 p-4 sm:p-5">
        {card.fields.map((field) => (
          <div
            className="flex items-baseline justify-between gap-4"
            key={field.label}
          >
            <dt className="meta-label shrink-0">{field.label}</dt>
            <dd className="truncate text-sm font-medium text-foreground">
              {field.value}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-border/60 pt-3.5">
          <dt className="meta-label shrink-0">{card.quoteLabel}</dt>
          <dd className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {card.quoteValue}
          </dd>
        </div>
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3.5 text-xs text-muted-foreground">
          <p className="inline-flex items-center gap-2">
            <StatusIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary-ink" />
            <span className="truncate">
              <span className="font-medium text-foreground">
                {card.statusValue}
              </span>
              {" · "}
              {card.statusLabel}
            </span>
          </p>
          {actions}
          <p className="leading-5">{card.note}</p>
        </div>
      </dl>
    </div>
  );
}

export function SolutionHeroCard({ card }: { card: SolutionCardData }) {
  return <SolutionCardShell card={card} />;
}

export function SolutionFeatures({
  items,
}: {
  items: readonly SolutionFeature[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      {items.map((item, index) => (
        <div
          className="soft-panel motion-lift group flex flex-col gap-2.5 hover:shadow-md"
          key={item.title}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
              <item.icon aria-hidden="true" className="size-4" />
            </span>
            <span aria-hidden="true" className="meta-label">
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>
          <h3 className="font-heading text-base font-semibold tracking-tight">
            {item.title}
          </h3>
          <p className="text-sm leading-5 text-muted-foreground">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

const customerViewPoints: readonly {
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    icon: Link2,
    title: "Secure link, no account needed",
    description:
      "Email it from Requo or drop it into WhatsApp, SMS, or Messenger. Customers open it on their phone and respond in one tap.",
  },
  {
    icon: Eye,
    title: "You see when it's viewed",
    description:
      "The first view stamps the quote and notifies you, so you know exactly when to nudge and when to wait.",
  },
  {
    icon: CheckCircle2,
    title: "Accept, decline, or request changes",
    description:
      "Revisions come back with per-item comments instead of a tangled email thread — then the quote goes out as a new version.",
  },
];

export function CustomerViewSection({
  view,
}: {
  view: SolutionCardData;
}) {
  return (
    <div className="grid items-stretch gap-3 sm:gap-4 lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col gap-3 sm:gap-4">
        {customerViewPoints.map((point) => (
          <div className="soft-panel flex gap-3.5" key={point.title}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
              <point.icon aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <h3 className="font-heading text-base font-semibold tracking-tight">
                {point.title}
              </h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {point.description}
              </p>
            </div>
          </div>
        ))}
      </div>
      <SolutionCardShell
        actions={
          <div
            aria-hidden="true"
            className="pointer-events-none flex flex-row gap-2 pt-1"
          >
            <Button size="sm" tabIndex={-1} type="button">
              Accept quote
            </Button>
            <Button size="sm" tabIndex={-1} type="button" variant="outline">
              Request changes
            </Button>
          </div>
        }
        card={view}
      />
    </div>
  );
}

export function SolutionFaq({
  items,
  slug,
}: {
  items: readonly SolutionFaq[];
  slug: string;
}) {
  return (
    <Accordion
      className="w-full border-t border-border/40"
      collapsible
      defaultValue={`${slug}-faq-0`}
      type="single"
    >
      {items.map((item, index) => (
        <AccordionItem
          className="border-b border-border/40"
          key={item.question}
          value={`${slug}-faq-${index}`}
        >
          <AccordionTrigger className="py-3.5 text-left text-sm font-medium tracking-tight text-foreground transition-colors hover:text-foreground/80 sm:py-4 sm:text-base">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="pb-4 text-xs leading-snug text-muted-foreground sm:pb-5 sm:text-sm sm:leading-5">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function SolutionsFinalCta({
  headline,
  sub,
  workflowHref,
}: {
  headline: string;
  sub: string;
  workflowHref: string;
}) {
  return (
    <section
      aria-labelledby="solutions-final-cta"
      className="relative flex flex-col items-center gap-6 py-10 text-center sm:gap-7 sm:py-14"
    >
      <h2
        className="max-w-3xl font-heading text-3xl font-bold tracking-tighter text-foreground sm:text-4xl lg:text-5xl"
        id="solutions-final-cta"
      >
        {headline}
      </h2>
      <p className="max-w-xl text-sm leading-5 text-muted-foreground sm:text-base sm:leading-7">
        {sub}
      </p>
      <div className="flex flex-row flex-wrap items-center justify-center gap-3">
        <Button
          asChild
          className="rounded-full px-6 font-mono text-xs font-semibold uppercase tracking-wider"
          size="lg"
        >
          <Link href="/signup">
            Start free
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
        <Button
          asChild
          className="rounded-full px-6 font-mono text-xs font-semibold uppercase tracking-wider"
          size="lg"
          variant="outline"
        >
          <Link href={workflowHref}>See the workflow</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground sm:text-sm">
        No complicated setup. Start with the workflow your business already
        has.
      </p>
    </section>
  );
}

export function RelatedSolutions({ detail }: { detail: SolutionDetail }) {
  const items = getSolutionRelated(detail);
  return (
    <ul
      aria-label="Related service business solutions"
      className="grid gap-3 sm:grid-cols-2 sm:gap-4"
    >
      {items.map(({ link, blurb }) => {
        const Icon = link.icon;
        return (
          <li key={link.slug}>
            <Link
              className="soft-panel motion-lift group flex h-full flex-col gap-2.5 hover:shadow-md"
              href={solutionHref(link.slug)}
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="font-heading text-base font-semibold tracking-tight">
                {link.title}
              </span>
              <span className="text-sm leading-5 text-muted-foreground">
                {blurb}
              </span>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-primary-ink">
                Explore solution
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)] group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
