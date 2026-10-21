"use client";

import { useState } from "react";
import { UserRoundCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  ResponsiveOverlay,
  ResponsiveOverlayClose,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
  ResponsiveOverlayTrigger,
} from "@/components/ui/responsive-overlay";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useDeferredActionState } from "@/hooks/use-deferred-action-state";
import type { FollowUpReassignActionState } from "@/features/follow-ups/types";

type ReassignAction = (
  state: FollowUpReassignActionState,
  formData: FormData,
) => Promise<FollowUpReassignActionState>;

export type TeamMemberOption = {
  userId: string;
  name: string;
  email: string;
};

export function FollowUpReassignDialog({
  action,
  currentAssignedUserId,
  members,
  disabled = false,
}: {
  action: ReassignAction;
  currentAssignedUserId: string | null;
  members: TeamMemberOption[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [assignedToUserId, setAssignedToUserId] = useState(
    currentAssignedUserId ?? "",
  );
  const [state, formAction, isPending] = useDeferredActionState(
    action,
    {} as FollowUpReassignActionState,
    {
      onSuccess: () => setOpen(false),
    },
  );

  const memberOptions = members.map((member) => ({
    label: member.name || member.email,
    value: member.userId,
  }));

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setAssignedToUserId(currentAssignedUserId ?? "");
        }

        setOpen(nextOpen);
      }}
    >
      <ResponsiveOverlayTrigger asChild>
        <Button disabled={disabled} size="sm" tabIndex={-1} type="button" variant="ghost">
          <UserRoundCog data-icon="inline-start" />
          Reassign
        </Button>
      </ResponsiveOverlayTrigger>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Reassign follow-up</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Pick a team member to handle this follow-up.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <form action={formAction}>
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <Field data-invalid={Boolean(state.fieldErrors?.assignedToUserId?.[0])}>
              <FieldLabel htmlFor="follow-up-reassign-user">Assign to</FieldLabel>
              <FieldContent>
                <input name="assignedToUserId" type="hidden" value={assignedToUserId} />
                <Combobox
                  aria-invalid={Boolean(state.fieldErrors?.assignedToUserId?.[0])}
                  id="follow-up-reassign-user"
                  onValueChange={setAssignedToUserId}
                  options={memberOptions}
                  placeholder="Choose team member"
                  value={assignedToUserId}
                />
              </FieldContent>
            </Field>
          </div>
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button disabled={isPending} type="button" variant="ghost">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button disabled={isPending} type="submit">
              {isPending ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : null}
              {isPending ? "Reassigning..." : "Reassign"}
            </Button>
          </ResponsiveOverlayFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
