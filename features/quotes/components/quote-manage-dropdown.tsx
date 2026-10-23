"use client";

import Link from "next/link";
import { useOptimistic, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Ellipsis,
  FileText,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { OptimisticPendingIndicator } from "@/components/shared/optimistic-pending-indicator";
import {
  ConfirmationDialog,
  type ConfirmationTone,
} from "@/components/shared/confirmation-dialog";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import type {
  QuoteCompletionActionState,
  QuoteLibraryActionState,
  QuoteRecordActionState,
  QuoteStatus,
} from "@/features/quotes/types";

type QuoteManageDropdownProps = {
  archiveAction: (
    state: QuoteRecordActionState,
    formData: FormData,
  ) => Promise<QuoteRecordActionState>;
  businessQuoteListHref: string;
  deleteDraftAction: (
    state: QuoteRecordActionState,
    formData: FormData,
  ) => Promise<QuoteRecordActionState>;
  isArchived: boolean;
  restoreArchivedAction: (
    state: QuoteRecordActionState,
    formData: FormData,
  ) => Promise<QuoteRecordActionState>;
  saveAsTemplateAction?: () => Promise<QuoteLibraryActionState>;
  status: QuoteStatus;
  voidAction: (
    state: QuoteRecordActionState,
    formData: FormData,
  ) => Promise<QuoteRecordActionState>;
  pdfHref?: string;
  pngHref?: string;
  openQuoteHref?: string | null;
  showMarkWorkDone?: boolean;
  completeAction?: (
    state: QuoteCompletionActionState,
    formData: FormData,
  ) => Promise<QuoteCompletionActionState>;
};

type ConfirmAction = "delete" | "void" | "archive" | "restore" | "complete" | null;

const initialState: QuoteRecordActionState = {};
const initialCompletionState: QuoteCompletionActionState = {};

export function QuoteManageDropdown({
  archiveAction,
  businessQuoteListHref,
  deleteDraftAction,
  isArchived,
  restoreArchivedAction,
  saveAsTemplateAction,
  status,
  voidAction,
  pdfHref,
  pngHref,
  openQuoteHref,
  showMarkWorkDone = false,
  completeAction,
}: QuoteManageDropdownProps) {
  const { runMutation, isPendingKey } = useOptimisticMutation();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [copied, setCopied] = useState(false);

  const [optimisticIsArchived, setOptimisticIsArchived] = useOptimistic(
    isArchived,
    (_current, nextArchived: boolean) => nextArchived,
  );
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(
    status,
    (_current, nextStatus: QuoteStatus) => nextStatus,
  );

  async function handleCopyLink() {
    if (!openQuoteHref) return;
    try {
      await navigator.clipboard.writeText(openQuoteHref);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (error) {
      console.error("Failed to copy public quote URL.", error);
    }
  }

  function submitArchive() {
    runMutation({
      applyOptimistic: () => {
        setOptimisticIsArchived(true);
      },
      revertOptimistic: () => {
        setOptimisticIsArchived(isArchived);
      },
      mutation: () => archiveAction(initialState, new FormData()),
      pendingKey: "archive",
      refreshOnSuccess: true,
    });
  }

  function submitRestore() {
    runMutation({
      applyOptimistic: () => {
        setOptimisticIsArchived(false);
      },
      revertOptimistic: () => {
        setOptimisticIsArchived(isArchived);
      },
      mutation: () => restoreArchivedAction(initialState, new FormData()),
      pendingKey: "restore",
      refreshOnSuccess: true,
    });
  }

  function submitVoid() {
    runMutation({
      applyOptimistic: () => {
        setOptimisticStatus("voided");
      },
      revertOptimistic: () => {
        setOptimisticStatus(status);
      },
      mutation: () => voidAction(initialState, new FormData()),
      pendingKey: "void",
      refreshOnSuccess: true,
    });
  }

  function submitComplete() {
    if (!completeAction) return;
    runMutation({
      applyOptimistic: () => {},
      revertOptimistic: () => {},
      mutation: () => completeAction(initialCompletionState, new FormData()),
      pendingKey: "complete",
      refreshOnSuccess: true,
    });
  }

  function submitDelete() {
    runMutation({
      applyOptimistic: () => {},
      revertOptimistic: () => {},
      mutation: async () => {
        const formData = new FormData();
        formData.set("redirectHref", businessQuoteListHref);
        return deleteDraftAction(initialState, formData);
      },
      pendingKey: "delete",
      refreshOnSuccess: false,
      onSuccess: () => {
        window.location.assign(businessQuoteListHref);
      },
    });
  }

  function handleSaveAsTemplate() {
    if (!saveAsTemplateAction || isPendingKey("template")) return;

    runMutation({
      applyOptimistic: () => {},
      revertOptimistic: () => {},
      mutation: saveAsTemplateAction,
      pendingKey: "template",
      refreshOnSuccess: true,
    });
  }

  function handleConfirm() {
    if (confirmAction === "delete") {
      void submitDelete();
    } else if (confirmAction === "void") {
      void submitVoid();
    } else if (confirmAction === "archive") {
      void submitArchive();
    } else if (confirmAction === "restore") {
      void submitRestore();
    } else if (confirmAction === "complete") {
      void submitComplete();
    }
    setConfirmAction(null);
  }

  const isPending =
    isPendingKey("archive") ||
    isPendingKey("restore") ||
    isPendingKey("delete") ||
    isPendingKey("void") ||
    isPendingKey("template") ||
    isPendingKey("complete");
  const confirmConfig: Record<
    Exclude<ConfirmAction, null>,
    {
      title: string;
      description: string;
      label: string;
      icon: LucideIcon;
      tone: ConfirmationTone;
    }
  > = {
    delete: {
      title: "Delete draft quote?",
      description: "This removes the draft from normal quote views. Sent and historical quotes are preserved.",
      label: "Delete draft",
      icon: Trash2,
      tone: "destructive",
    },
    void: {
      title: "Void this quote?",
      description: "Voiding keeps the record for history, but the customer can no longer accept it online.",
      label: "Void quote",
      icon: Ban,
      tone: "destructive",
    },
    archive: {
      title: "Archive this quote?",
      description: "Archived quotes are hidden from the active list. You can restore them later.",
      label: "Archive",
      icon: Archive,
      tone: "neutral",
    },
    restore: {
      title: "Restore this quote?",
      description: "This will move the quote back to the active list.",
      label: "Restore",
      icon: RotateCcw,
      tone: "neutral",
    },
    complete: {
      title: "Mark this work as done?",
      description:
        "This closes out the accepted quote without requiring an invoice. Use this when no further billing or tracking is needed.",
      label: "Mark work done",
      icon: CheckCircle2,
      tone: "neutral",
    },
  };

  const config = confirmAction ? confirmConfig[confirmAction] : null;
  const showShareGroup = Boolean(openQuoteHref);
  const showExportGroup = Boolean(pdfHref || pngHref);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={mobileNavbarIconButtonClassName}
            aria-label="More actions"
            title="More actions"
          >
            <Ellipsis aria-hidden="true" className="lg:hidden" />
            <span className="hidden lg:inline">More actions</span>
            <ChevronDown data-icon="inline-end" className="opacity-60 max-lg:hidden" />
            <OptimisticPendingIndicator pending={isPending} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {showShareGroup && openQuoteHref ? (
            <>
              <DropdownMenuItem asChild>
                <Link href={openQuoteHref} rel="noreferrer" target="_blank">
                  <ArrowUpRight />
                  Open public quote
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleCopyLink()}>
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy link"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {pdfHref ? (
            <DropdownMenuItem asChild>
              <a aria-label="Export PDF" href={pdfHref}>
                <Download />
                Export PDF
              </a>
            </DropdownMenuItem>
          ) : null}
          {pngHref ? (
            <DropdownMenuItem asChild>
              <a aria-label="Export PNG" href={pngHref}>
                <FileText />
                Export PNG
              </a>
            </DropdownMenuItem>
          ) : null}
          {showExportGroup ? <DropdownMenuSeparator /> : null}
          {showMarkWorkDone ? (
            <DropdownMenuItem onSelect={() => setConfirmAction("complete")}>
              <CheckCircle2 />
              Mark work done
            </DropdownMenuItem>
          ) : null}
          {saveAsTemplateAction ? (
            <DropdownMenuItem
              disabled={isPendingKey("template")}
              onSelect={handleSaveAsTemplate}
            >
              <FileText />
              Save as template
            </DropdownMenuItem>
          ) : null}
          {optimisticStatus === "draft" ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmAction("delete")}
            >
              <Trash2 />
              Delete draft
            </DropdownMenuItem>
          ) : (
            <>
              {optimisticIsArchived ? (
                <DropdownMenuItem onSelect={() => setConfirmAction("restore")}>
                  <RotateCcw />
                  Restore to active
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setConfirmAction("archive")}>
                  <Archive />
                  Archive
                </DropdownMenuItem>
              )}
              {optimisticStatus === "sent" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setConfirmAction("void")}
                  >
                    <Ban />
                    Void quote
                  </DropdownMenuItem>
                </>
              ) : null}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {config ? (
        <ConfirmationDialog
          open={confirmAction !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={config.title}
          description={config.description}
          confirmLabel={config.label}
          onConfirm={handleConfirm}
          isPending={isPending}
          tone={config.tone}
          icon={config.icon}
        />
      ) : null}
    </>
  );
}
