"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Ban,
  ChevronDown,
  Download,
  Ellipsis,
  FileText,
  Pencil,
  Printer,
} from "lucide-react";

import { OptimisticPendingIndicator } from "@/components/shared/optimistic-pending-indicator";
import { VoidInvoiceDialog } from "@/features/invoices/components/void-invoice-dialog";
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
import type { InvoiceActionState } from "@/features/invoices/types";

type InvoiceManageDropdownProps = {
  editHref: string | null;
  printHref: string | null;
  canVoid: boolean;
  voidAction: (
    state: InvoiceActionState,
    formData: FormData,
  ) => Promise<InvoiceActionState>;
  pdfHref?: string;
  pngHref?: string;
};

const initialState: InvoiceActionState = {};

export function InvoiceManageDropdown({
  editHref,
  printHref,
  canVoid,
  voidAction,
  pdfHref,
  pngHref,
}: InvoiceManageDropdownProps) {
  const { runMutation, isPendingKey } = useOptimisticMutation();
  const [confirmVoid, setConfirmVoid] = useState(false);

  function submitVoid(formData: FormData) {
    runMutation({
      applyOptimistic: () => {},
      revertOptimistic: () => {},
      mutation: () => voidAction(initialState, formData),
      pendingKey: "void",
      refreshOnSuccess: true,
    });
  }

  const isPending = isPendingKey("void");
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
          {editHref ? (
            <DropdownMenuItem asChild>
              <Link href={editHref}>
                <Pencil />
                Edit draft
              </Link>
            </DropdownMenuItem>
          ) : null}
          {printHref ? (
            <DropdownMenuItem asChild>
              <Link href={printHref}>
                <Printer />
                Print
              </Link>
            </DropdownMenuItem>
          ) : null}
          {canVoid ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmVoid(true)}
              >
                <Ban />
                Void invoice
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <VoidInvoiceDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        title="Void this invoice?"
        description="Voiding keeps the record for audit history but removes it from balances. Void all recorded payments first."
        confirmLabel="Void invoice"
        onConfirm={(formData) => {
          submitVoid(formData);
          setConfirmVoid(false);
        }}
        isPending={isPending}
      />
    </>
  );
}
