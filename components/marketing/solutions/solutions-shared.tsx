import {
  CheckCircle2,
  Eye,
  Link2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  CtaPrimaryLink,
  CtaSecondaryLink,
  CtaSection,
} from "@/components/marketing/cta-section";
import type {
  SolutionCardData,
  SolutionFaq,
  SolutionFeature,
} from "@/components/marketing/solutions-data";
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
      "Each view updates the quote's timestamp and notifies you, so you know when to nudge and when to wait.",
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
      className="marketing-faq w-full border-t border-border/40"
      collapsible
      defaultValue={`${slug}-faq-0`}
      type="single"
    >
      {items.map((item, index) => (
        <AccordionItem
          className="marketing-faq-item border-b border-border/40"
          key={item.question}
          value={`${slug}-faq-${index}`}
        >
          <AccordionTrigger className="marketing-faq-trigger py-3.5 text-left text-sm font-medium tracking-tight text-foreground sm:py-4 sm:text-base lg:text-lg">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="marketing-faq-content pb-4 text-xs leading-snug text-muted-foreground sm:pb-5 sm:text-sm sm:leading-5 lg:text-base lg:leading-6">
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
    <CtaSection
      headline={headline}
      headingId="solutions-final-cta"
      sub={sub}
    >
      <CtaPrimaryLink href="/signup" />
      <CtaSecondaryLink href={workflowHref}>See the workflow</CtaSecondaryLink>
    </CtaSection>
  );
}
