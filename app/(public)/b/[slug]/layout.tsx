import { notFound } from "next/navigation";

import { getPublicAgentBusiness } from "@/features/agent/queries";

/**
 * Existence gate for the public business surfaces under `/b/[slug]`.
 *
 * `notFound()` has to run above each child segment's `loading.tsx` boundary to
 * keep a real `404`; the pages reuse the same request-cached business lookup.
 */
export const instant = false;

export default async function PublicBusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const business = await getPublicAgentBusiness(slug);

  if (!business) {
    notFound();
  }

  return children;
}
