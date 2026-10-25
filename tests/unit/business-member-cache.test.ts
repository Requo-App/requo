import { beforeEach, describe, expect, it, vi } from "vitest";

const updateTag = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ updateTag }));

import {
  getMembershipChangeCacheTags,
  updateMembershipChangeCacheTags,
} from "@/features/business-members/cache";

const businessTags = [
  "business:b1",
  "business:b1:settings",
  "business:b1:members",
];

describe("membership change cache tags", () => {
  beforeEach(() => {
    updateTag.mockClear();
  });

  it("includes the affected member's shell tags without duplicates", () => {
    expect(
      getMembershipChangeCacheTags({
        businessId: "b1",
        businessSlug: "acme",
        userId: "u1",
      }),
    ).toEqual([
      ...businessTags,
      "user:u1",
      "user:u1:memberships",
      "user:u1:business-context:acme",
    ]);
  });

  it("omits user-scoped tags when the affected user is unknown", () => {
    expect(getMembershipChangeCacheTags({ businessId: "b1" })).toEqual(
      businessTags,
    );
  });

  it("updates every unique tag and any extra tags exactly once", () => {
    updateMembershipChangeCacheTags({
      businessId: "b1",
      businessSlug: "acme",
      userId: "u1",
      extraTags: ["user:u1:pending-invites", "business:b1:members"],
    });

    expect(updateTag.mock.calls.map(([tag]) => tag)).toEqual([
      ...businessTags,
      "user:u1",
      "user:u1:memberships",
      "user:u1:business-context:acme",
      "user:u1:pending-invites",
    ]);
  });
});
