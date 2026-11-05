"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";

import { useIsSelfHostedDeployment } from "@/components/providers/deployment-mode-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlanTier } from "@/lib/plans/plans";
import { planCatalog } from "@/lib/plans/catalog";

function getPlanLabel(plan: PlanTier): string {
  return planCatalog[plan].label;
}

export function UpgradeSuccessModal() {
  const isSelfHosted = useIsSelfHostedDeployment();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const firedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<"success" | "processing" | "failed">(
    "success",
  );
  const [plan, setPlan] = useState<PlanTier>("pro");

  useEffect(() => {
    if (firedRef.current) return;
    const upgrade = searchParams.get("upgrade");
    if (upgrade !== "success" && upgrade !== "processing" && upgrade !== "failed") {
      return;
    }

    firedRef.current = true;

    // Defer state updates to avoid synchronous setState in effect body.
    const planParam = searchParams.get("plan");
    queueMicrotask(() => {
      setOutcome(upgrade);
      if (planParam === "pro" || planParam === "business") {
        setPlan(planParam);
      }
      setOpen(true);
    });
  }, [searchParams]);

  if (isSelfHosted) return null;

  function handleClose() {
    setOpen(false);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("upgrade");
    next.delete("plan");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });

    router.refresh();
  }

  const features = planCatalog[plan].highlights;
  const label = getPlanLabel(plan);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {outcome === "success" ? (
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-success/10">
              <Sparkles className="size-6 text-success-ink" />
            </div>
          ) : null}
          <DialogTitle className="text-center">
            {outcome === "success"
              ? `Welcome to ${label}`
              : outcome === "processing"
                ? "Activation pending"
                : "Upgrade failed"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {outcome === "success"
              ? "Your upgrade is active. Here's what's now unlocked:"
              : outcome === "processing"
                ? "Your payment is being processed. Your plan will activate once payment is confirmed."
                : "We couldn't confirm your upgrade. Please check your billing settings or contact support."}
          </DialogDescription>
        </DialogHeader>
        {outcome === "success" ? (
          <DialogBody>
            <ul className="grid gap-2">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-success-ink" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {feature}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button className="w-full" onClick={handleClose}>
            {outcome === "success" ? "Get started" : "Done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
