"use client";

import { useEffect, useState } from "react";

import { CheckCircle2, PartyPopper } from "lucide-react";

import { BrandMark } from "@/components/shared/brand-mark";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const setupLoadingSteps = [
  "Creating your business…",
  "Setting up your business…",
  "Building your service…",
  "You’re all set!",
];

export function SetupLoadingOverlay() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (activeStep >= setupLoadingSteps.length - 1) {
      return;
    }

    const delay = activeStep === setupLoadingSteps.length - 2 ? 1400 : 1200;

    const timeout = window.setTimeout(
      () => setActiveStep((step) => Math.min(step + 1, setupLoadingSteps.length - 1)),
      delay,
    );

    return () => window.clearTimeout(timeout);
  }, [activeStep]);

  const isComplete = activeStep === setupLoadingSteps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-10 px-6">
        <BrandMark subtitle={null} size="xl" />
        <div className="flex flex-col gap-4">
          {setupLoadingSteps.map((step, index) => (
            <div
              className={cn(
                "flex items-center gap-3 transition-all duration-500",
                index > activeStep && "translate-y-2 opacity-0",
                index <= activeStep && "translate-y-0 opacity-100",
              )}
              key={step}
            >
              {index < activeStep ? (
                <CheckCircle2 className="size-5 shrink-0 text-primary-ink" />
              ) : index === activeStep && !isComplete ? (
                <Spinner className="size-5 shrink-0" />
              ) : index === activeStep && isComplete ? (
                <PartyPopper className="size-5 shrink-0 text-primary-ink" />
              ) : (
                <div className="size-5 shrink-0" />
              )}
              <p
                className={cn(
                  "text-sm font-medium transition-colors duration-300",
                  index <= activeStep
                    ? "text-foreground"
                    : "text-muted-foreground",
                  index === activeStep && isComplete && "text-primary-ink",
                )}
              >
                {step}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
