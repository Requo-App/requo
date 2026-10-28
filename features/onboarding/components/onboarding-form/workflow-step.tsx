import {
  Briefcase,
  FileText,
  Repeat,
  type LucideIcon,
} from "lucide-react";

import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  starterWorkflowDefinitions,
  starterWorkflowKeys,
  type StarterWorkflowKey,
} from "@/features/businesses/starter-workflows";
import type { OnboardingDraft } from "@/features/onboarding/helpers";
import type { OnboardingFieldName } from "@/features/onboarding/types";
import { cn } from "@/lib/utils";

const workflowIcons: Record<StarterWorkflowKey, LucideIcon> = {
  project_quote: FileText,
  recurring_service: Repeat,
  consultation_proposal: Briefcase,
};

type WorkflowStepProps = {
  draft: OnboardingDraft;
  fieldErrors: Partial<Record<OnboardingFieldName, string>>;
  isPending: boolean;
  recommendedWorkflow: StarterWorkflowKey;
  updateField: <FieldName extends OnboardingFieldName>(
    field: FieldName,
    value: OnboardingDraft[FieldName],
  ) => void;
};

export function WorkflowStep({
  draft,
  fieldErrors: _fieldErrors,
  isPending,
  recommendedWorkflow,
  updateField,
}: WorkflowStepProps) {
  return (
    <div className="mx-auto w-full max-w-xl py-4">
      <FieldGroup>
        <Field>
          <FieldLabel className="text-sm font-medium text-foreground">
            Select how you typically price and sell your services
          </FieldLabel>
          <FieldContent>
            <div className="flex flex-col gap-3">
              {starterWorkflowKeys.map((workflowKey) => {
                const def = starterWorkflowDefinitions[workflowKey];
                const Icon = workflowIcons[workflowKey];
                const isSelected = draft.starterWorkflow === workflowKey;
                const isRecommended = recommendedWorkflow === workflowKey;

                return (
                  <button
                    key={workflowKey}
                    className={cn(
                      "motion-transition group relative flex items-center gap-4 rounded-xl border p-4 text-left sm:p-5",
                      isSelected
                        ? "border-primary bg-primary/[0.04] ring-1 ring-primary/20 shadow-sm"
                        : "border-border/70 bg-card hover:border-border hover:bg-accent/40",
                      isPending && "pointer-events-none opacity-60",
                    )}
                    disabled={isPending}
                    onClick={() =>
                      updateField("starterWorkflow", workflowKey)
                    }
                    type="button"
                  >
                    {/* Icon container */}
                    <div
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground group-hover:bg-muted/80 group-hover:text-foreground",
                      )}
                    >
                      <Icon className="size-5" />
                    </div>

                    {/* Text content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-semibold sm:text-base",
                            isSelected ? "text-foreground" : "text-foreground/90",
                          )}
                        >
                          {def.label}
                        </span>
                        {isRecommended ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                              isSelected
                                ? "bg-primary/15 text-primary-ink"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            Recommended
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                        {def.description}
                      </p>
                    </div>

                    {/* Radio check indicator */}
                    <div className="shrink-0 pl-1">
                      <div
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full transition-colors sm:size-6",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "border-2 border-border/80 group-hover:border-primary/50",
                        )}
                      >
                        {isSelected ? (
                          <svg
                            className="size-3 text-primary-foreground sm:size-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.5"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </FieldContent>
        </Field>
      </FieldGroup>
    </div>
  );
}
