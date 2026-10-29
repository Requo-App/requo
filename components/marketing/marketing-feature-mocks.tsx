import {
  CheckCircle2,
  CircleDot,
  Clock3,
  FileText,
  Globe,
  Phone,
  Plus,
  ReceiptText,
  Search,
  SendHorizontal,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import type { LandingFeatureId } from "@/components/marketing/marketing-data";
import {
  MockAvatar,
  MockBadge,
  MockButton,
  MockCardHeader,
  MockList,
  MockRow,
  MockSourceLabel,
  mockMonoClassName,
  mockSecondaryClassName,
  mockTitleClassName,
  type MockBadgeTone,
} from "@/components/marketing/marketing-mock-primitives";
import { cn } from "@/lib/utils";

export function MarketingFeatureMock({
  featureId,
  compact = false,
}: {
  featureId: LandingFeatureId;
  compact?: boolean;
}) {
  if (featureId === "inquiries")
    return <InquiriesPreviewMock compact={compact} />;
  if (featureId === "quotes") return <QuotePreviewMock compact={compact} />;
  if (featureId === "followUps")
    return <FollowUpsPreviewMock compact={compact} />;
  if (featureId === "ai") return <AIDraftPreviewMock compact={compact} />;
  if (featureId === "invoices") return <InvoicesPreviewMock compact={compact} />;
  return <AnalyticsPreviewMock compact={compact} />;
}

export function MarketingMockFrame({
  title,
  action,
  children,
  compact = false,
  chrome = "card",
  flush = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  /** The landing illustration shell; content sets the height. */
  compact?: boolean;
  /**
   * `none` keeps an outer surface in charge of the frame. The landing mocks
   * always use the card shell; only the standalone solution demos opt out.
   */
  chrome?: "card" | "none";
  /** Full-bleed rows instead of the padded article-style body. */
  flush?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none flex w-full flex-col font-sans text-left select-none",
        chrome === "card" ? "marketing-mock-card" : "bg-transparent",
        compact ? "" : "h-[20.5rem] sm:h-[22rem]",
      )}
      inert
    >
      <MockCardHeader action={action} title={title} />
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          flush ? "overflow-hidden" : "gap-3 p-4",
        )}
      >
        {children}
      </div>
    </div>
  );
}

const inquiries = [
  {
    name: "Sarah Jenkins",
    initials: "SJ",
    service: "Kitchen remodel",
    time: "2m ago",
    status: {
      tone: "info" as MockBadgeTone,
      label: "New",
      icon: CircleDot,
    },
    source: { label: "Web form", icon: Globe },
    selected: true,
  },
  {
    name: "Leo Park",
    initials: "LP",
    service: "Custom bookshelves",
    time: "1h ago",
    status: {
      tone: "highlight" as MockBadgeTone,
      label: "Quoted",
      icon: FileText,
    },
    source: { label: "Phone", icon: Phone },
    selected: false,
  },
  {
    name: "Maya Fields",
    initials: "MF",
    service: "Hardwood refinishing",
    time: "Yesterday",
    status: {
      tone: "warning" as MockBadgeTone,
      label: "Waiting",
      icon: Clock3,
    },
    source: { label: "Referral", icon: Users },
    selected: false,
  },
] as const;

const inquiryFilters = ["All", "New", "Quoted", "Waiting"] as const;

function InquiriesPreviewMock({ compact }: { compact: boolean }) {
  return (
    <MarketingMockFrame
      action={
        <MockButton icon={Plus}>Quick-add inquiry</MockButton>
      }
      compact={compact}
      flush
      title="Inquiries"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3 overflow-hidden text-[0.6875rem] leading-4 font-medium">
          {inquiryFilters.map((filter, index) => (
            <span
              className={cn(
                "shrink-0",
                index === 0 ? "text-foreground" : "text-muted-foreground",
              )}
              key={filter}
            >
              {filter}
            </span>
          ))}
        </div>
        <Search
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      </div>

      <MockList className="flex-1">
        {inquiries.map((inquiry) => (
          <MockRow
            className="min-h-0 flex-1 py-2"
            highlighted={inquiry.selected}
            key={inquiry.name}
          >
            <MockAvatar initials={inquiry.initials} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className={cn(mockTitleClassName, "min-w-0")}>
                  {inquiry.name}
                </p>
                <MockBadge
                  icon={inquiry.status.icon}
                  label={inquiry.status.label}
                  tone={inquiry.status.tone}
                />
              </div>
              <p className={cn(mockSecondaryClassName, "min-w-0")}>
                {inquiry.service}
              </p>
              <div className="flex min-w-0 items-center justify-between gap-2 text-[0.6875rem] leading-4 text-muted-foreground">
                <MockSourceLabel icon={inquiry.source.icon}>
                  {inquiry.source.label}
                </MockSourceLabel>
                <span className={cn(mockMonoClassName, "shrink-0")}>
                  {inquiry.time}
                </span>
              </div>
            </div>
          </MockRow>
        ))}
      </MockList>
    </MarketingMockFrame>
  );
}

const quoteLineItems = [
  {
    description: "Maple cabinets",
    total: "$4,480",
    source: "From pricing library",
  },
  {
    description: "Quartz countertop",
    total: "$3,740",
    source: "Matched from Q-1031",
  },
] as const;

function QuotePreviewMock({ compact }: { compact: boolean }) {
  return (
    <MarketingMockFrame
      action={<MockButton icon={SendHorizontal}>Send quote</MockButton>}
      compact={compact}
      flush
      title="Quote Q-1048"
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <MockAvatar initials="SJ" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className={cn(mockTitleClassName, "min-w-0")}>
              Sarah Jenkins
            </p>
            <MockBadge icon={FileText} label="Draft" tone="neutral" />
          </div>
          <p className={cn(mockSecondaryClassName, "min-w-0")}>
            Kitchen remodel
          </p>
        </div>
      </div>

      <MockList className="flex-1">
        {quoteLineItems.map((item) => (
          <div
            className="flex min-h-0 flex-1 items-center justify-between gap-3 px-4 py-2.5"
            key={item.description}
          >
            <div className="min-w-0">
              <p className={mockTitleClassName}>{item.description}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[0.6875rem] leading-4 text-muted-foreground">
                <Sparkles
                  aria-hidden="true"
                  className="size-3 shrink-0"
                />
                <span className="truncate">{item.source}</span>
              </p>
            </div>
            <p className="shrink-0 font-mono text-xs leading-4 font-semibold tabular-nums text-foreground">
              {item.total}
            </p>
          </div>
        ))}
      </MockList>

      <div className="flex shrink-0 items-baseline justify-between gap-3 border-t border-border/60 px-4 py-3">
        <p className="text-xs leading-4 font-medium text-muted-foreground">
          Total
        </p>
        <p className="font-mono text-sm leading-5 font-semibold tabular-nums tracking-tight text-foreground">
          $8,220
        </p>
      </div>
    </MarketingMockFrame>
  );
}

const followUps = [
  {
    title: "Follow up on kitchen quote",
    customer: "Sarah Jenkins",
    quoteId: "Q-1048",
    amount: "$8,220",
    bucket: "today" as const,
    primary: true,
  },
  {
    title: "Check in on bookshelves",
    customer: "Leo Park",
    quoteId: "Q-1049",
    amount: "$5,120",
    bucket: "upcoming" as const,
    primary: false,
  },
] as const;

function FollowUpsPreviewMock({ compact }: { compact: boolean }) {
  return (
    <MarketingMockFrame compact={compact} flush title="Follow-ups">
      <MockList className="flex-1 justify-center">
        {followUps.map((item) => (
          <MockRow
            className={cn(
              "min-h-[5.25rem] items-start",
              item.primary && "bg-foreground/[0.04]",
            )}
            key={item.title}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 rounded-full border border-border/80 bg-transparent"
            />
            <div className="min-w-0 flex-1">
              <p className={mockTitleClassName}>{item.title}</p>
              <p className={cn(mockSecondaryClassName, "mt-0.5")}>
                {item.customer}
              </p>
              <p className={cn(mockMonoClassName, "mt-1")}>
                <span>{item.quoteId}</span>
                <span className="font-sans"> · </span>
                <span>{item.amount}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <MockBadge
                label={item.bucket === "today" ? "Due today" : "Upcoming"}
                tone={item.bucket === "today" ? "warning" : "neutral"}
              />
              <MockButton variant={item.primary ? "default" : "ghost"}>
                Mark done
              </MockButton>
            </div>
          </MockRow>
        ))}
      </MockList>
    </MarketingMockFrame>
  );
}

function AIDraftPreviewMock({ compact }: { compact: boolean }) {
  return (
    <MarketingMockFrame
      action={
        <MockButton icon={Sparkles}>Generate with AI</MockButton>
      }
      compact={compact}
      flush
      title="Draft with AI"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-accent/50 px-4 py-3">
        <Sparkles
          aria-hidden="true"
          className="size-3.5 shrink-0 text-primary"
        />
        <p className="min-w-0 truncate text-xs leading-4 text-muted-foreground">
          <span className="font-semibold text-foreground">
            Sarah Jenkins
          </span>
          <span> · Kitchen remodel</span>
        </p>
      </div>

      <MockList className="flex-1 justify-center">
        {quoteLineItems.map((item) => (
          <div
            className="flex items-start justify-between gap-3 px-4 py-2.5"
            key={item.description}
          >
            <div className="min-w-0">
              <p className={mockTitleClassName}>{item.description}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[0.6875rem] leading-4 text-muted-foreground">
                <Sparkles
                  aria-hidden="true"
                  className="size-3 shrink-0"
                />
                <span className="truncate">{item.source}</span>
              </p>
            </div>
            <p className="shrink-0 font-mono text-xs leading-4 font-semibold tabular-nums text-foreground">
              {item.total}
            </p>
          </div>
        ))}
      </MockList>

      <div className="mt-auto flex shrink-0 justify-end border-t border-border/60 px-4 py-3">
        <MockButton icon={ReceiptText}>Apply draft</MockButton>
      </div>
    </MarketingMockFrame>
  );
}

const invoices = [
  {
    number: "INV-1042",
    customer: "Sarah Jenkins",
    service: "Kitchen remodel",
    total: "$3,740",
    status: "sent" as const,
  },
  {
    number: "INV-1041",
    customer: "Oakridge Property Management",
    service: "Maintenance",
    total: "$8,400",
    status: "paid" as const,
  },
] as const;

function InvoicesPreviewMock({ compact }: { compact: boolean }) {
  return (
    <MarketingMockFrame compact={compact} flush title="Invoices">
      <MockList className="flex-1 justify-center">
        {invoices.map((invoice) => (
          <MockRow className="items-start" key={invoice.number}>
            <div className="min-w-0 flex-1">
              <p className={mockMonoClassName}>{invoice.number}</p>
              <p className={cn(mockTitleClassName, "mt-0.5")}>
                {invoice.customer}
              </p>
              <p className={cn(mockSecondaryClassName, "mt-0.5")}>
                {invoice.service}
              </p>
              <p className="mt-1 font-mono text-xs leading-4 font-semibold tabular-nums text-foreground">
                {invoice.total}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <MockBadge
                label={invoice.status === "paid" ? "Paid" : "Sent"}
                tone={invoice.status === "paid" ? "success" : "highlight"}
              />
              <MockButton icon={CheckCircle2} variant="outline">
                Record payment
              </MockButton>
            </div>
          </MockRow>
        ))}
      </MockList>
    </MarketingMockFrame>
  );
}

const analyticsMetrics = [
  { label: "Inquiries", value: "24" },
  { label: "Quotes sent", value: "16" },
  { label: "Accepted", value: "11" },
] as const;

const analyticsFunnel = [
  { label: "Inquiries", value: 24, width: "100%" },
  { label: "Quoted", value: 16, width: "67%" },
  { label: "Accepted", value: 11, width: "46%" },
] as const;

function AnalyticsPreviewMock({ compact }: { compact: boolean }) {
  return (
    <MarketingMockFrame
      action={
        <span className="inline-flex items-center gap-1 text-xs leading-4 font-medium text-muted-foreground">
          <TrendingUp aria-hidden="true" className="size-3.5 shrink-0" />
          Last 30 days
        </span>
      }
      compact={compact}
      flush
      title="Analytics"
    >
      <div className="grid shrink-0 grid-cols-3 divide-x divide-border/60 border-b border-border/60">
        {analyticsMetrics.map((metric) => (
          <div className="min-w-0 px-3 py-2.5" key={metric.label}>
            <p className="truncate text-[0.6875rem] leading-4 font-medium text-muted-foreground">
              {metric.label}
            </p>
            <p className="mt-1.5 text-xl leading-6 font-semibold tracking-tight tabular-nums text-foreground">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2.5 px-4 py-3">
        {analyticsFunnel.map((step) => (
          <div className="flex flex-col gap-1.5" key={step.label}>
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-xs leading-4 font-medium text-foreground">
                {step.label}
              </p>
              <p className="shrink-0 font-mono text-xs leading-4 font-semibold tabular-nums text-foreground">
                {step.value}
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: step.width }}
              />
            </div>
          </div>
        ))}
      </div>
    </MarketingMockFrame>
  );
}
