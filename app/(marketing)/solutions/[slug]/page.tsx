import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";

import { SolutionDetailPage } from "@/components/marketing/solutions/solution-detail";
import {
  getSolutionDetail,
  solutionLinks,
} from "@/components/marketing/solutions-data";
import { StructuredData } from "@/components/seo/structured-data";
import { absoluteUrl, createPageMetadata } from "@/lib/seo/site";
import {
  getBreadcrumbListStructuredData,
  getFaqPageStructuredData,
} from "@/lib/seo/structured-data";

export function generateStaticParams() {
  return solutionLinks.map((solution) => ({ slug: solution.slug }));
}

type SolutionSlugPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: SolutionSlugPageProps): Promise<Metadata> {
  const { slug } = await params;
  const solution = getSolutionDetail(slug);
  if (!solution) {
    return createPageMetadata({
      description: "Solution page coming soon.",
      noIndex: true,
      pathname: "/solutions",
      title: "Solution",
    });
  }
  return createPageMetadata({
    description: solution.seoDescription,
    pathname: `/solutions/${solution.slug}`,
    title: solution.seoTitle,
  });
}

export default async function SolutionSlugPage({
  params,
}: SolutionSlugPageProps) {
  "use cache";
  cacheLife("hours");

  const { slug } = await params;
  const solution = getSolutionDetail(slug);
  if (!solution) {
    notFound();
  }

  const faqStructuredData = getFaqPageStructuredData({
    items: [...solution.faqs],
  });
  const solutionLink = solutionLinks.find((item) => item.slug === solution.slug);
  const breadcrumbLabel = solutionLink?.title ?? solution.shortTitle;
  const breadcrumbStructuredData = getBreadcrumbListStructuredData({
    items: [
      { name: "Home", url: absoluteUrl("/") },
      { name: "Solutions", url: absoluteUrl("/solutions") },
      {
        name: breadcrumbLabel,
        url: absoluteUrl(`/solutions/${solution.slug}`),
      },
    ],
  });

  return (
    <>
      <StructuredData
        data={breadcrumbStructuredData}
        id="solution-breadcrumb-structured-data"
      />
      <StructuredData
        data={faqStructuredData}
        id="solution-faq-structured-data"
      />
      <SolutionDetailPage
        breadcrumbLabel={breadcrumbLabel}
        detail={solution}
      />
    </>
  );
}
