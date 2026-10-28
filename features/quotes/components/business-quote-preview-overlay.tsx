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
import { PublicQuotePageRenderer } from "@/features/quotes/components/public-quote-page-renderer";
import { PublicQuotePreviewInteractiveColumn } from "@/features/quotes/components/public-quote-preview-interactive-column";
import type { PublicQuoteView } from "@/features/quotes/types";
import type { PlanTier } from "@/lib/plans/plans";

type BusinessQuotePreviewOverlayProps = {
  quote: PublicQuoteView;
  businessPlan: PlanTier;
  businessContactEmail: string | null;
  businessName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Href to the public customer-facing quote page (when available). */
  openQuoteHref?: string | null;
};

export function BusinessQuotePreviewOverlay({
  quote,
  businessPlan,
  businessContactEmail,
  businessName,
  open,
  onOpenChange,
  openQuoteHref,
}: BusinessQuotePreviewOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-0 shadow-none sm:inset-0 sm:w-screen sm:translate-x-0 sm:translate-y-0"
        data-testid="quote-preview-overlay"
        showCloseButton={false}
        surface="page"
      >
        <DialogTitle className="sr-only">Quote preview</DialogTitle>
        <DialogDescription className="sr-only">
          Preview the quote as your customer will see it. Return to the quote
          detail without leaving the page.
        </DialogDescription>

        <div className="flex h-full min-h-0 flex-col bg-background">
          <div className="sticky top-0 z-10 border-b border-border/75 bg-background/95 px-4 py-3 backdrop-blur sm:px-6 xl:px-8">
            <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="meta-label">Preview</p>
                <p className="font-heading text-lg font-semibold tracking-tight text-foreground">
                  Quote preview
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
                  Back to quote
                </Button>
                {openQuoteHref ? (
                  <Button asChild className="w-full sm:w-auto" type="button">
                    <Link
                      href={openQuoteHref}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open quote
                      <ArrowUpRight data-icon="inline-end" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <PublicQuotePageRenderer
              quote={quote}
              businessPlan={businessPlan}
              interactiveColumn={
                <PublicQuotePreviewInteractiveColumn
                  quote={quote}
                  businessContactEmail={businessContactEmail}
                  businessName={businessName}
                />
              }
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
