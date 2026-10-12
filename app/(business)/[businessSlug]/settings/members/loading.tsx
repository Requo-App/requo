import { MembersStaticFallback } from "@/features/business-members/components/business-members-manager";

import { MembersSettingsHeading } from "./page";

/**
 * Mirrors BusinessMembersSettingsPage: the static section title and
 * description paint instantly, only the DB-backed member list shows
 * skeletons — no full-page gray flash.
 */
export default function BusinessMembersSettingsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <MembersSettingsHeading />
      <MembersStaticFallback />
    </div>
  );
}
