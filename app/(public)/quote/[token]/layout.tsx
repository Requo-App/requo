import { notFound } from "next/navigation";

import { getPublicQuoteByToken } from "@/features/quotes/queries";

/**
 * Existence gate for public quote links.
 *
 * `notFound()` has to run before the segment's `loading.tsx` boundary commits
 * the response, or Next keeps the streamed `200` status. This layout sits above
 * that boundary, so a dead token answers a real `404`; the page's lookup is the
 * same request-cached call and reuses the result.
 *
 * Blocking prerender is deliberate: this route trades the static shell for a
 * truthful status code, which Cache Components only allows with an explicit
 * opt-out.
 */
export const instant = false;

export default async function PublicQuoteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const quote = await getPublicQuoteByToken(token);

  if (!quote) {
    notFound();
  }

  return children;
}
