import { notFound } from "next/navigation";

import { getPublicInquiryBusinessBySlug } from "@/features/inquiries/queries";

/**
 * Existence gate for the public inquiry pages under `/inquire/[slug]`.
 *
 * Runs above the segment's `loading.tsx` boundary so an unknown business
 * answers `404`; the page reuses the same cached inquiry business lookup.
 */
export const instant = false;

export default async function PublicInquiryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const business = await getPublicInquiryBusinessBySlug(slug);

  if (!business) {
    notFound();
  }

  return children;
}
