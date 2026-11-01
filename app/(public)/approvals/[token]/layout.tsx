import { notFound } from "next/navigation";

import { getApprovalByCustomerToken } from "@/features/approvals/queries";

/**
 * Existence gate for public approval links.
 *
 * `notFound()` must run above the segment's `loading.tsx` boundary, otherwise
 * the response has already committed to `200`. The page reuses the same
 * request-cached token lookup, and blocking prerender preserves the real status.
 */
export const instant = false;

export default async function PublicApprovalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await getApprovalByCustomerToken(token);

  if (!view) {
    notFound();
  }

  return children;
}
