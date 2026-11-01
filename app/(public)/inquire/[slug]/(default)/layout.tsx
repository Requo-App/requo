import { notFound } from "next/navigation";

import { getPublicInquiryBusinessBySlug } from "@/features/inquiries/queries";

/**
 * Availability gate for the default service at `/inquire/[slug]`.
 *
 * Checks availability above this route's `loading.tsx` boundary; the page
 * reuses the same cached lookup. Other service routes have their own gate.
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
