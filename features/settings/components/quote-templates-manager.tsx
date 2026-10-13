"use client";

import { useState } from "react";
import {
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResponsiveOverlay,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/ui/responsive-overlay";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DashboardEmptyState } from "@/components/shared/dashboard-layout";
import { GeneralSettingsSection } from "@/features/settings/components/business-settings-form/section";
import {
  QuoteLibraryEntryForm,
} from "@/features/quotes/components/quote-library-entry-form";
import {
  centsToMoneyInput,
  formatQuoteMoney,
} from "@/features/quotes/utils";
import type {
  DashboardQuoteLibraryEntry,
  QuoteLibraryActionState,
  QuoteLibraryDeleteActionState,
} from "@/features/quotes/types";
import type { QuoteLibraryBlockReference } from "@/features/quotes/components/quote-library-entry-form";
import { useAnimatedList, type MotionState } from "@/hooks/use-animated-list";
import type { OptimisticActionResult } from "@/hooks/use-optimistic-mutation";

type QuoteTemplatesManagerProps = {
  templates: DashboardQuoteLibraryEntry[];
  totalLibraryCount: number;
  pricingLimit: number | null;
  availableBlocks?: ReadonlyArray<QuoteLibraryBlockReference>;
  businessDefaults?: {
    defaultQuoteNotes?: string | null;
    defaultQuoteTerms?: string | null;
    defaultQuoteValidityDays?: number;
  };
  createAction: (
    state: QuoteLibraryActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryActionState>;
  updateAction: (
    entryId: string,
    state: QuoteLibraryActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryActionState>;
  deleteAction: (
    entryId: string,
    state: QuoteLibraryDeleteActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryDeleteActionState>;
};

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; entry: DashboardQuoteLibraryEntry }
  | null;

export function QuoteTemplatesManager({
  templates,
  totalLibraryCount,
  pricingLimit,
  availableBlocks,
  businessDefaults,
  createAction,
  updateAction,
  deleteAction,
}: QuoteTemplatesManagerProps) {
  const [editorState, setEditorState] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<DashboardQuoteLibraryEntry | null>(null);
  const isAtLimit = pricingLimit !== null && totalLibraryCount >= pricingLimit;

  const { items: animatedTemplates, getMotionState, getItemRef, removeItem } = useAnimatedList(templates);

  function openCreate() {
    setEditorState({ mode: "create" });
  }

  function openEdit(entry: DashboardQuoteLibraryEntry) {
    setEditorState({ mode: "edit", entry });
  }

  function closeEditor() {
    setEditorState(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-10">
      <GeneralSettingsSection
        title="Templates"
        description="Reusable quote blueprints that pre-fill the title, notes, terms, validity, and line items."
      >
      <div className="flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {templates.length}{" "}
            {templates.length === 1 ? "template" : "templates"}
            {pricingLimit !== null ? (
              <span className="ml-1">
                · {totalLibraryCount}/{pricingLimit} library entries used
              </span>
            ) : null}
          </p>
          <Button
            disabled={isAtLimit}
            onClick={openCreate}
            size="sm"
            type="button"
          >
            <Plus data-icon="inline-start" />
            New
          </Button>
        </div>

        {/* Templates list */}
        {templates.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border/75">
            <div className="divide-y divide-border/60">
              {animatedTemplates.map((entry) => (
                <TemplateRow
                  entry={entry}
                  key={entry.id}
                  motionState={getMotionState(entry.id)}
                  itemRef={getItemRef(entry.id)}
                  onDelete={() => setDeleteTarget(entry)}
                  onEdit={() => openEdit(entry)}
                />
              ))}
            </div>
          </div>
        ) : (
          <DashboardEmptyState
            description="Create your first template to pre-fill entire quotes with one click."
            icon={FileText}
            title="No templates yet"
            variant="section"
          />
        )}
      </div>
      </GeneralSettingsSection>

      {/* Editor dialog */}
      <ResponsiveOverlay
        open={editorState !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <ResponsiveOverlayContent className="sm:max-w-2xl">
          {editorState ? (
            <>
              <ResponsiveOverlayHeader>
                <div className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
                    <FileText className="size-5 text-muted-foreground" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <ResponsiveOverlayTitle>
                      {editorState.mode === "create"
                        ? "Create quote template"
                        : "Edit quote template"}
                    </ResponsiveOverlayTitle>
                    <ResponsiveOverlayDescription>
                      {editorState.mode === "create"
                        ? "A full quote blueprint that pre-fills title, notes, terms, validity, and line items."
                        : "Update the template details and line items."}
                    </ResponsiveOverlayDescription>
                  </div>
                </div>
              </ResponsiveOverlayHeader>

              <div
                className="contents"
                key={
                  editorState.mode === "create"
                    ? "create-template"
                    : `edit-${editorState.entry.id}`
                }
              >
                <QuoteLibraryEntryForm
                  action={
                    editorState.mode === "create"
                      ? createAction
                      : updateAction.bind(null, editorState.entry.id)
                  }
                  availableBlocks={availableBlocks}
                  fixedKind="template"
                  idPrefix={
                    editorState.mode === "create"
                      ? "quote-template-create"
                      : `quote-template-edit-${editorState.entry.id}`
                  }
                  initialValues={
                    editorState.mode === "edit"
                      ? {
                          kind: "template",
                          name: editorState.entry.name,
                          description: editorState.entry.description ?? "",
                          title: editorState.entry.title ?? "",
                          notes: editorState.entry.notes ?? "",
                          terms: editorState.entry.terms ?? "",
                          validityDays:
                            editorState.entry.validityDays != null
                              ? String(editorState.entry.validityDays)
                              : "14",
                          items: editorState.entry.items.map((item) => ({
                            id: item.id,
                            description: item.description,
                            quantity: String(item.quantity),
                            unitPrice: centsToMoneyInput(
                              item.unitPriceInCents,
                            ),
                          })),
                        }
                      : businessDefaults
                        ? {
                            kind: "template" as const,
                            name: "",
                            description: "",
                            title: "",
                            notes: businessDefaults.defaultQuoteNotes ?? "",
                            terms: businessDefaults.defaultQuoteTerms ?? "",
                            validityDays: String(
                              businessDefaults.defaultQuoteValidityDays ?? 14,
                            ),
                            items: [],
                          }
                        : undefined
                  }
                  layout="dialog"
                  onCancel={closeEditor}
                  onSuccess={closeEditor}
                  submitLabel={
                    editorState.mode === "create" ? "Create" : "Save changes"
                  }
                  submitPendingLabel="Saving..."
                />
              </div>
            </>
          ) : null}
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        deleteAction={deleteAction}
        entry={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onOptimisticRemove={removeItem}
      />
    </div>
  );
}

function TemplateRow({
  entry,
  motionState,
  itemRef,
  onDelete,
  onEdit,
}: {
  entry: DashboardQuoteLibraryEntry;
  motionState?: MotionState;
  itemRef?: (node: HTMLElement | null) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div ref={itemRef} className="motion-list-item group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/20 sm:items-center sm:gap-4 sm:px-5 sm:py-4" data-motion-state={motionState}>
      <div className="mt-0.5 rounded-lg bg-muted/60 p-2 sm:mt-0">
        <FileText className="size-4 text-muted-foreground" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {entry.name}
            </p>
            {entry.title ? (
              <Badge variant="outline" className="shrink-0 text-xs">
                {entry.title}
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {entry.itemCount} {entry.itemCount === 1 ? "item" : "items"}
            {entry.validityDays ? (
              <span> · {entry.validityDays} day validity</span>
            ) : null}
            {entry.items.length > 0 ? (
              <span>
                {" · "}
                {entry.items
                  .slice(0, 2)
                  .map((i) => i.description)
                  .join(", ")}
                {entry.items.length > 2
                  ? ` +${entry.items.length - 2}`
                  : ""}
              </span>
            ) : null}
          </p>
        </div>

        <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {formatQuoteMoney(entry.totalInCents, entry.currency)}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Actions for ${entry.name}`}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DeleteConfirmDialog({
  deleteAction,
  entry,
  onClose,
  onOptimisticRemove,
}: {
  deleteAction: (
    entryId: string,
    state: QuoteLibraryDeleteActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryDeleteActionState>;
  entry: DashboardQuoteLibraryEntry | null;
  onClose: () => void;
  onOptimisticRemove: (
    id: string,
    mutation?: () => Promise<OptimisticActionResult>,
  ) => void;
}) {
  if (!entry) return null;
  return (
    <DeleteConfirmDialogInner
      deleteAction={deleteAction}
      entry={entry}
      onClose={onClose}
      onOptimisticRemove={onOptimisticRemove}
    />
  );
}

function DeleteConfirmDialogInner({
  deleteAction,
  entry,
  onClose,
  onOptimisticRemove,
}: {
  deleteAction: (
    entryId: string,
    state: QuoteLibraryDeleteActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryDeleteActionState>;
  entry: DashboardQuoteLibraryEntry;
  onClose: () => void;
  onOptimisticRemove: (
    id: string,
    mutation?: () => Promise<OptimisticActionResult>,
  ) => void;
}) {
  function handleDelete() {
    onClose();
    onOptimisticRemove(entry.id, async () => {
      const result = await deleteAction(entry.id, {}, new FormData());
      return {
        error: result.error,
        success: result.success ? "Deleted" : undefined,
      };
    });
  }

  return (
    <ConfirmationDialog
      open={Boolean(entry)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Delete template?"
      description={
        <>
          This permanently removes &ldquo;{entry.name}&rdquo; from your
          library. Quotes already created from this template are not
          affected.
        </>
      }
      confirmLabel="Delete"
      onConfirm={handleDelete}
      tone="destructive"
      icon={Trash2}
    />
  );
}
