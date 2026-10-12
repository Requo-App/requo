/**
 * Cache tags and lifetimes for dashboard shell data.
 *
 * Shell queries (theme preference, user profile, business memberships, billing
 * overview) run on every layout render. Caching them avoids re-fetching on
 * sibling navigations while the data hasn't changed.
 */

import { uniqueCacheTags } from "@/lib/cache/business-tags";

/* -------------------------------------------------------------------------- */
/*  Cache lifetimes                                                           */
/* -------------------------------------------------------------------------- */

/** Theme and user profile — rarely change, safe to cache longer. */
export const userShellCacheLife = {
  stale: 120,
  revalidate: 120,
  expire: 600,
} as const;

/** Business memberships — invalidated by business mutations. */
export const membershipShellCacheLife = {
  stale: 60,
  revalidate: 60,
  expire: 300,
} as const;

/** Billing overview — changes on subscription events. */
export const billingShellCacheLife = {
  stale: 120,
  revalidate: 120,
  expire: 600,
} as const;

/* -------------------------------------------------------------------------- */
/*  Tag helpers                                                               */
/* -------------------------------------------------------------------------- */

function getUserScopeTag(userId: string) {
  return `user:${userId}`;
}

function getBusinessScopeTag(businessId: string) {
  return `business:${businessId}`;
}

export function getUserThemeCacheTags(userId: string) {
  const scopeTag = getUserScopeTag(userId);

  return uniqueCacheTags([scopeTag, `${scopeTag}:theme`]);
}

export function getUserUiScaleCacheTags(userId: string) {
  const scopeTag = getUserScopeTag(userId);

  return uniqueCacheTags([scopeTag, `${scopeTag}:ui-scale`]);
}

export function getUserProfileCacheTags(userId: string) {
  const scopeTag = getUserScopeTag(userId);

  return uniqueCacheTags([scopeTag, `${scopeTag}:profile`]);
}

export function getUserMembershipsCacheTags(userId: string) {
  const scopeTag = getUserScopeTag(userId);

  return uniqueCacheTags([scopeTag, `${scopeTag}:memberships`]);
}

export function getUserBusinessContextCacheTags(
  userId: string,
  businessSlug: string,
) {
  const scopeTag = getUserScopeTag(userId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:memberships`,
    `${scopeTag}:business-context:${businessSlug}`,
  ]);
}

export function getBusinessBillingCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([scopeTag, `${scopeTag}:billing`]);
}

export function getUserPendingInvitesCacheTags(userId: string) {
  const scopeTag = getUserScopeTag(userId);

  return uniqueCacheTags([scopeTag, `${scopeTag}:pending-invites`]);
}

