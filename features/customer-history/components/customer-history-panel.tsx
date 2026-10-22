import Link from "next/link";
import { FileText, History, ReceiptText } from "lucide-react";

import {
  DashboardDetailFeed,
  DashboardDetailFeedItem,
  DashboardEmptyState,
} from "@/components/shared/dashboard-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CustomerHistoryData } from "@/features/customer-history/types";
import { InquiryStatusBadge } from "@/features/inquiries/components/inquiry-status-badge";
import { formatInquiryDate } from "@/features/inquiries/utils";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";
import { formatQuoteMoney } from "@/features/quotes/utils";
import {
  getBusinessInquiryPath,
  getBusinessQuotePath,
} from "@/features/businesses/routes";

type CustomerHistoryPanelProps = {
  history: CustomerHistoryData | null;
  businessSlug: string;
};

type CustomerHistoryTimelineItem =
  | {
      kind: "inquiry";
      id: string;
      label: string;
      status: CustomerHistoryData["inquiries"][number]["status"];
      date: Date;
    }
  | {
      kind: "quote";
      id: string;
      label: string;
      status: CustomerHistoryData["quotes"][number]["status"];
      amount: number;
      currency: string;
      date: Date;
      quoteNumber: string;
    };

export function CustomerHistoryPanel({
  history,
  businessSlug,
}: CustomerHistoryPanelProps) {
  if (!history) {
    return (
      <DashboardEmptyState
        description="This customer does not have other inquiry or quote records in the business yet."
        icon={History}
        title="No customer history"
        variant="section"
      />
    );
  }

  const timeline = getCustomerHistoryTimeline(history);

  return (
    <div className="flex flex-col gap-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Inquiries" value={history.inquiryCount} />
        <StatCard label="Quotes" value={history.quoteCount} />
      </div>

      {/* Latest outcome */}
      {history.latestOutcome ? (
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/40 px-4 py-3">
          <span className="text-sm text-muted-foreground">Latest outcome</span>
          <div className="ml-auto">
            {history.latestOutcome.kind === "inquiry" ? (
              <InquiryStatusBadge status={history.latestOutcome.status} />
            ) : (
              <QuoteStatusBadge status={history.latestOutcome.status} />
            )}
          </div>
        </div>
      ) : null}

      {/* Timeline with tabs */}
      <Tabs className="min-h-0 flex-1 gap-4" defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({timeline.length})</TabsTrigger>
          <TabsTrigger value="inquiries">
            Inquiries ({history.inquiries.length})
          </TabsTrigger>
          <TabsTrigger value="quotes">
            Quotes ({history.quotes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {timeline.length ? (
            <DashboardDetailFeed>
              {timeline.map((item) => (
                <TimelineItem
                  key={item.id}
                  businessSlug={businessSlug}
                  item={item}
                />
              ))}
            </DashboardDetailFeed>
          ) : (
            <DashboardEmptyState
              description="No prior activity for this customer."
              icon={History}
              title="No history"
              variant="section"
            />
          )}
        </TabsContent>

        <TabsContent value="inquiries">
          {history.inquiries.length ? (
            <DashboardDetailFeed>
              {history.inquiries.map((inquiry) => (
                <DashboardDetailFeedItem
                  key={inquiry.id}
                  action={<InquiryStatusBadge status={inquiry.status} />}
                  meta={`Submitted ${formatInquiryDate(inquiry.submittedAt)}`}
                  title={
                    <Link
                      className="inline-flex items-center gap-2 underline-offset-4 hover:text-primary hover:underline"
                      href={getBusinessInquiryPath(businessSlug, inquiry.id)}
                    >
                      <FileText className="size-4 text-muted-foreground" />
                      <span>{inquiry.subject ?? "Inquiry"}</span>
                    </Link>
                  }
                />
              ))}
            </DashboardDetailFeed>
          ) : (
            <DashboardEmptyState
              description="No prior inquiries from this customer."
              icon={History}
              title="No inquiries"
              variant="section"
            />
          )}
        </TabsContent>

        <TabsContent value="quotes">
          {history.quotes.length ? (
            <DashboardDetailFeed>
              {history.quotes.map((quote) => (
                <DashboardDetailFeedItem
                  key={quote.id}
                  action={
                    <QuoteStatusBadge status={quote.status} />
                  }
                  meta={`${formatQuoteMoney(quote.totalInCents, quote.currency)} · Created ${formatInquiryDate(quote.createdAt)}`}
                  title={
                    <Link
                      className="inline-flex items-center gap-2 underline-offset-4 hover:text-primary hover:underline"
                      href={getBusinessQuotePath(businessSlug, quote.id)}
                    >
                      <ReceiptText className="size-4 text-muted-foreground" />
                      <span>
                        {quote.quoteNumber} · {quote.title}
                      </span>
                    </Link>
                  }
                />
              ))}
            </DashboardDetailFeed>
          ) : (
            <DashboardEmptyState
              description="No prior quotes for this customer."
              icon={History}
              title="No quotes"
              variant="section"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TimelineItem({
  item,
  businessSlug,
}: {
  item: CustomerHistoryTimelineItem;
  businessSlug: string;
}) {
  if (item.kind === "inquiry") {
    return (
      <DashboardDetailFeedItem
        action={<InquiryStatusBadge status={item.status} />}
        meta={`Inquiry · Submitted ${formatInquiryDate(item.date)}`}
        title={
          <Link
            className="inline-flex items-center gap-2 underline-offset-4 hover:text-primary hover:underline"
            href={getBusinessInquiryPath(businessSlug, item.id)}
          >
            <FileText className="size-4 text-muted-foreground" />
            <span>{item.label}</span>
          </Link>
        }
      />
    );
  }

  return (
    <DashboardDetailFeedItem
      action={
        <QuoteStatusBadge status={item.status} />
      }
      meta={`${formatQuoteMoney(item.amount, item.currency)} · Quote · Created ${formatInquiryDate(item.date)}`}
      title={
        <Link
          className="inline-flex items-center gap-2 underline-offset-4 hover:text-primary hover:underline"
          href={getBusinessQuotePath(businessSlug, item.id)}
        >
          <ReceiptText className="size-4 text-muted-foreground" />
          <span>
            {item.quoteNumber} · {item.label}
          </span>
        </Link>
      }
    />
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-4 py-3">
      <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function getCustomerHistoryTimeline(history: CustomerHistoryData): CustomerHistoryTimelineItem[] {
  return [
    ...history.inquiries.map((inquiry) => ({
      kind: "inquiry" as const,
      id: inquiry.id,
      label: inquiry.subject ?? "Inquiry",
      status: inquiry.status,
      date: inquiry.submittedAt,
    })),
    ...history.quotes.map((quote) => ({
      kind: "quote" as const,
      id: quote.id,
      label: quote.title,
      status: quote.status,
      amount: quote.totalInCents,
      currency: quote.currency,
      date: quote.createdAt,
      quoteNumber: quote.quoteNumber,
    })),
  ].sort((left, right) => right.date.getTime() - left.date.getTime());
}
