import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ChatInterface } from "@/features/agent/components/chat-interface";
import {
  buildAgentRecommendations,
  getPublicAgentBusiness,
  getPublicAgentStarterServices,
} from "@/features/agent/queries";
import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";
import { hasFeatureAccess } from "@/lib/plans/entitlements";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const business = await getPublicAgentBusiness(slug);

  // The Agent needs Pro+. A downgrade leaves `ai_agent_enabled` set, so the
  // plan gate is the other half of the condition: without it the route
  // stays discoverable and the visitor gets a chat whose first send fails.
  if (
    !business ||
    !business.agentEnabled ||
    !hasFeatureAccess(business.plan, "agent")
  ) {
    return { title: "Chat" };
  }

  return {
    title: `Chat with ${business.name}`,
    description:
      business.shortDescription ??
      `Chat with ${business.name} to get a quote for your project.`,
    robots: { index: false, follow: false },
  };
}

/**
 * Public Agent chat page at `/b/[slug]/chat`.
 *
 * Only renders when `ai_agent_enabled` is true for the business.
 * Returns 404 otherwise so the route is not discoverable for disabled agents.
 */
export default async function AgentChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const business = await getPublicAgentBusiness(slug);

  // The Agent needs Pro+. A downgrade leaves `ai_agent_enabled` set, so the
  // plan gate is the other half of the condition: without it the route
  // stays discoverable and the visitor gets a chat whose first send fails.
  if (
    !business ||
    !business.agentEnabled ||
    !hasFeatureAccess(business.plan, "agent")
  ) {
    notFound();
  }

  const starterServices = await getPublicAgentStarterServices(business.id);

  return (
    <ChatInterface
      businessSlug={business.slug}
      businessName={business.name}
      businessLogoUrl={business.logoUrl}
      recommendations={buildAgentRecommendations({
        businessName: business.name,
        services: starterServices,
      })}
      showWatermark={!hasFeatureAccess(business.plan, "removeWatermark")}
      fallbackFormHref={getBusinessPublicInquiryUrl(business.slug)}
    />
  );
}
