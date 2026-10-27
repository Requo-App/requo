"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type OnboardingStepperItem = {
  id: string;
  label: string;
  description: string;
};

type OnboardingStepperProps = {
  items: readonly OnboardingStepperItem[];
  currentStep: number;
  onStepSelect: (stepIndex: number) => void;
};

export function OnboardingStepper({
  items,
  currentStep,
  onStepSelect,
}: OnboardingStepperProps) {
  return (
    <nav aria-label="Onboarding progress" className="mx-auto w-full max-w-md">
      <ol className="flex items-center">
        {items.map((item, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isInteractive = isCompleted;
          const isLast = index === items.length - 1;

          return (
            <li
              key={item.id}
              className={cn("flex items-center", !isLast && "flex-1")}
            >
              <div className="flex flex-col items-center gap-1.5">
                {isInteractive ? (
                  <button
                    className="group flex flex-col items-center gap-1.5"
                    onClick={() => onStepSelect(index)}
                    type="button"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all duration-500 ease-out group-hover:scale-110 group-hover:bg-primary/80">
                      <Check className="size-4" />
                    </span>
                    <span className="text-xs font-medium text-primary-ink transition-colors duration-300 group-hover:text-primary-ink/80">
                      {item.label}
                    </span>
                  </button>
                ) : (
                  <div
                    aria-current={isCurrent ? "step" : undefined}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-500 ease-out",
                        isCurrent &&
                          "scale-110 border-primary bg-primary/10 text-primary-ink shadow-[0_0_0_4px_var(--color-primary)/0.1]",
                        !isCurrent &&
                          !isCompleted &&
                          "border-border text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium transition-colors duration-300",
                        isCurrent
                          ? "text-foreground"
                          : "text-muted-foreground/60",
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                )}
              </div>

              {!isLast ? (
                <div className="relative mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500 ease-out",
                      isCompleted ? "w-full" : "w-0",
                    )}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
