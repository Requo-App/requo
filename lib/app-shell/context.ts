import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { homePath } from "@/features/businesses/routes";
import {
  getBusinessContextForMembershipSlug,
  type BusinessContext,
} from "@/lib/db/business-access";
import { requireSession, type AuthUser } from "@/lib/auth/session";

export type AppShellContext = {
  user: AuthUser;
  businessContext: BusinessContext;
};

/**
 * Single entry point for the authenticated business shell area.
 *
 * Resolves the current session and the business membership for the active
 * slug, redirecting to the businesses hub when the user has no access.
 *
 * Called once from `app/(business)/[businessSlug]/layout.tsx` and from each
 * page inside that segment. React.cache dedupes the work within a single
 * request, and the underlying `getBusinessContextForMembershipSlug` is
 * itself `"use cache"`-backed so repeat navigations stay fast.
 */
export const getAppShellContext = cache(
  async (slug: string): Promise<AppShellContext> => {
    const session = await requireSession();
    const businessContext = await getBusinessContextForMembershipSlug(
      session.user.id,
      slug,
    );

    if (!businessContext) {
      redirect(homePath);
    }

    return {
      user: session.user,
      businessContext,
    };
  },
);
