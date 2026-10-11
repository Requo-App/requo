"use client";

import { useAnimatedList } from "@/hooks/use-animated-list";
import { FollowUpBulkActions } from "@/features/follow-ups/components/follow-up-bulk-actions";
import { FollowUpItem } from "@/features/follow-ups/components/follow-up-item";
import type { TeamMemberOption } from "@/features/follow-ups/components/follow-up-reassign-dialog";
import type { FollowUpView } from "@/features/follow-ups/types";
import {
  completeFollowUpAction,
  deleteFollowUpAction,
  editFollowUpAction,
  reassignFollowUpAction,
  rescheduleFollowUpAction,
  skipFollowUpAction,
  snoozeFollowUpAction,
} from "@/features/follow-ups/actions";

type FollowUpListClientProps = {
  initialFollowUps: FollowUpView[];
  businessName?: string;
  businessSlug: string;
  members: TeamMemberOption[];
};

export function FollowUpListClient({
  initialFollowUps,
  businessName,
  businessSlug,
  members,
}: FollowUpListClientProps) {
  const { items: followUps, getMotionState, getItemRef, removeItem, removeItems } = useAnimatedList(initialFollowUps);

  return (
    <>
      <FollowUpBulkActions
        followUps={followUps}
        onOptimisticRemove={removeItems}
      />
      <div className="flex flex-col gap-2">
        {followUps.map((followUp) => (
          <FollowUpItem
            key={followUp.id}
            businessName={businessName}
            businessSlug={businessSlug}
            followUp={followUp}
            members={members}
            motionState={getMotionState(followUp.id)}
            itemRef={getItemRef(followUp.id)}
            onOptimisticRemove={() => removeItem(followUp.id)}
            completeAction={completeFollowUpAction.bind(null, followUp.id)}
            skipAction={skipFollowUpAction.bind(null, followUp.id)}
            rescheduleAction={rescheduleFollowUpAction.bind(null, followUp.id)}
            snoozeAction={snoozeFollowUpAction.bind(null, followUp.id)}
            editAction={editFollowUpAction.bind(null, followUp.id)}
            deleteAction={deleteFollowUpAction.bind(null, followUp.id)}
            reassignAction={reassignFollowUpAction.bind(null, followUp.id)}
          />
        ))}
      </div>
    </>
  );
}
