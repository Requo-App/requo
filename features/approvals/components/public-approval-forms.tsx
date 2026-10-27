"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  decideApprovalForToken,
  type ApprovalActionState,
} from "@/features/approvals/actions";
import {
  decideChangeOrderForToken,
  type ChangeOrderActionState,
} from "@/features/change-orders/actions";

const initialApprovalState: ApprovalActionState = {};
const initialChangeOrderState: ChangeOrderActionState = {};

function StateMessage({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return <p className="text-sm text-destructive-ink">{error}</p>;
  }

  if (success) {
    return <p className="text-sm text-muted-foreground">{success}</p>;
  }

  return null;
}

function SubmitButton({ children, variant }: { children: React.ReactNode; variant?: "secondary" }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} variant={variant}>
      {children}
    </Button>
  );
}

export function PublicApprovalDecideForms({ token }: { token: string }) {
  const approveAction = decideApprovalForToken.bind(null, token);
  const [approveState, approveFormAction] = useActionState(approveAction, initialApprovalState);
  const changesAction = decideApprovalForToken.bind(null, token);
  const [changesState, changesFormAction] = useActionState(changesAction, initialApprovalState);

  return (
    <div className="flex flex-col gap-6">
      <form action={approveFormAction} className="soft-panel flex flex-col gap-3">
        <input type="hidden" name="decision" value="approved" />
        <h2 className="text-sm font-semibold text-foreground">Approve</h2>
        <div className="flex flex-col gap-1 text-sm">
          <Label htmlFor="approval-name">Type your full name to approve</Label>
          <Input id="approval-name" name="approverName" autoComplete="name" maxLength={120} />
        </div>
        <StateMessage error={approveState.error} success={approveState.success} />
        <div>
          <SubmitButton>Approve</SubmitButton>
        </div>
      </form>

      <form action={changesFormAction} className="soft-panel flex flex-col gap-3">
        <input type="hidden" name="decision" value="changes_requested" />
        <h2 className="text-sm font-semibold text-foreground">Request changes</h2>
        <div className="flex flex-col gap-1 text-sm">
          <Label htmlFor="approval-comment">What should change?</Label>
          <Textarea id="approval-comment" name="comment" rows={4} maxLength={2000} />
        </div>
        <StateMessage error={changesState.error} success={changesState.success} />
        <div>
          <SubmitButton>Send feedback</SubmitButton>
        </div>
      </form>
    </div>
  );
}

export function PublicChangeOrderDecideForms({ token }: { token: string }) {
  const approveAction = decideChangeOrderForToken.bind(null, token);
  const [approveState, approveFormAction] = useActionState(approveAction, initialChangeOrderState);
  const rejectAction = decideChangeOrderForToken.bind(null, token);
  const [rejectState, rejectFormAction] = useActionState(rejectAction, initialChangeOrderState);

  return (
    <div className="flex flex-col gap-4">
      <form action={approveFormAction} className="soft-panel flex flex-col gap-3">
        <input type="hidden" name="decision" value="approved" />
        <h3 className="text-sm font-semibold text-foreground">Approve this change</h3>
        <div className="flex flex-col gap-1 text-sm">
          <Label htmlFor="co-name">Type your full name to approve</Label>
          <Input id="co-name" name="approverName" autoComplete="name" maxLength={120} />
        </div>
        <StateMessage error={approveState.error} success={approveState.success} />
        <div>
          <SubmitButton>Approve change</SubmitButton>
        </div>
      </form>

      <form action={rejectFormAction} className="soft-panel flex flex-col gap-3">
        <input type="hidden" name="decision" value="rejected" />
        <h3 className="text-sm font-semibold text-foreground">Decline this change</h3>
        <div className="flex flex-col gap-1 text-sm">
          <Label htmlFor="co-comment">Why doesn&apos;t this work? (required)</Label>
          <Textarea id="co-comment" name="comment" rows={3} maxLength={2000} />
        </div>
        <StateMessage error={rejectState.error} success={rejectState.success} />
        <div>
          <SubmitButton variant="secondary">Decline change</SubmitButton>
        </div>
      </form>
    </div>
  );
}
