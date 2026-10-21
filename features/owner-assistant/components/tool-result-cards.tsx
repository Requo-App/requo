"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Inbox,
  Mail,
  TrendingUp,
  Users,
  XCircle,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  inquiryStatusLabels,
  inquiryStatusTones,
} from "@/features/inquiries/utils";
import { quoteStatusLabels, quoteStatusTones } from "@/features/quotes/utils";
import type {
  BaseToolResult,
  ConfirmationRequiredResult,
  ErrorResult,
} from "@/features/owner-assistant/types";

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelativeDate(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------

/**
 * Assistant tool payloads type `status` as an unvalidated `string`, so these
 * adapters narrow it against the canonical status maps and degrade to a
 * neutral tone for anything unrecognized. The colour vocabulary lives in
 * `components/shared/status-badge` — do not re-declare it here.
 *
 * `Object.hasOwn` rather than `in`: `in` walks the prototype chain, so a value
 * like `"constructor"` would resolve to a function instead of falling back.
 */
function resolveStatus<T extends string>(
  value: string,
  tones: Record<T, StatusTone>,
  labels: Record<T, string>,
): { tone: StatusTone; label: string } {
  return Object.hasOwn(tones, value)
    ? { tone: tones[value as T], label: labels[value as T] }
    : { tone: "neutral", label: value };
}

function InquiryStatusBadge({ status }: { status: string }) {
  const { tone, label } = resolveStatus(
    status,
    inquiryStatusTones,
    inquiryStatusLabels,
  );
  return <StatusBadge tone={tone} label={label} />;
}

function QuoteStatusBadge({ status }: { status: string }) {
  const { tone, label } = resolveStatus(
    status,
    quoteStatusTones,
    quoteStatusLabels,
  );
  return <StatusBadge tone={tone} label={label} />;
}

// ---------------------------------------------------------------------------
// InquiryListCard
// ---------------------------------------------------------------------------

interface InquiryRow {
  id: string;
  customerName: string;
  customerEmail: string;
  status: string;
  serviceName?: string | null;
  serviceSlug?: string | null;
  source?: string | null;
  aiAssisted?: boolean | null;
  createdAt: string | Date;
}

interface InquiryListResult extends BaseToolResult {
  type: "inquiry_list";
  data: {
    results: InquiryRow[];
    total: number;
    hasMore: boolean;
  };
}

interface InquiryListCardProps {
  result: InquiryListResult;
  businessSlug: string;
}

export function InquiryListCard({ result, businessSlug }: InquiryListCardProps) {
  const { results, total, hasMore } = result.data;

  if (results.length === 0) {
    return (
      <Card size="sm" className="tool-result-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">{result.summary}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No inquiries found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className="tool-result-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Inbox className="size-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-base truncate">{result.summary}</CardTitle>
          </div>
          <span className="meta-label shrink-0">{total} total</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border/60" role="list">
          {results.map((inquiry) => (
            <li key={inquiry.id} className="group">
              <Link
                href={`/${businessSlug}/inquiries/${inquiry.id}`}
                className="flex items-start gap-3 py-3 hover:bg-accent/50 -mx-4 px-4 sm:-mx-6 sm:px-6 rounded-none transition-colors first-of-type:rounded-t-none last-of-type:rounded-b-lg"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">
                      {inquiry.customerName}
                    </span>
                    <InquiryStatusBadge status={inquiry.status} />
                    {inquiry.aiAssisted && (
                      <Sparkles
                        className="size-3 text-primary shrink-0"
                        aria-label="AI assisted"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground truncate">
                      {inquiry.customerEmail}
                    </span>
                    {inquiry.serviceName && (
                      <span className="text-xs text-muted-foreground">
                        {inquiry.serviceName}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeDate(inquiry.createdAt)}
                    </span>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground/50 shrink-0 mt-0.5 group-hover:text-muted-foreground transition-colors" />
              </Link>
            </li>
          ))}
        </ul>
        {hasMore && (
          <div className="pt-3 border-t border-border/60 mt-1">
            <Link
              href={`/${businessSlug}/inquiries`}
              className="flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-4"
            >
              View all {total} inquiries
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// QuoteListCard
// ---------------------------------------------------------------------------

interface QuoteRow {
  id: string;
  quoteNumber?: string | null;
  customerName: string;
  customerEmail: string;
  status: string;
  total?: number | null;
  currency?: string | null;
  sentAt?: string | Date | null;
  createdAt: string | Date;
}

interface QuoteListResult extends BaseToolResult {
  type: "quote_list";
  data: {
    results: QuoteRow[];
    total: number;
    totalValue: number;
    /** The currency the totals are in. */
    currency: string;
    hasMore: boolean;
  };
}

interface QuoteListCardProps {
  result: QuoteListResult;
  businessSlug: string;
}

export function QuoteListCard({ result, businessSlug }: QuoteListCardProps) {
  const { results, total, totalValue, currency, hasMore } = result.data;

  if (results.length === 0) {
    return (
      <Card size="sm" className="tool-result-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">{result.summary}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No quotes found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className="tool-result-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-base truncate">{result.summary}</CardTitle>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {totalValue > 0 && (
              <span className="text-sm font-semibold text-foreground">
                {formatCurrency(totalValue, currency)}
              </span>
            )}
            <span className="meta-label">{total} total</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border/60" role="list">
          {results.map((quote) => (
            <li key={quote.id} className="group">
              <Link
                href={`/${businessSlug}/quotes/${quote.id}`}
                className="flex items-start gap-3 py-3 hover:bg-accent/50 -mx-4 px-4 sm:-mx-6 sm:px-6 rounded-none transition-colors first-of-type:rounded-t-none last-of-type:rounded-b-lg"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">
                      {quote.customerName}
                    </span>
                    {quote.quoteNumber && (
                      <span className="font-mono text-xs text-muted-foreground">
                        #{quote.quoteNumber}
                      </span>
                    )}
                    <QuoteStatusBadge status={quote.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground truncate">
                      {quote.customerEmail}
                    </span>
                    {quote.total != null && (
                      <span className="text-xs font-medium text-foreground">
                        {formatCurrency(quote.total, quote.currency ?? "USD")}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeDate(quote.sentAt ?? quote.createdAt)}
                    </span>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground/50 shrink-0 mt-0.5 group-hover:text-muted-foreground transition-colors" />
              </Link>
            </li>
          ))}
        </ul>
        {hasMore && (
          <div className="pt-3 border-t border-border/60 mt-1">
            <Link
              href={`/${businessSlug}/quotes`}
              className="flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-4"
            >
              View all {total} quotes
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// StatsSummaryCard
// ---------------------------------------------------------------------------

interface StatEntry {
  label: string;
  value: string | number;
  delta?: number;
  format?: "number" | "currency" | "percent";
  currency?: string;
}

interface StatsSummaryResult extends BaseToolResult {
  type: "stats_summary";
  data: {
    stats: StatEntry[];
    period?: string;
  };
}

interface StatsSummaryCardProps {
  result: StatsSummaryResult;
}

export function StatsSummaryCard({ result }: StatsSummaryCardProps) {
  const { stats, period } = result.data;

  return (
    <Card size="sm" className="tool-result-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">{result.summary}</CardTitle>
          </div>
          {period && <span className="meta-label shrink-0">{period}</span>}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((stat) => {
            const formattedValue =
              stat.format === "currency"
                ? formatCurrency(Number(stat.value), stat.currency)
                : stat.format === "percent"
                  ? `${Number(stat.value).toFixed(1)}%`
                  : stat.value;

            return (
              <div
                key={stat.label}
                className="rounded-lg bg-muted/50 px-3 py-2.5"
              >
                <dt className="meta-label">
                  {stat.label}
                </dt>
                <dd className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold text-foreground tabular-nums">
                    {formattedValue}
                  </span>
                  {stat.delta !== undefined && (
                    <span
                      className={cn(
                        "text-xs font-medium",
                        stat.delta >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-destructive",
                      )}
                    >
                      {stat.delta >= 0 ? "+" : ""}
                      {stat.delta.toFixed(1)}%
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ChartDataCard
// ---------------------------------------------------------------------------

interface ChartSeries {
  name: string;
  data: Array<{ label: string; value: number }>;
}

interface ChartDataResult extends BaseToolResult {
  type: "chart_data";
  data: {
    chartType: "bar" | "line" | "area";
    series: ChartSeries[];
    xAxisLabel?: string;
    yAxisLabel?: string;
    valueFormat?: "number" | "currency" | "percent";
    currency?: string;
  };
}

interface ChartDataCardProps {
  result: ChartDataResult;
}

export function ChartDataCard({ result }: ChartDataCardProps) {
  const { series, valueFormat, currency } = result.data;
  const primarySeries = series[0];

  if (!primarySeries || primarySeries.data.length === 0) {
    return (
      <Card size="sm" className="tool-result-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">{result.summary}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No chart data available.</p>
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(...primarySeries.data.map((d) => d.value));

  const formatVal = (v: number) =>
    valueFormat === "currency"
      ? formatCurrency(v, currency)
      : valueFormat === "percent"
        ? `${v.toFixed(1)}%`
        : String(v);

  return (
    <Card size="sm" className="tool-result-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">{result.summary}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Minimal bar chart visualization */}
        <div
          className="flex items-end gap-1"
          role="img"
          aria-label={`Bar chart: ${result.summary}`}
        >
          {primarySeries.data.map((point) => {
            const height = max > 0 ? Math.max(4, (point.value / max) * 80) : 4;
            return (
              <div
                key={point.label}
                className="flex flex-1 flex-col items-center gap-1 group"
                title={`${point.label}: ${formatVal(point.value)}`}
              >
                <div
                  className="w-full rounded-sm bg-primary/80 transition-all group-hover:bg-primary"
                  style={{ height: `${height}px` }}
                />
                <span className="text-xs text-muted-foreground truncate w-full text-center">
                  {point.label}
                </span>
              </div>
            );
          })}
        </div>
        {/* Series legend if multiple series */}
        {series.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {series.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-primary" />
                {s.name}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeResultsCard
// ---------------------------------------------------------------------------

interface KnowledgeChunk {
  id: string;
  content: string;
  category?: string | null;
  relevanceScore?: number | null;
  fileName?: string | null;
}

interface KnowledgeResultsResult extends BaseToolResult {
  type: "knowledge_results";
  data: {
    chunks: KnowledgeChunk[];
    query: string;
  };
}

interface KnowledgeResultsCardProps {
  result: KnowledgeResultsResult;
}

export function KnowledgeResultsCard({ result }: KnowledgeResultsCardProps) {
  const { chunks } = result.data;

  if (chunks.length === 0) {
    return (
      <Card size="sm" className="tool-result-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">{result.summary}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No knowledge found for this query.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className="tool-result-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">{result.summary}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col gap-2">
          {chunks.map((chunk) => (
            <div
              key={chunk.id}
              className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5"
            >
              {chunk.category && (
                <span className="meta-label block mb-1">{chunk.category}</span>
              )}
              <p className="text-sm text-foreground leading-6 line-clamp-3">
                {chunk.content}
              </p>
              {chunk.fileName && (
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  {chunk.fileName}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CustomerListCard
// ---------------------------------------------------------------------------

interface CustomerRow {
  email: string;
  name?: string | null;
  inquiryCount?: number;
  quoteCount?: number;
  acceptedQuoteCount?: number;
}

interface CustomerListResult extends BaseToolResult {
  type: "customer_list";
  data: {
    results: CustomerRow[];
    total: number;
    hasMore: boolean;
  };
}

interface CustomerListCardProps {
  result: CustomerListResult;
  businessSlug: string;
}

export function CustomerListCard({ result, businessSlug }: CustomerListCardProps) {
  const { results, total } = result.data;

  if (results.length === 0) {
    return (
      <Card size="sm" className="tool-result-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">{result.summary}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No customers found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className="tool-result-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="size-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-base truncate">{result.summary}</CardTitle>
          </div>
          <span className="meta-label shrink-0">{total} total</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border/60" role="list">
          {results.map((customer) => (
            <li key={customer.email} className="py-2.5">
              <div className="flex items-center gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground uppercase">
                  {(customer.name ?? customer.email).charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  {customer.name && (
                    <p className="text-sm font-medium text-foreground truncate">
                      {customer.name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">
                    {customer.email}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {customer.inquiryCount != null && (
                    <span
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                      title={`${customer.inquiryCount} inquiries`}
                    >
                      <Inbox className="size-3" />
                      {customer.inquiryCount}
                    </span>
                  )}
                  {customer.quoteCount != null && (
                    <span
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                      title={`${customer.quoteCount} quotes`}
                    >
                      <FileText className="size-3" />
                      {customer.quoteCount}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {result.data.hasMore && (
          <div className="pt-3 border-t border-border/60 mt-1">
            <Link
              href={`/${businessSlug}/inquiries`}
              className="flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-4"
            >
              View all customers
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Action result cards (write operations)
// ---------------------------------------------------------------------------

interface ActionSuccessResult extends BaseToolResult {
  type:
    | "inquiry_created"
    | "quote_created"
    | "inquiry_updated"
    | "quote_sent"
    | "follow_up_scheduled";
  data: {
    id?: string;
    resourceType?: string;
    details?: Record<string, unknown>;
  };
}

const ACTION_ICONS: Record<ActionSuccessResult["type"], React.ElementType> = {
  inquiry_created: Inbox,
  quote_created: FileText,
  inquiry_updated: CheckCircle2,
  quote_sent: Mail,
  follow_up_scheduled: Clock,
};

interface ActionSuccessCardProps {
  result: ActionSuccessResult;
  businessSlug: string;
}

export function ActionSuccessCard({ result, businessSlug }: ActionSuccessCardProps) {
  const Icon = ACTION_ICONS[result.type] ?? CheckCircle2;

  const linkHref =
    result.data.id && result.type === "inquiry_created"
      ? `/${businessSlug}/inquiries/${result.data.id}`
      : result.data.id && result.type === "quote_created"
        ? `/${businessSlug}/quotes/${result.data.id}`
        : result.data.id && result.type === "quote_sent"
          ? `/${businessSlug}/quotes/${result.data.id}`
          : null;

  return (
    <Card size="sm" className="tool-result-card border-green-200 bg-green-50/40 dark:border-green-900/40 dark:bg-green-950/20">
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Icon className="size-3.5 text-green-700 dark:text-green-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{result.summary}</p>
            {linkHref && (
              <Link
                href={linkHref}
                className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline underline-offset-4"
              >
                View record
                <ArrowRight className="size-3" />
              </Link>
            )}
          </div>
          <CheckCircle2 className="size-4 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ErrorCard
// ---------------------------------------------------------------------------

interface ErrorCardProps {
  result: ErrorResult;
}

export function ErrorCard({ result }: ErrorCardProps) {
  return (
    <Card size="sm" className="tool-result-card border-destructive/30 bg-destructive/5">
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="size-3.5 text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{result.summary}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{result.message}</p>
            {result.upgradeUrl && (
              <Link
                href={result.upgradeUrl}
                className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline underline-offset-4"
              >
                Upgrade your plan
                <ArrowRight className="size-3" />
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ConfirmationRequiredCard (inline preview before confirmation dialog)
// ---------------------------------------------------------------------------

interface ConfirmationRequiredCardProps {
  result: ConfirmationRequiredResult;
  onConfirm: (confirmationId: string) => void;
  onCancel: (confirmationId: string) => void;
}

export function ConfirmationRequiredCard({
  result,
  onConfirm,
  onCancel,
}: ConfirmationRequiredCardProps) {
  return (
    <Card
      size="sm"
      className="tool-result-card border-amber-200/70 bg-amber-50/40 dark:border-amber-800/40 dark:bg-amber-950/20"
    >
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="size-3.5 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{result.summary}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {result.confirmationPrompt}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onConfirm(result.confirmationId)}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => onCancel(result.confirmationId)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ToolResultRenderer — picks the right card from a BaseToolResult
// ---------------------------------------------------------------------------

interface ToolResultRendererProps {
  result: BaseToolResult;
  businessSlug: string;
  onConfirm?: (confirmationId: string) => void;
  onCancel?: (confirmationId: string) => void;
}

export function ToolResultRenderer({
  result,
  businessSlug,
  onConfirm,
  onCancel,
}: ToolResultRendererProps) {
  switch (result.type) {
    case "inquiry_list":
      return (
        <InquiryListCard
          result={result as InquiryListResult}
          businessSlug={businessSlug}
        />
      );
    case "quote_list":
      return (
        <QuoteListCard
          result={result as QuoteListResult}
          businessSlug={businessSlug}
        />
      );
    case "stats_summary":
      return <StatsSummaryCard result={result as StatsSummaryResult} />;
    case "chart_data":
      return <ChartDataCard result={result as ChartDataResult} />;
    case "knowledge_results":
      return <KnowledgeResultsCard result={result as KnowledgeResultsResult} />;
    case "customer_list":
      return (
        <CustomerListCard
          result={result as CustomerListResult}
          businessSlug={businessSlug}
        />
      );
    case "inquiry_created":
    case "quote_created":
    case "inquiry_updated":
    case "quote_sent":
    case "follow_up_scheduled":
      return (
        <ActionSuccessCard
          result={result as ActionSuccessResult}
          businessSlug={businessSlug}
        />
      );
    case "error":
      return <ErrorCard result={result as ErrorResult} />;
    case "confirmation_required":
      return (
        <ConfirmationRequiredCard
          result={result as ConfirmationRequiredResult}
          onConfirm={onConfirm ?? (() => {})}
          onCancel={onCancel ?? (() => {})}
        />
      );
    default:
      return (
        <Card size="sm" className="tool-result-card">
          <CardContent className="py-3">
            <p className="text-sm text-muted-foreground">{result.summary}</p>
          </CardContent>
        </Card>
      );
  }
}
