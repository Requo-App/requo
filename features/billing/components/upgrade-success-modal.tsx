"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const firedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<PlanTier>("pro");

  useEffect(() => {
    if (firedRef.current) return;
    if (searchParams.get("upgrade") !== "success") return;

    firedRef.current = true;

    // Defer state updates to avoid synchronous setState in effect body.
    const planParam = searchParams.get("plan");
    queueMicrotask(() => {
      if (planParam === "pro" || planParam === "business") {
        setPlan(planParam);
      }
      setOpen(true);
    });
  }, [searchParams]);

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
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
            <Sparkles className="size-6 text-emerald-600" />
          </div>
          <DialogTitle className="text-center">
            Welcome to {label}
          </DialogTitle>
          <DialogDescription className="text-center">
            Your upgrade is active. Here&apos;s what&apos;s now unlocked:
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ul className="grid gap-2">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {feature}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button className="w-full" onClick={handleClose}>
            Get started
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
