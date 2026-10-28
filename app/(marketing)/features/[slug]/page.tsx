import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import Link from "next/link";

import { EditorialPage } from "@/components/marketing/editorial-page";
import {
  featureHref,
  getFeatureDetail,
  featureDetails,
} from "@/components/marketing/features-data";
import { InViewReveal } from "@/components/marketing/in-view-reveal";
import { StructuredData } from "@/components/seo/structured-data";
import { absoluteUrl, createPageMetadata } from "@/lib/seo/site";
import {
  getBreadcrumbListStructuredData,
  getFaqPageStructuredData,
} from "@/lib/seo/structured-data";

export function generateStaticParams() {
  return Object.keys(featureDetails).map((slug) => ({ slug }));
}

type FeatureSlugPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: FeatureSlugPageProps): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeatureDetail(slug);
  if (!feature) {
    return createPageMetadata({
      description: "Feature page coming soon.",
      noIndex: true,
      pathname: "/",
      title: "Feature",
    });
  }
  return createPageMetadata({
    description: feature.seoDescription,
    pathname: `/features/${feature.slug}`,
    title: feature.seoTitle,
  });
}

export default async function FeatureSlugPage({
  params,
}: FeatureSlugPageProps) {
  "use cache";
  cacheLife("hours");

  const { slug } = await params;
  const feature = getFeatureDetail(slug);
  if (!feature) {
    notFound();
  }

  const breadcrumbStructuredData = getBreadcrumbListStructuredData({
    items: [
      { name: "Home", url: absoluteUrl("/") },
      {
        name: feature.label,
        url: absoluteUrl(`/features/${feature.slug}`),
      },
    ],
  });
  const faqStructuredData = getFaqPageStructuredData({
    items: [...feature.faqs],
  });

  const related = feature.related
    .map((relatedSlug) => getFeatureDetail(relatedSlug))
    .filter((entry) => entry !== undefined);

  return (
    <>
      <StructuredData
        data={breadcrumbStructuredData}
        id="feature-breadcrumb-structured-data"
      />
      <StructuredData
        data={faqStructuredData}
        id="feature-faq-structured-data"
      />
      <EditorialPage
        breadcrumbs={[{ name: "Home", href: "/" }, { name: feature.label }]}
        ctaHeadline={feature.ctaHeadline}
        ctaSub={feature.ctaSub}
        definition={feature.definition}
        eyebrow={`Features / ${feature.label}`}
        faqSlug={`feature-${feature.slug}`}
        faqs={[...feature.faqs]}
        secondaryCta={{ href: "/pricing", label: "See pricing" }}
        title={feature.headline}
      >
        <section
          aria-label={`${feature.label} capabilities`}
          className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 xl:px-0"
        >
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {feature.points.map((point, index) => (
              <InViewReveal delay={80 + index * 45} key={point.title}>
                <div className="soft-panel flex h-full flex-col gap-2.5">
                  <span
                    aria-hidden="true"
                    className="meta-label"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 className="font-heading text-base font-semibold tracking-tight">
                    {point.title}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {point.body}
                  </p>
                </div>
              </InViewReveal>
            ))}
          </div>
        </section>

        {related.length > 0 ? (
          <section
            aria-label="Related features"
            className="mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6 lg:px-8 xl:px-0"
          >
            <InViewReveal className="flex max-w-2xl flex-col items-start gap-3">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Keep exploring.
              </h2>
            </InViewReveal>
            <ul className="mt-8 grid gap-3 sm:grid-cols-3 sm:gap-4">
              {related.map((entry) => (
                <li key={entry.slug}>
                  <Link
                    className="soft-panel motion-lift group flex h-full flex-col gap-2 hover:shadow-md"
                    href={featureHref(entry.slug)}
                  >
                    <span className="font-heading text-base font-semibold tracking-tight">
                      {entry.label}
                    </span>
                    <span className="text-sm leading-6 text-muted-foreground">
                      {entry.query}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </EditorialPage>
    </>
  );
}
