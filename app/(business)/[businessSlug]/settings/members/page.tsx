import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FeatureGate } from "@/features/entitlements";
import {
  getBusinessInviteLinkForBusiness,
  getBusinessMembersSettingsForBusiness,
} from "@/features/business-members/queries";
import { getBusinessBillingOverview } from "@/features/billing/queries";
import {
  cancelBusinessMemberInviteAction,
  createBusinessMemberInviteAction,
  getOrCreateBusinessInviteLinkAction,
  regenerateBusinessInviteLinkAction,
  removeBusinessMemberAction,
  updateBusinessMemberRoleAction,
} from "@/features/business-members/actions";
import {
  BusinessMembersManager,
  MembersStaticFallback,
} from "@/features/business-members/components/business-members-manager";
import { canManageBusinessAdministration } from "@/lib/business-members";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getBusinessSettingsPageContext } from "../_lib/page-context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Members",
  description: "Invite and manage team members for this business.",
});

export const instant = true;

/**
 * Members settings page — static shell paints instantly.
 *
 * The section title and description are static (like other settings
 * sections); only the member list, which needs DB values, streams behind
 * a static-look fallback. All dynamic reads (params,
 * getBusinessSettingsPageContext, queries) resolve inside the
 * Suspense-wrapped child server component. Same fallback as loading.tsx
 * so hard load and client navigation show identical regions.
 */
export default function BusinessMembersSettingsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <MembersSettingsHeading />
      <Suspense fallback={<MembersStaticFallback />}>
        <MembersRegion params={params} />
      </Suspense>
    </div>
  );
}

export function MembersSettingsHeading() {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        Manage Members
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">
        Manage the members of this business here.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suspense-wrapped async child server component
// ---------------------------------------------------------------------------

async function MembersRegion({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { user, businessContext } = await getBusinessSettingsPageContext(businessSlug);
  const canManage = canManageBusinessAdministration(businessContext.role);

  // Get billing overview for upgrade action
  const billingOverview = await getBusinessBillingOverview(
    businessContext.business.id,
  ).catch(() => null);

  const [view, inviteLink] = await Promise.all([
    getBusinessMembersSettingsForBusiness(
      businessContext.business.id,
      user.id,
    ),
    canManage
      ? getBusinessInviteLinkForBusiness(businessContext.business.id)
      : Promise.resolve(null),
  ]);

  if (!view) {
    notFound();
  }

  return (
    <FeatureGate
      feature="members"
      plan={businessContext.business.plan}
      variant="page"
      upgradeAction={
        billingOverview
          ? {
              userId: user.id,
              businessId: businessContext.business.id,
              businessSlug: businessContext.business.slug,
              currentPlan: billingOverview.currentPlan,
            }
          : undefined
      }
    >
      <BusinessMembersManager
        view={view}
        plan={businessContext.business.plan}
        inviteLinkToken={inviteLink?.token ?? null}
        cancelInviteAction={cancelBusinessMemberInviteAction}
        createInviteAction={createBusinessMemberInviteAction}
        removeMemberAction={removeBusinessMemberAction}
        updateRoleAction={updateBusinessMemberRoleAction}
        getOrCreateInviteLinkAction={getOrCreateBusinessInviteLinkAction}
        regenerateInviteLinkAction={regenerateBusinessInviteLinkAction}
        readOnly={!canManage}
      />
    </FeatureGate>
  );
}
