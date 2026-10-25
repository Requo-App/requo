import { updateTag } from "next/cache";

import {
  getBusinessMembersCacheTags,
  uniqueCacheTags,
} from "@/lib/cache/business-tags";
import {
  getUserBusinessContextCacheTags,
  getUserMembershipsCacheTags,
} from "@/lib/cache/shell-tags";

/**
 * Tags affected by a membership change. The business tags refresh the member
 * list; the user tags refresh the affected member's shell — business switcher
 * and cached business context — so a role change or removal takes effect on
 * that member's next request rather than after the shell cache expires.
 */
export function getMembershipChangeCacheTags({
  businessId,
  businessSlug,
  userId,
}: {
  businessId: string;
  businessSlug?: string | null;
  userId?: string | null;
}): string[] {
  return uniqueCacheTags([
    ...getBusinessMembersCacheTags(businessId),
    ...(userId ? getUserMembershipsCacheTags(userId) : []),
    ...(userId && businessSlug
      ? getUserBusinessContextCacheTags(userId, businessSlug)
      : []),
  ]);
}

export function updateMembershipChangeCacheTags({
  businessId,
  businessSlug,
  userId,
  extraTags = [],
}: {
  businessId: string;
  businessSlug?: string | null;
  userId?: string | null;
  extraTags?: string[];
}): void {
  const tags = uniqueCacheTags([
    ...getMembershipChangeCacheTags({ businessId, businessSlug, userId }),
    ...extraTags,
  ]);

  for (const tag of tags) {
    updateTag(tag);
  }
}
