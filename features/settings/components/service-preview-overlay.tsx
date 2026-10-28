"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PublicInquiryPageRenderer } from "@/features/inquiries/components/public-inquiry-page-renderer";
import type {
  PublicInquiryBusiness,
  PublicInquiryFormState,
} from "@/features/inquiries/types";

type ServicePreviewOverlayProps = {
  business: PublicInquiryBusiness;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openFormHref: string;
};

async function previewOnlyAction(
  state: PublicInquiryFormState,
  formData: FormData,
): Promise<PublicInquiryFormState> {
  void formData;
  return state;
}

export function ServicePreviewOverlay({
  business,
  open,
  onOpenChange,
  openFormHref,
}: ServicePreviewOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-0 shadow-none sm:inset-0 sm:w-screen sm:translate-x-0 sm:translate-y-0"
        data-testid="inquiry-form-preview-overlay"
        showCloseButton={false}
        surface="page"
      >
        <DialogTitle className="sr-only">Service preview</DialogTitle>
        <DialogDescription className="sr-only">
          Review the current inquiry form draft and return to the editor without
          leaving the page.
        </DialogDescription>

        <div className="flex h-full min-h-0 flex-col bg-background">
          <div className="sticky top-0 z-10 border-b border-border/75 bg-background/95 px-4 py-3 backdrop-blur sm:px-6 xl:px-8">
            <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="meta-label">Preview</p>
                <p className="font-heading text-lg font-semibold tracking-tight text-foreground">
                  Service preview
                </p>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => onOpenChange(false)}
                  type="button"
                  variant="outline"
                >
                  <ArrowLeft data-icon="inline-start" />
                  Back to editor
                </Button>
                <Button asChild className="w-full sm:w-auto" type="button">
                  <Link
                    href={openFormHref}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open form
                    <ArrowUpRight data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <PublicInquiryPageRenderer
              action={previewOnlyAction}
              business={business}
              previewMode
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
