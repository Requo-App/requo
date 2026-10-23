"use client";

import { useEffect, useOptimistic, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import { getInquiryStatusLabel } from "@/features/inquiries/utils";
import {
  inquiryWorkflowStatuses,
  type InquiryRecordActionState,
  type InquiryRecordState,
  type InquiryStatusActionState,
  type InquiryWorkflowStatus,
} from "@/features/inquiries/types";

type InquiryManageDropdownProps = {
  workflowStatus: InquiryWorkflowStatus;
  recordState: InquiryRecordState;
  businessInquiryListHref: string;
  statusAction: (
    state: InquiryStatusActionState,
    formData: FormData,
  ) => Promise<InquiryStatusActionState>;
  archiveAction: (
    state: InquiryRecordActionState,
    formData: FormData,
  ) => Promise<InquiryRecordActionState>;
  unarchiveAction: (
    state: InquiryRecordActionState,
    formData: FormData,
  ) => Promise<InquiryRecordActionState>;
  deleteAction: (
    state: InquiryRecordActionState,
    formData: FormData,
  ) => Promise<InquiryRecordActionState>;
  pdfHref?: string;
  pngHref?: string;
};

type ConfirmAction = "status" | "archive" | "unarchive" | "delete" | null;

const initialStatusState: InquiryStatusActionState = {};
const initialRecordState: InquiryRecordActionState = {};

export function InquiryManageDropdown({
  workflowStatus,
  recordState,
  businessInquiryListHref,
  statusAction,
  archiveAction,
  unarchiveAction,
  deleteAction,
  pdfHref,
  pngHref,
}: InquiryManageDropdownProps) {
  const { runMutation, isPendingKey } = useOptimisticMutation();
  const [selectedStatus, setSelectedStatus] = useState(workflowStatus);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const [optimisticWorkflowStatus, setOptimisticWorkflowStatus] = useOptimistic(
    workflowStatus,
    (_current, nextStatus: InquiryWorkflowStatus) => nextStatus,
  );
  const [optimisticRecordState, setOptimisticRecordState] = useOptimistic(
    recordState,
    (_current, nextState: InquiryRecordState) => nextState,
  );

  useEffect(() => {
    setSelectedStatus(workflowStatus);
  }, [workflowStatus]);

  function handleStatusSelect(status: string) {
    if (status === optimisticWorkflowStatus) return;
    setSelectedStatus(status as InquiryWorkflowStatus);
    setConfirmAction("status");
  }

  async function submitStatus() {
    const formData = new FormData();
    formData.set("status", selectedStatus);

    runMutation({
      applyOptimistic: () => {
        setOptimisticWorkflowStatus(selectedStatus);
      },
      revertOptimistic: () => {
        setOptimisticWorkflowStatus(workflowStatus);
      },
      mutation: () => statusAction(initialStatusState, formData),
      pendingKey: "status",
      refreshOnSuccess: true,
    });
  }

  async function submitArchive() {
    runMutation({
      applyOptimistic: () => {
        setOptimisticRecordState("archived");
      },
      revertOptimistic: () => {
        setOptimisticRecordState(recordState);
      },
      mutation: () => archiveAction(initialRecordState, new FormData()),
      pendingKey: "archive",
      refreshOnSuccess: true,
    });
  }

  async function submitUnarchive() {
    runMutation({
      applyOptimistic: () => {
        setOptimisticRecordState("active");
      },
      revertOptimistic: () => {
        setOptimisticRecordState(recordState);
      },
      mutation: () => unarchiveAction(initialRecordState, new FormData()),
      pendingKey: "unarchive",
      refreshOnSuccess: true,
    });
  }

  async function submitDelete() {
    runMutation({
      applyOptimistic: () => {},
      revertOptimistic: () => {},
      mutation: async () => {
        return deleteAction(initialRecordState, new FormData());
      },
      pendingKey: "delete",
      refreshOnSuccess: false,
      onSuccess: () => {
        window.location.assign(businessInquiryListHref);
      },
    });
  }

  function handleConfirm() {
    if (confirmAction === "status") {
      void submitStatus();
    } else if (confirmAction === "archive") {
      void submitArchive();
    } else if (confirmAction === "unarchive") {
      void submitUnarchive();
    } else if (confirmAction === "delete") {
      void submitDelete();
    }
    setConfirmAction(null);
  }

  const isPending =
    isPendingKey("status") ||
    isPendingKey("archive") ||
    isPendingKey("unarchive") ||
    isPendingKey("delete");
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
    status: {
      title: `Change status to "${getInquiryStatusLabel(selectedStatus)}"?`,
      description: `This will update the workflow status from "${getInquiryStatusLabel(optimisticWorkflowStatus)}" to "${getInquiryStatusLabel(selectedStatus)}".`,
      label: "Change status",
      icon: Check,
      tone: "neutral",
    },
    archive: {
      title: "Archive this inquiry?",
      description: "Archived inquiries are hidden from the active list. You can restore them later.",
      label: "Archive",
      icon: Archive,
      tone: "neutral",
    },
    unarchive: {
      title: "Restore this inquiry?",
      description: "This will move the inquiry back to the active list.",
      label: "Restore",
      icon: RotateCcw,
      tone: "neutral",
    },
    delete: {
      title: "Delete this inquiry?",
      description: "This permanently removes the inquiry from active views. This action cannot be undone.",
      label: "Delete",
      icon: Trash2,
      tone: "destructive",
    },
  };

  const config = confirmAction ? confirmConfig[confirmAction] : null;

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
            <ChevronDown
              data-icon="inline-end"
              className="opacity-60 max-lg:hidden"
            />
            <OptimisticPendingIndicator pending={isPending} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
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
          {pdfHref || pngHref ? <DropdownMenuSeparator /> : null}
          {optimisticRecordState === "active" ? (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-40">
                  {inquiryWorkflowStatuses.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onSelect={() => handleStatusSelect(status)}
                    >
                      <span className="flex w-full items-center justify-between">
                        {getInquiryStatusLabel(status)}
                        {status === optimisticWorkflowStatus ? (
                          <Check className="size-3.5 text-muted-foreground" />
                        ) : null}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={() => setConfirmAction("archive")}>
                <Archive />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmAction("delete")}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => setConfirmAction("unarchive")}>
                <RotateCcw />
                Restore to active
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmAction("delete")}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
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
