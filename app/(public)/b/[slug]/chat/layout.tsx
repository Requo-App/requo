import { notFound } from "next/navigation";

import { getPublicAgentChatBusiness } from "@/features/agent/queries";

/**
 * Agent availability gate for `/b/[slug]/chat`.
 *
 * Runs above the chat segment's `loading.tsx` boundary so a business without
 * the Agent feature answers `404` instead of a streamed `200`.
 */
export const instant = false;

export default async function PublicAgentChatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const business = await getPublicAgentChatBusiness(slug);

  if (!business) {
    notFound();
  }

  return children;
}
