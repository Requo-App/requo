"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  FloatingFormActions,
  useFloatingUnsavedChanges,
} from "@/components/shared/floating-form-actions";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { Switch } from "@/components/ui/switch";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { GeneralSettingsSection } from "@/features/settings/components/business-settings-form/section";
import type { AgentTone } from "@/features/agent/types";
import { businessInstructionsMaxLength } from "@/lib/ai/business-instructions";
import type {
  BusinessAgentSettingsActionState,
  BusinessSettingsView,
} from "@/features/settings/types";
import { cn } from "@/lib/utils";

type BusinessAgentSettingsFormProps = {
  action: (
    state: BusinessAgentSettingsActionState,
    formData: FormData,
  ) => Promise<BusinessAgentSettingsActionState>;
  chatPath: string;
  settings: Pick<
    BusinessSettingsView,
    "agentEnabled" | "agentTone" | "agentInstructions" | "updatedAt"
  >;
};

const initialState: BusinessAgentSettingsActionState = {};

const toneOptions: Array<{
  value: AgentTone;
  label: string;
}> = [
  {
    value: "friendly",
    label: "Friendly",
  },
  {
    value: "professional",
    label: "Professional",
  },
  {
    value: "casual",
    label: "Casual",
  },
];

export function BusinessAgentSettingsForm({
  action,
  chatPath,
  settings,
}: BusinessAgentSettingsFormProps) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [state, formAction, isPending] = useActionStateWithSonner(
    action,
    initialState,
  );
  const [agentEnabled, setAgentEnabled] = useState(settings.agentEnabled);
  const [tone, setTone] = useState<AgentTone>(settings.agentTone);
  const [instructions, setInstructions] = useState(settings.agentInstructions);
  const [copied, setCopied] = useState(false);

  const hasUnsavedChanges =
    agentEnabled !== settings.agentEnabled ||
    tone !== settings.agentTone ||
    instructions !== settings.agentInstructions;
  const { shouldRenderFloatingActions, floatingActionsState } =
    useFloatingUnsavedChanges(hasUnsavedChanges);

  useEffect(() => {
    if (!state.success) {
      return;
    }

    scheduleRefresh();
  }, [scheduleRefresh, state.success]);

  function handleCancelChanges() {
    setAgentEnabled(settings.agentEnabled);
    setTone(settings.agentTone);
    setInstructions(settings.agentInstructions);
  }

  async function handleCopyChatLink() {
    try {
      const url = new URL(chatPath, window.location.origin).toString();
      await navigator.clipboard.writeText(url);
      toast.success("Chat link copied to clipboard.");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy Agent chat link.", error);
      toast.error("Failed to copy chat link.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-10">
      <form action={formAction}>
        <input
          name="agentEnabled"
          type="hidden"
          value={agentEnabled ? "on" : "off"}
        />
        <input name="tone" type="hidden" value={tone} />

        <div className="flex flex-col gap-10">
          <GeneralSettingsSection
            title="Public chat"
            description="A public link where customers can ask questions and share what they need. New inquiries land in your inbox."
          >
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border/70 px-4 py-3">
              <span className="min-w-0 text-sm text-foreground">
                Enable public chat
                <span className="block text-xs text-muted-foreground">
                  {agentEnabled
                    ? "Your chat link is live for customers."
                    : "Your chat link is turned off."}
                </span>
              </span>
              <Switch
                aria-label="Enable public chat"
                checked={agentEnabled}
                disabled={isPending}
                id="agent-settings-enabled"
                onCheckedChange={setAgentEnabled}
              />
            </label>

            {agentEnabled ? (
              <>
                <div className="flex flex-col gap-2.5">
                  <span
                    className="text-sm font-medium text-foreground"
                    id="agent-tone-label"
                  >
                    Tone of voice
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <div
                      aria-labelledby="agent-tone-label"
                      className="inline-flex h-9 w-full max-w-xs rounded-md border border-border/60 bg-muted/30 p-1 sm:h-8"
                      role="radiogroup"
                    >
                      {toneOptions.map((opt) => {
                        const isSelected = tone === opt.value;

                        return (
                          <button
                            key={opt.value}
                            type="button"
                            aria-checked={isSelected}
                            disabled={isPending}
                            onClick={() => setTone(opt.value)}
                            role="radio"
                            className={cn(
                              "flex flex-1 items-center justify-center rounded-md px-2.5 text-xs font-medium transition-all",
                              isSelected
                                ? "bg-card text-foreground shadow-xs border border-border/50"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      How your public chat sounds to customers.
                    </p>
                  </div>
                </div>

                <Field>
                  <FieldContent>
                    <div className="control-surface flex h-9 items-center justify-between gap-2 rounded-md border border-input/95 px-3 sm:h-8">
                      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground select-all">
                        {chatPath}
                      </span>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          onClick={handleCopyChatLink}
                          title="Copy chat link"
                        >
                          {copied ? (
                            <Check className="size-3.5 text-primary-ink" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                          <span className="sr-only">Copy link</span>
                        </Button>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon-xs"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          title="Open chat link in new tab"
                        >
                          <a
                            href={chatPath}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <ExternalLink className="size-3.5" />
                            <span className="sr-only">Open chat link</span>
                          </a>
                        </Button>
                      </div>
                    </div>
                    <FieldDescription>
                      Share this link anywhere customers reach you.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </>
            ) : null}
          </GeneralSettingsSection>

          <GeneralSettingsSection
            title="Business instructions"
            description="Appended to every AI reply, for both your public chat and your assistant. Describe the work you take on, how you price it, and what to avoid promising."
          >
            <Field
              data-invalid={
                Boolean(state.fieldErrors?.agentInstructions) || undefined
              }
            >
              <FieldLabel className="sr-only" htmlFor="agent-instructions">
                Business instructions
              </FieldLabel>
              <FieldContent>
                <Textarea
                  value={instructions}
                  disabled={isPending}
                  id="agent-instructions"
                  maxLength={businessInstructionsMaxLength}
                  name="agentInstructions"
                  onChange={(event) => setInstructions(event.currentTarget.value)}
                  placeholder="e.g. We're a residential and light-commercial cleaning service. We quote by square footage, our minimum visit is $120, and we don't offer same-day bookings. Always ask about property size and the schedule they want before quoting."
                  rows={5}
                />
                <FieldDescription>
                  {instructions.length}/{businessInstructionsMaxLength}{" "}
                  characters.
                </FieldDescription>
                <FieldError
                  errors={
                    state.fieldErrors?.agentInstructions?.[0]
                      ? [{ message: state.fieldErrors.agentInstructions[0] }]
                      : undefined
                  }
                />
              </FieldContent>
            </Field>
          </GeneralSettingsSection>
        </div>

        <FloatingFormActions
          disableSubmit={!hasUnsavedChanges}
          isPending={isPending}
          message="You have unsaved AI settings."
          onCancel={handleCancelChanges}
          state={floatingActionsState}
          submitLabel="Save settings"
          submitPendingLabel="Saving..."
          visible={shouldRenderFloatingActions}
        />
      </form>
    </div>
  );
}
