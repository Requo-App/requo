"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Save } from "lucide-react";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import type { QuoteScopeBlock, ScopeBlockKind } from "@/lib/db/schema/scope-blocks";
import { isScopeBlockContentComplete } from "@/features/scope-blocks/schemas";
import { QuoteScopeWaiverDialog } from "@/features/scope-blocks/components/quote-scope-waiver-dialog";

type SaveScopeAction = (
  previousState: { error?: string; success?: string },
  formData: FormData,
) => Promise<{ error?: string; success?: string }>;

const scopeLabels: Record<ScopeBlockKind, { title: string; help: string }> = {
  deliverables: { title: "Deliverables", help: "List what the customer will receive. Add one item per line." },
  exclusions: { title: "Exclusions", help: "List work that is outside this quote. Add one item per line." },
  assumptions: { title: "Assumptions", help: "List the conditions this quote depends on. Add one item per line." },
  allowances: { title: "Allowances", help: "List each allowance as: item | amount | optional brand." },
  revision_cap: { title: "Revision limit", help: "Set the included revision rounds and explain how feedback is consolidated." },
  acceptance_criteria: { title: "Acceptance criteria", help: "List the checks the customer will use to approve the work." },
  usage_rights: { title: "Usage rights", help: "List each right as: media | term | territory." },
  client_responsibilities: { title: "Customer responsibilities", help: "List what the customer must provide or do. Add one item per line." },
  timeline: { title: "Timeline", help: "List milestones, optionally with a date: milestone | date." },
  payment_schedule: { title: "Payment schedule", help: "Use the payment schedule attached to this quote." },
};

type Draft = {
  lines: string;
  note: string;
  reviewer: string;
  responseDays: string;
  rounds: string;
  amount: string;
  brand: string;
  consolidationRule: string;
  deemedApprovalDays: string;
  carveouts: string;
  referenceSchedule: boolean;
};

function getDraft(kind: ScopeBlockKind, block: QuoteScopeBlock | null): Draft {
  const content = (block?.content ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(content.items) ? content.items : [];
  const lines = kind === "usage_rights"
    ? (Array.isArray(content.matrix) ? content.matrix : []).map((row) => {
        const item = row as Record<string, unknown>;
        return [item.media, item.term, item.territory].join(" | ");
      })
    : kind === "timeline"
      ? (Array.isArray(content.milestones) ? content.milestones : []).map((row) => {
          const item = row as Record<string, unknown>;
          return [item.label, item.date].filter(Boolean).join(" | ");
        })
      : rows.map((row) => {
          const item = row as Record<string, unknown>;
          return String(item.label ?? item.criterion ?? "");
        });

  const first = rows[0] as Record<string, unknown> | undefined;
  return {
    lines: lines.join("\n"),
    note: String(content.note ?? ""),
    reviewer: String(first?.reviewer ?? ""),
    responseDays: first?.responseDays == null ? "" : String(first.responseDays),
    rounds: content.rounds == null ? "" : String(content.rounds),
    amount: first?.amountCents == null ? "" : (Number(first.amountCents) / 100).toFixed(2),
    brand: String(first?.brand ?? ""),
    consolidationRule: String(content.consolidationRule ?? ""),
    deemedApprovalDays: content.deemedApprovalDays == null ? "" : String(content.deemedApprovalDays),
    carveouts: Array.isArray(content.carveouts) ? content.carveouts.join("\n") : "",
    referenceSchedule: content.referenceSchedule === true,
  };
}

function buildContent(kind: ScopeBlockKind, draft: Draft): Record<string, unknown> {
  const lines = draft.lines.split("\n").map((line) => line.trim()).filter(Boolean);
  switch (kind) {
    case "deliverables":
      return { items: lines.map((label) => ({ label })) };
    case "exclusions":
    case "assumptions":
      return { items: lines.map((label) => ({ label })) };
    case "client_responsibilities":
      return { items: lines.map((label) => ({ label })) };
    case "acceptance_criteria":
      return { items: lines.map((criterion) => ({
        criterion,
        ...(draft.reviewer.trim() ? { reviewer: draft.reviewer.trim() } : {}),
        ...(draft.responseDays.trim() ? { responseDays: Number(draft.responseDays) } : {}),
      })) };
    case "allowances":
      return {
        items: lines.map((line) => {
          const [label = "", amount = "0", brand = ""] = line.split("|").map((part) => part.trim());
          return {
            label,
            amountCents: Math.round(Number(amount.replaceAll(",", "")) * 100),
            ...(brand ? { brand } : {}),
          };
        }),
      };
    case "revision_cap":
      return {
        rounds: Number(draft.rounds || 0),
        ...(draft.amount.trim() ? { overageCents: Math.round(Number(draft.amount) * 100) } : {}),
        ...(draft.consolidationRule.trim() ? { consolidationRule: draft.consolidationRule.trim() } : {}),
        ...(draft.deemedApprovalDays.trim() ? { deemedApprovalDays: Number(draft.deemedApprovalDays) } : {}),
      };
    case "usage_rights":
      return {
        matrix: lines.map((line) => {
          const [media = "", term = "", territory = ""] = line.split("|").map((part) => part.trim());
          return { media, term, territory };
        }),
        carveouts: draft.carveouts.split("\n").map((line) => line.trim()).filter(Boolean),
      };
    case "timeline":
      return {
        milestones: lines.map((line) => {
          const [label = "", date = ""] = line.split("|").map((part) => part.trim());
          return { label, ...(date ? { date } : {}) };
        }),
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      };
    case "payment_schedule":
      return { referenceSchedule: draft.referenceSchedule };
  }
}

function linesFor(kind: ScopeBlockKind, draft: Draft) {
  return draft.lines.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function QuoteScopeEditor({
  kind,
  block,
  saveAction,
  waiveAction,
}: {
  kind: ScopeBlockKind;
  block: QuoteScopeBlock | null;
  saveAction: SaveScopeAction;
  waiveAction?: React.ComponentProps<
    typeof QuoteScopeWaiverDialog
  >["waiveAction"];
}) {
  const initialDraft = useMemo(() => getDraft(kind, block), [block, kind]);
  const [draft, setDraft] = useState(initialDraft);
  const [state, formAction, isPending] = useActionStateWithSonner(saveAction, {});
  const { scheduleRefresh } = useDeferredRefresh();
  const content = buildContent(kind, draft);
  const complete = isScopeBlockContentComplete(kind, content);
  const title = scopeLabels[kind].title;
  const multiValueKind = kind === "deliverables" || kind === "exclusions" || kind === "assumptions" || kind === "acceptance_criteria" || kind === "client_responsibilities";

  useEffect(() => {
    if (state.success) scheduleRefresh();
  }, [scheduleRefresh, state.success]);

  const persisted =
    block?.state === "complete" &&
    complete &&
    JSON.stringify(initialDraft) === JSON.stringify(draft);

  return (
    <section className="rounded-xl border border-border/70 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className={persisted ? "text-xs text-success-ink" : "text-xs text-muted-foreground"}>
          {persisted ? "Complete" : complete ? "Ready to save" : "Required before sending"}
        </p>
      </header>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{scopeLabels[kind].help}</p>

      {kind === "revision_cap" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">Included revision rounds
            <Input aria-label="Included revision rounds" min={0} max={100} type="number" value={draft.rounds} onChange={(event) => setDraft({ ...draft, rounds: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Extra round amount
            <Input aria-label="Extra round amount" inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">How feedback is consolidated
            <Textarea aria-label="How feedback is consolidated" maxLength={500} value={draft.consolidationRule} onChange={(event) => setDraft({ ...draft, consolidationRule: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Approval window (days)
            <Input aria-label="Approval window in days" min={0} max={90} type="number" value={draft.deemedApprovalDays} onChange={(event) => setDraft({ ...draft, deemedApprovalDays: event.target.value })} />
          </label>
        </div>
      ) : kind === "payment_schedule" ? (
        <label className="mt-4 flex items-start gap-2 text-sm leading-5">
          <input checked={draft.referenceSchedule} className="mt-1 accent-primary" onChange={(event) => setDraft({ ...draft, referenceSchedule: event.target.checked })} type="checkbox" />
          <span>Include the payment schedule configured for this quote.</span>
        </label>
      ) : (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            {kind === "usage_rights" ? "Rights (media | term | territory)" : kind === "timeline" ? "Milestones (milestone | date)" : kind === "allowances" ? "Allowances (item | amount | brand)" : title}
            <Textarea aria-label={title} placeholder={kind === "usage_rights" ? "Website | 2 years | United States" : kind === "timeline" ? "Production complete | 2026-12-01" : kind === "allowances" ? "Vinyl material | 125.00 | Brand" : "One item per line"} value={draft.lines} onChange={(event) => setDraft({ ...draft, lines: event.target.value })} />
          </label>
          {kind === "acceptance_criteria" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">Reviewer
                <Input aria-label="Acceptance reviewer" value={draft.reviewer} onChange={(event) => setDraft({ ...draft, reviewer: event.target.value })} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">Response window (days)
                <Input aria-label="Acceptance response window in days" min={0} max={90} type="number" value={draft.responseDays} onChange={(event) => setDraft({ ...draft, responseDays: event.target.value })} />
              </label>
            </div>
          ) : null}
          {kind === "usage_rights" ? (
            <label className="grid gap-1.5 text-sm font-medium">Rights exclusions
              <Textarea aria-label="Rights exclusions" value={draft.carveouts} onChange={(event) => setDraft({ ...draft, carveouts: event.target.value })} />
            </label>
          ) : null}
          {kind === "timeline" ? (
            <label className="grid gap-1.5 text-sm font-medium">Timeline note
              <Textarea aria-label="Timeline note" maxLength={1000} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
            </label>
          ) : null}
        </div>
      )}

      <form action={formAction} className="mt-4 flex items-center justify-between gap-3">
        <input name="content" type="hidden" value={JSON.stringify(content)} />
        <p className="text-xs text-muted-foreground">{multiValueKind ? `${linesFor(kind, draft).length} item${linesFor(kind, draft).length === 1 ? "" : "s"}` : block ? "Saved to this draft" : "Not saved yet"}</p>
        <Button disabled={isPending} size="sm" type="submit" variant="outline">
          {isPending ? <Save data-icon="inline-start" /> : complete ? <Check data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
          {isPending ? "Saving..." : persisted ? "Save section" : block ? "Update section" : "Add section"}
        </Button>
      </form>

      {waiveAction ? (
        <div className="mt-2 flex justify-end">
          <QuoteScopeWaiverDialog
            blockId={block?.id ?? null}
            kind={kind}
            waiveAction={waiveAction}
          />
        </div>
      ) : null}
    </section>
  );
}
