import type { Metadata } from "next";
import { Suspense } from "react";

import { createNoIndexMetadata } from "@/lib/seo/site";
import {
  BusinessMemberInviteContent,
  BusinessMemberInviteFallback,
  getInviteForToken,
} from "@/features/business-members/components/invite-accept";

const inviteFallbackMetadata = createNoIndexMetadata({
  absoluteTitle: "Business invite",
  description: "Review a business access invite securely.",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const { invite, inviteLink } = await getInviteForToken(token);
  const businessName = invite?.businessName ?? inviteLink?.businessName;

  if (!businessName) {
    return inviteFallbackMetadata;
  }

  return createNoIndexMetadata({
    absoluteTitle: `Join ${businessName}`,
    description: `Accept your invite to access ${businessName} on Requo.`,
  });
}

export default function BusinessMemberInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<BusinessMemberInviteFallback />}>
      <InviteRouteContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function InviteRouteContent({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const [{ token }, { error }] = await Promise.all([params, searchParams]);

  return <BusinessMemberInviteContent token={token} errorParam={error} />;
}
