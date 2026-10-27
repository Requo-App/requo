"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BehaviorPackKey } from "@/features/businesses/behavior-packs";
import { behaviorPacks } from "@/features/businesses/behavior-packs";
import {
  activateRecipeVersionAction,
  resetBehaviorPackAction,
  switchBehaviorPackAction,
  type PackActionState,
} from "@/features/businesses/pack-actions";
import type { PackRecipeKind } from "@/lib/db/schema/pack-recipes";

export type WorkflowSettingsData = {
  pack: BehaviorPackKey | null;
  packVersion: number;
  source: string;
  isOwner: boolean;
  canCustomize: boolean;
  recipes: Array<{
    kind: PackRecipeKind;
    versions: Array<{ version: number; active: boolean; pack: string }>;
  }>;
};

const initialState: PackActionState = {};

function StateMessage({ state }: { state: PackActionState }) {
  if (state.error) {
    return <p className="text-sm text-destructive-ink">{state.error}</p>;
  }

  if (state.success) {
    return <p className="text-sm text-muted-foreground">{state.success}</p>;
  }

  return null;
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} size="sm">
      {children}
    </Button>
  );
}

const selectClassName =
  "control-surface h-9 w-full min-w-0 rounded-md border border-input/95 px-3 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 disabled:pointer-events-none disabled:opacity-50 md:text-sm";

export function WorkflowSettingsManager({ data }: { data: WorkflowSettingsData }) {
  const [switchState, switchAction] = useActionState(switchBehaviorPackAction, initialState);
  const [resetState, resetAction] = useActionState(resetBehaviorPackAction, initialState);
  const [activateState, activateAction] = useActionState(activateRecipeVersionAction, initialState);

  const packLabel = data.pack
    ? (behaviorPacks.find((pack) => pack.key === data.pack)?.label ?? data.pack)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-10">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Behavior pack
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {packLabel
              ? `This business follows the ${packLabel} workflow (pack v${data.packVersion}, ${data.source}).`
              : "This business has no behavior pack: it keeps the general workflow with intake presets and templates only."}{" "}
            Switching re-seeds editable defaults for new records — history never changes.
          </p>
        </div>
        {data.isOwner ? (
          <>
            <form action={switchAction} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1 text-sm">
                <Label htmlFor="workflow-pack">Pack</Label>
                <select
                  id="workflow-pack"
                  name="pack"
                  defaultValue={data.pack ?? ""}
                  className={selectClassName}
                >
                  <option value="">No pack (general workflow)</option>
                  {behaviorPacks.map((pack) => (
                    <option key={pack.key} value={pack.key}>
                      {pack.label}
                    </option>
                  ))}
                </select>
              </div>
              <StateMessage state={switchState} />
              <div>
                <SubmitButton>Save pack</SubmitButton>
              </div>
            </form>
            <form action={resetAction}>
              <StateMessage state={resetState} />
              <SubmitButton>Reset to defaults</SubmitButton>
            </form>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only the business owner can change the behavior pack.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Workflow recipes
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {data.canCustomize
              ? "Recipe versions per area. Activating a version changes future behavior only."
              : "Recipe customization needs a Pro plan or higher. Your business runs on the built-in v1 recipes."}
          </p>
        </div>
        {data.recipes.map((recipe) => (
          <div key={recipe.kind} className="soft-panel flex flex-col gap-2">
            <h3 className="text-sm font-medium capitalize text-foreground">
              {recipe.kind.replace("_", " ")}
            </h3>
            {recipe.versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Running on built-in v1 defaults.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {recipe.versions.map((version) => (
                  <li key={version.version} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      v{version.version} · {version.pack}
                      {version.active ? " · active" : ""}
                    </span>
                    {data.isOwner && data.canCustomize && !version.active ? (
                      <form action={activateAction}>
                        <Input type="hidden" name="kind" value={recipe.kind} />
                        <Input type="hidden" name="version" value={version.version} />
                        <SubmitButton>Activate</SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <StateMessage state={activateState} />
      </section>
    </div>
  );
}
