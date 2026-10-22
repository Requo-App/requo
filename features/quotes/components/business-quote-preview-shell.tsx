"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PublicQuotePageRenderer } from "@/features/quotes/components/public-quote-page-renderer";
import { PublicQuotePreviewInteractiveColumn } from "@/features/quotes/components/public-quote-preview-interactive-column";
import type { PublicQuoteView } from "@/features/quotes/types";
import type { PlanTier } from "@/lib/plans/plans";

type BusinessQuotePreviewShellProps = {
  quote: PublicQuoteView;
  businessPlan: PlanTier;
  businessContactEmail: string | null;
  businessName: string;
  backHref: string;
};

/**
 * Preview shell for the quote page — wraps the shared PublicQuotePageRenderer
 * with a "Back to quote" header action and disabled interactive column.
 * Mirrors the pattern used by ServicePreviewShell for form preview.
 */
export function BusinessQuotePreviewShell({
  quote,
  businessPlan,
  businessContactEmail,
  businessName,
  backHref,
}: BusinessQuotePreviewShellProps) {
  return (
    <PublicQuotePageRenderer
      quote={quote}
      businessPlan={businessPlan}
      headerAction={
        <Button asChild variant="outline">
          <Link href={backHref} prefetch={true}>
            <ArrowLeft data-icon="inline-start" />
            Back to quote
          </Link>
        </Button>
      }
      interactiveColumn={
        <PublicQuotePreviewInteractiveColumn
          quote={quote}
          businessContactEmail={businessContactEmail}
          businessName={businessName}
        />
      }
    />
  );
}
