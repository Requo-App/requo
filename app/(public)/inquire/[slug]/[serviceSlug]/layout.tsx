import { notFound } from "next/navigation";

import { getPublicInquiryBusinessByServiceSlug } from "@/features/inquiries/queries";

/**
 * Existence gate for a public service form under `/inquire/[slug]/[service]`.
 *
 * Runs above the segment's `loading.tsx` boundary so an unknown service
 * answers `404`; the page reuses the same cached lookup.
 */
export const instant = false;

export default async function PublicInquiryServiceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; serviceSlug: string }>;
}) {
  const { slug, serviceSlug } = await params;
  const business = await getPublicInquiryBusinessByServiceSlug({
    businessSlug: slug,
    serviceSlug,
  });

  if (!business) {
    notFound();
  }

  return children;
}
