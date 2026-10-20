"use client";

import { useMemo } from "react";
import { CheckCircle2, CircleSlash, Clock, Edit, Mail, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DashboardQuoteDetail } from "@/features/quotes/types";
import type { QuoteStatus } from "@/features/quotes/types";
import { formatQuoteDate, formatQuoteDateTime } from "@/features/quotes/utils";

type PublicQuotePreviewInteractiveColumnProps = {
  quote: Pick<
    DashboardQuoteDetail,
    | "status"
    | "validUntil"
    | "customerRespondedAt"
    | "customerResponseMessage"
  >;
  businessContactEmail: string | null;
  businessName: string;
};

/**
 * Read-only version of the public quote interactive column for the preview page.
 * Renders the same visual layout as the customer-facing column but with all
 * interactive elements disabled.
 */
export function PublicQuotePreviewInteractiveColumn({
  quote,
  businessContactEmail,
  businessName,
}: PublicQuotePreviewInteractiveColumnProps) {
  const displayStatus = quote.status;
  const isActionable = displayStatus === "sent";

  const statusInfo = useMemo(() => {
    return getStatusInfo(displayStatus, quote.validUntil);
  }, [displayStatus, quote.validUntil]);

  return (
    <div className="flex flex-col gap-5">
      {isActionable ? (
        <div className="rounded-xl border border-border/60 bg-background/95 px-4 py-5 shadow-sm sm:p-6">
          <p className="mb-4 text-sm font-medium text-muted-foreground">
            Ready to respond?
          </p>
          <div className="flex flex-col gap-3">
            <Button disabled className="w-full">
              <CheckCircle2 className="size-4" />
              Accept quote
            </Button>
            <Button disabled variant="outline" className="w-full">
              <XCircle className="size-4" />
              Decline quote
            </Button>
          </div>
          <div className="mt-4 border-t border-border/40 pt-4">
            <Button disabled variant="ghost" size="sm" className="w-full">
              <Edit className="size-3.5" />
              Request revision
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`flex items-start gap-3.5 rounded-xl border p-4 sm:p-5 ${statusInfo.bgColor}`}
        >
          <statusInfo.icon
            className={`mt-0.5 size-5 shrink-0 ${statusInfo.iconColor}`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {statusInfo.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {statusInfo.description}
            </p>
            {quote.customerRespondedAt ? (
              <p className="mt-2 text-xs text-muted-foreground/80">
                Responded {formatQuoteDateTime(quote.customerRespondedAt)}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {quote.customerResponseMessage ? (
        <div className="rounded-xl border border-border/50 px-4 py-4 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Customer message
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {quote.customerResponseMessage}
          </p>
        </div>
      ) : null}

      {businessContactEmail ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-sm text-muted-foreground">
            Have questions? Reach out to {businessName}.
          </p>
          <Button
            disabled
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
          >
            <Mail className="size-3.5" />
            Contact
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function getStatusInfo(status: QuoteStatus, validUntil: string) {
  if (status === "accepted") {
    return {
      icon: CheckCircle2,
      iconColor: "text-success",
      bgColor: "border-success/30 bg-success/10",
      title: "Quote accepted",
      description: "The customer accepted this quote.",
    };
  }
  if (status === "rejected") {
    return {
      icon: XCircle,
      iconColor: "text-destructive",
      bgColor: "border-destructive/30 bg-destructive/10",
      title: "Quote declined",
      description: "The customer declined this quote.",
    };
  }
  if (status === "revision_requested") {
    return {
      icon: Edit,
      iconColor: "text-warning",
      bgColor: "border-warning/30 bg-warning/10",
      title: "Revision requested",
      description: "The customer requested changes to this quote.",
    };
  }
  if (status === "voided") {
    return {
      icon: CircleSlash,
      iconColor: "text-muted-foreground",
      bgColor: "border-border/60 bg-muted/30",
      title: "Quote voided",
      description: "This quote was voided and is no longer active.",
    };
  }
  if (status === "expired") {
    return {
      icon: Clock,
      iconColor: "text-warning",
      bgColor: "border-warning/30 bg-warning/10",
      title: "Quote expired",
      description: `This quote expired on ${formatQuoteDate(validUntil)}. Contact the business if you'd still like to proceed.`,
    };
  }
  if (status === "draft") {
    return {
      icon: CircleSlash,
      iconColor: "text-muted-foreground",
      bgColor: "border-border/60 bg-muted/30",
      title: "Draft",
      description: "This quote has not been sent yet. The customer will see the response options once it is sent.",
    };
  }
  return {
    icon: CircleSlash,
    iconColor: "text-muted-foreground",
    bgColor: "border-border/60 bg-muted/30",
    title: "Quote closed",
    description: "This quote is no longer accepting responses.",
  };
}
