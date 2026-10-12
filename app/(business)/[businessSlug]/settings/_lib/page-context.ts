import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import {
  getBusinessHomePath,
} from "@/features/businesses/routes";
import { homePath } from "@/features/businesses/routes";
import {
  getBusinessContextForMembershipSlug,
  hasOperationalBusinessAccess,
  requireCurrentBusinessContext,
} from "@/lib/db/business-access";
import { requireUser } from "@/lib/auth/session";

async function getScopedBusinessSettingsContext(businessSlug?: string | null) {
  if (!businessSlug) {
    return requireCurrentBusinessContext();
  }

  const user = await requireUser();
  const businessContext = await getBusinessContextForMembershipSlug(
    user.id,
    businessSlug,
  );

  if (!businessContext) {
    redirect(homePath);
  }

  return {
    user,
    businessContext,
  };
}

export const getBusinessSettingsPageContext = cache(async (businessSlug?: string) => {
  return getScopedBusinessSettingsContext(businessSlug);
});

export const getBusinessOperationalPageContext = cache(async (businessSlug?: string) => {
  const context = await getScopedBusinessSettingsContext(businessSlug);

  if (!hasOperationalBusinessAccess(context.businessContext.role)) {
    redirect(getBusinessHomePath(context.businessContext.business.slug));
  }

  return context;
});

export const getBusinessOwnerPageContext = cache(async (businessSlug?: string) => {
  const context = await getScopedBusinessSettingsContext(businessSlug);

  if (context.businessContext.role !== "owner") {
    redirect(getBusinessHomePath(context.businessContext.business.slug));
  }

  return context;
});
