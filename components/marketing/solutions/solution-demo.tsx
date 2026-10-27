"use client";

import { useState } from "react";
import { ArrowRight, Check, CheckCircle2, Eye } from "lucide-react";
import Link from "next/link";

import { MarketingMockFrame } from "@/components/marketing/marketing-feature-mocks";
import type { SolutionDemoTab } from "@/components/marketing/solutions-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FollowUpDueBadge } from "@/features/follow-ups/components/follow-up-status-badge";
import { InquiryStatusBadge } from "@/features/inquiries/components/inquiry-status-badge";
import { InvoiceStatusBadge } from "@/features/invoices/components/invoice-status-badge";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";
import { cn } from "@/lib/utils";

type StageKind = "inquiry" | "quote" | "follow-up" | "approval" | "paid";

function stageKind(tab: SolutionDemoTab): StageKind {
  if (tab.invoiceStatus) {
    return "paid";
  }
  if (tab.quoteStatus === "accepted") {
    return "approval";
  }
  if (tab.id.includes("follow")) {
    return "follow-up";
  }
  if (tab.quoteStatus === "sent") {
    return "quote";
  }
  return "inquiry";
}

function MockRows({ tab }: { tab: SolutionDemoTab }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card">
      {tab.fields.slice(0, 3).map((field, index) => (
        <div
          className={cn(
            "flex flex-1 items-center justify-between gap-3 px-4 py-3",
            index > 0 && "border-t border-border/70",
          )}
          key={field.label}
        >
          <p className="truncate text-sm font-medium text-foreground">
            {field.value}
          </p>
          <p className="meta-label shrink-0">{field.label}</p>
        </div>
      ))}
    </div>
  );
}

function InquiryMock({ tab }: { tab: SolutionDemoTab }) {
  return (
    <MarketingMockFrame
      chrome="none"
      action={<InquiryStatusBadge status="new" />}
      title="New inquiry"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-foreground">
          {tab.cardTitle}
        </p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {tab.cardSubtitle}
        </p>
      </div>
      <MockRows tab={tab} />
      <p className="truncate text-sm text-muted-foreground">
        {tab.quoteLabel}:{" "}
        <span className="font-medium">{tab.quoteValue}</span>
      </p>
    </MarketingMockFrame>
  );
}

function QuoteMock({ tab }: { tab: SolutionDemoTab }) {
  return (
    <MarketingMockFrame
      chrome="none"
      action={<QuoteStatusBadge status="sent" />}
      title="Quote"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-foreground">
          {tab.cardTitle}
        </p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {tab.cardSubtitle}
        </p>
      </div>
      <MockRows tab={tab} />
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">{tab.quoteLabel}</p>
        <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {tab.quoteValue}
        </p>
      </div>
      <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Eye aria-hidden="true" className="size-3.5 shrink-0 text-primary-ink" />
        <span className="truncate">
          <span className="font-medium text-foreground">
            {tab.statusValue}
          </span>
          {" · "}
          {tab.statusLabel}
        </span>
      </p>
    </MarketingMockFrame>
  );
}

function FollowUpMock({ tab }: { tab: SolutionDemoTab }) {
  return (
    <MarketingMockFrame
      chrome="none"
      action={<FollowUpDueBadge bucket="today" />}
      title="Follow-up"
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 rounded-xl border border-border/80 bg-primary/5 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">
            {tab.cardTitle}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {tab.statusValue}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {tab.note}
        </div>
      </div>
      <MockRows tab={tab} />
    </MarketingMockFrame>
  );
}

function ApprovalMock({ tab }: { tab: SolutionDemoTab }) {
  return (
    <MarketingMockFrame
      chrome="none"
      action={<QuoteStatusBadge status="accepted" />}
      title="Approval"
    >
      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CheckCircle2 className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">
            {tab.cardTitle} approved
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {tab.statusValue}
          </p>
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">{tab.quoteLabel}</p>
        <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {tab.quoteValue}
        </p>
      </div>
      <div className="flex justify-end">
        <Button size="sm" tabIndex={-1} type="button">
          Create invoice
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{tab.note}</p>
    </MarketingMockFrame>
  );
}

function PaidMock({ tab, total }: { tab: SolutionDemoTab; total: string }) {
  const payment = tab.fields.find((field) => field.label === "Payment");
  return (
    <MarketingMockFrame
      chrome="none"
      action={<InvoiceStatusBadge status="paid" />}
      title="Invoice"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-foreground">
          {tab.cardTitle}
        </p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {tab.cardSubtitle}
        </p>
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-border/80 bg-card px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-sm font-medium text-muted-foreground tabular-nums line-through">
            {total}
          </p>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-muted-foreground">{tab.quoteLabel}</p>
          <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {tab.quoteValue}
          </p>
        </div>
      </div>
      {payment ? (
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{payment.value}</span>
          {" · "}
          {tab.statusValue}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">{tab.note}</p>
    </MarketingMockFrame>
  );
}

function StageMock({ tab, total }: { tab: SolutionDemoTab; total: string }) {
  const kind = stageKind(tab);
  if (kind === "quote") return <QuoteMock tab={tab} />;
  if (kind === "follow-up") return <FollowUpMock tab={tab} />;
  if (kind === "approval") return <ApprovalMock tab={tab} />;
  if (kind === "paid") return <PaidMock tab={tab} total={total} />;
  return <InquiryMock tab={tab} />;
}

/**
 * One record, four moments: the same customer and job move from first
 * request to paid invoice. The identity bar never changes; only the stage
 * narrative and mock morph.
 */
export function SolutionDemo({ tabs }: { tabs: readonly SolutionDemoTab[] }) {
  const [active, setActive] = useState(0);
  if (tabs.length === 0) {
    return null;
  }
  const first = tabs[0];
  const quoteTab =
    tabs.find((tab) => tab.quoteStatus === "sent") ?? tabs[1] ?? first;
  const total = quoteTab?.quoteValue ?? "";
  const job =
    quoteTab?.cardSubtitle.split("·")[0]?.trim() ||
    first?.cardSubtitle.replace(/\s+(inquiry|request)$/i, "") ||
    "";
  const customer = first?.cardTitle ?? "";
  const carriedForward =
    first?.carriedForward ?? first?.fields.map((field) => field.value) ?? [];
  const current = tabs[active] ?? first;
  const progress = ((active + 1) / tabs.length) * 100;

  return (
    <Tabs
      className="gap-0 overflow-hidden rounded-xl border border-border bg-background shadow-[var(--marketing-shadow-raised)]"
      onValueChange={(value) => {
        const index = tabs.findIndex((tab) => tab.id === value);
        if (index >= 0) {
          setActive(index);
        }
      }}
      value={current?.id}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/70 bg-muted/40 px-4 py-3 sm:px-5">
        <p className="meta-label">Same record</p>
        <p className="min-w-0 truncate text-sm font-medium text-foreground">
          {customer}
          {job ? ` · ${job}` : null}
          {total ? ` · ${total}` : null}
        </p>
      </div>
      <div className="border-b border-border px-2 pt-2 sm:px-4">
        <TabsList
          aria-label="Journey stages"
          className="grid w-full grid-cols-4 gap-1"
          variant="line"
        >
          {tabs.map((tab, index) => {
            const completed = index < active;
            return (
              <TabsTrigger
                className="min-h-11 flex-col gap-1 border-transparent bg-transparent px-1 py-2 data-active:border-transparent data-active:bg-transparent after:hidden sm:px-3"
                key={tab.id}
                value={tab.id}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[0.6875rem] font-semibold tabular-nums",
                    completed && "bg-primary text-primary-foreground",
                    index === active &&
                      "bg-primary/10 text-primary-ink ring-1 ring-primary/30",
                    index > active && "bg-muted text-muted-foreground",
                  )}
                >
                  {completed ? (
                    <Check aria-hidden="true" className="size-3" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="w-full truncate text-center text-xs font-medium sm:text-sm">
                  {tab.label}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
        <div
          aria-hidden="true"
          className="h-0.5 overflow-hidden rounded-full bg-border/60"
        >
          <div
            className="h-full bg-primary motion-safe:transition-[width] motion-safe:duration-[var(--motion-duration-base)] motion-safe:ease-[var(--motion-ease-standard)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="grid lg:grid-cols-[1fr_1.05fr]">
        <div className="flex flex-col justify-center gap-4 p-5 sm:p-8 lg:p-10">
          <p className="meta-label">
            Step {String(active + 1).padStart(2, "0")} / {current?.label}
          </p>
          <h3 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {current?.stageHeadline}
          </h3>
          <p className="max-w-md text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            {current?.stageBody}
          </p>
          <div className="flex flex-col gap-2">
            <p className="meta-label">Carried forward · nothing retyped</p>
            <ul className="flex flex-wrap gap-2">
              {carriedForward.map((chip) => (
                <li key={chip}>
                  <Badge variant="secondary">{chip}</Badge>
                </li>
              ))}
            </ul>
          </div>
          <div className="pt-1">
            <Button asChild size="lg">
              <Link href="/signup">
                Start free
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="border-t border-border bg-muted/25 p-5 sm:p-8 lg:border-l lg:border-t-0">
          <div className="mx-auto w-full max-w-lg">
            {tabs.map((tab, index) => (
              <TabsContent
                className={cn(
                  "min-h-[20.5rem] sm:min-h-[22rem]",
                  index !== active && "hidden",
                )}
                key={tab.id}
                value={tab.id}
              >
                <div className="overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-[var(--motion-duration-base)] motion-safe:ease-[var(--motion-ease-standard)]">
                  <StageMock tab={tab} total={total} />
                </div>
              </TabsContent>
            ))}
          </div>
        </div>
      </div>
    </Tabs>
  );
}
