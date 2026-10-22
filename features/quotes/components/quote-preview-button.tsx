"use client";

import { useState } from "react";
import { ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { BusinessQuotePreviewOverlay } from "@/features/quotes/components/business-quote-preview-overlay";
import type { PublicQuoteView } from "@/features/quotes/types";
import type { PlanTier } from "@/lib/plans/plans";

type QuotePreviewButtonProps = {
  quote: PublicQuoteView;
  businessPlan: PlanTier;
  businessContactEmail: string | null;
  businessName: string;
  /** Href to the public customer-facing quote page (when available). */
  openQuoteHref?: string | null;
  variant?: React.ComponentProps<typeof Button>["variant"];
};

/**
 * Single "Preview" button. Opens the in-app preview overlay; public link and
 * copy actions live in the header's "More actions" menu to keep one primary
 * per status.
 */
export function QuotePreviewButton({
  quote,
  businessPlan,
  businessContactEmail,
  businessName,
  openQuoteHref,
  variant = "default",
}: QuotePreviewButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        type="button"
        variant={variant}
        size="sm"
        className={mobileNavbarIconButtonClassName}
        aria-label="Preview quote"
        title="Preview quote"
      >
        <ReceiptText data-icon="inline-start" />
        <span className="hidden lg:inline">Preview</span>
      </Button>

      <BusinessQuotePreviewOverlay
        quote={quote}
        businessPlan={businessPlan}
        businessContactEmail={businessContactEmail}
        businessName={businessName}
        open={open}
        onOpenChange={setOpen}
        openQuoteHref={openQuoteHref}
      />
    </>
  );
}
