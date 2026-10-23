"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  startBusinessTrialAction,
  type StartBusinessTrialActionState,
} from "@/features/billing/actions";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { PRO_TRIAL_DAYS } from "@/lib/plans/plans";

const initialState: StartBusinessTrialActionState = {};

export function StartTrialButton({
  businessId,
  businessSlug,
  className,
}: {
  businessId: string;
  businessSlug: string;
  className?: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionStateWithSonner(
    startBusinessTrialAction.bind(null, businessId, businessSlug),
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <form action={formAction}>
      <Button className={className} disabled={isPending} size="sm" type="submit">
        {isPending ? (
          <>
            <Spinner data-icon="inline-start" aria-hidden="true" />
            Starting trial...
          </>
        ) : (
          <>
            <Sparkles data-icon="inline-start" />
            Start {PRO_TRIAL_DAYS}-day Pro trial
          </>
        )}
      </Button>
    </form>
  );
}
