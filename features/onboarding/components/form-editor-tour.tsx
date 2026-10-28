"use client";

import { FormInput, Eye, Settings2 } from "lucide-react";

import { completeFormEditorTourAction } from "@/features/onboarding/tour-actions";
import {
  TourModal,
  type TourModalStep,
} from "@/features/onboarding/components/tour-modal";

/* -------------------------------------------------------------------------- */
/*  Preview components                                                        */
/* -------------------------------------------------------------------------- */

function FormBuilderPreview() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
        <FormInput className="size-4 text-primary-ink" />
        <span className="text-xs font-medium text-primary-ink">Fields</span>
      </div>
      <div className="flex flex-col gap-1.5 rounded-lg border border-border/50 bg-card p-2.5">
        <div className="flex items-center gap-2 rounded border border-border/40 px-2 py-1.5">
          <div className="h-2.5 w-16 rounded bg-muted" />
          <div className="ml-auto h-2.5 w-8 rounded bg-muted" />
        </div>
        <div className="flex items-center gap-2 rounded border border-border/40 px-2 py-1.5">
          <div className="h-2.5 w-20 rounded bg-muted" />
          <div className="ml-auto h-2.5 w-8 rounded bg-muted" />
        </div>
        <div className="flex items-center gap-2 rounded border border-dashed border-border/60 px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground">+ Add field</span>
        </div>
      </div>
    </div>
  );
}

function PublicPagePreview() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
        <Eye className="size-4 text-primary-ink" />
        <span className="text-xs font-medium text-primary-ink">Public page</span>
      </div>
      <div className="rounded-lg border border-border/50 bg-card p-3">
        <div className="mb-2 h-3 w-24 rounded bg-muted" />
        <div className="mb-3 h-2 w-full rounded bg-muted/60" />
        <div className="flex gap-2">
          <div className="h-6 w-14 rounded bg-primary/10" />
          <div className="h-6 w-14 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

function FormSettingsPreview() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
        <Settings2 className="size-4 text-primary-ink" />
        <span className="text-xs font-medium text-primary-ink">Settings</span>
      </div>
      <div className="flex flex-col gap-1.5 rounded-lg border border-border/50 bg-card p-2.5">
        <div className="flex items-center justify-between rounded px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground">Status</span>
          <div className="h-4 w-8 rounded-full bg-success/25" />
        </div>
        <div className="flex items-center justify-between rounded px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground">Default service</span>
          <div className="h-4 w-8 rounded-full bg-success/25" />
        </div>
        <div className="flex items-center justify-between rounded px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground">Template</span>
          <div className="h-2.5 w-20 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tour steps                                                                */
/* -------------------------------------------------------------------------- */

const tourSteps: TourModalStep[] = [
  {
    title: "Customize your fields",
    description:
      "Change what information you collect from potential customers.",
    preview: <FormBuilderPreview />,
  },
  {
    title: "Design the page",
    description:
      "Adjust the text, colors, and layout of the page your customers will see.",
    preview: <PublicPagePreview />,
  },
  {
    title: "Publishing & defaults",
    description:
      "Publish your service, set it as the default, and apply your business's starter template.",
    preview: <FormSettingsPreview />,
  },
];

export function FormEditorTour({ show }: { show: boolean }) {
  return (
    <TourModal
      onComplete={completeFormEditorTourAction}
      show={show}
      steps={tourSteps}
    />
  );
}
