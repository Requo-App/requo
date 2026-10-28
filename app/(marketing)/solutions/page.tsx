import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";

import { EditorialPage } from "@/components/marketing/editorial-page";
import {
  solutionHref,
  solutionLinks,
} from "@/components/marketing/solutions-data";
import { StructuredData } from "@/components/seo/structured-data";
import { createPageMetadata } from "@/lib/seo/site";
import { getFaqPageStructuredData } from "@/lib/seo/structured-data";

export const metadata: Metadata = createPageMetadata({
  description:
    "Quote software for contractors, professional and IT services, creatives, photo/video and events, and custom fabrication and signage. Pick your industry and see the inquiry-to-paid workflow.",
  pathname: "/solutions",
  title: "Quote Software by Industry",
});

const hubFaqs = [
  {
    question: "Which industries does Requo fit?",
    answer:
      "Requo fits service businesses that quote custom scope: contractors and home services, professional and IT services, creative and marketing studios, photo/video and event services, and custom fabrication and signage shops.",
  },
  {
    question: "How is each solution different?",
    answer:
      "The loop is the same — inquiry to quote to follow-up to invoice — but each industry page shows its own fields, attachments, workflow stages, and FAQs, from property photos to shoot dates to fabrication specs.",
  },
  {
    question: "Can I use Requo for more than one trade?",
    answer:
      "Yes. One login can manage multiple businesses with separate inquiries, quotes, services, quote libraries, and branding for each.",
  },
] as const;

export default async function SolutionsHubPage() {
  "use cache";
  cacheLife("hours");

  const faqStructuredData = getFaqPageStructuredData({ items: [...hubFaqs] });

  return (
    <>
      <StructuredData
        data={faqStructuredData}
        id="solutions-hub-faq-structured-data"
      />
      <EditorialPage
        ctaHeadline="Find your workflow."
        ctaSub="Pick your industry and see the inquiry-to-paid loop with your fields."
        definition="Requo is quote software by industry: contractors, professional and IT consultants, creatives, photo/video and event producers, and custom fabrication and signage shops each get tailored inquiry fields, quote line items, follow-ups, and invoicing — one connected loop from first request to paid."
        eyebrow="Solutions"
        faqSlug="solutions-hub"
        faqs={[...hubFaqs]}
        secondaryCta={{ href: "/pricing", label: "See pricing" }}
        title="Quote software by industry"
      >
        <section
          aria-label="Solutions by industry"
          className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 xl:px-0"
        >
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {solutionLinks.map((solution) => {
              const Icon = solution.icon;
              return (
                <li key={solution.slug}>
                  <Link
                    className="soft-panel motion-lift group flex h-full flex-col gap-2.5 hover:shadow-md"
                    href={solutionHref(solution.slug)}
                  >
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="font-heading text-base font-semibold tracking-tight">
                      {solution.title}
                    </span>
                    <span className="text-sm leading-6 text-muted-foreground">
                      {solution.description}
                    </span>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-primary-ink">
                      Explore solution
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </EditorialPage>
    </>
  );
}
