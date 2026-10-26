import type { ReactNode } from "react";

import {
  DashboardDetailLayout,
  DashboardPage,
  DashboardSidebarStack,
  DashboardStatsGrid,
} from "@/components/shared/dashboard-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DashboardDetailPageSkeletonProps = {
  variant?: "inquiry" | "quote" | "invoice" | "payment";
};

export function DashboardDetailPageSkeleton({
  variant = "inquiry",
}: DashboardDetailPageSkeletonProps) {
  const headerActionWidths =
    variant === "inquiry"
      ? ["sm:w-28", "sm:w-24", "sm:w-40"]
      : ["sm:w-28", "sm:w-24", "sm:w-32"];

  return (
    <DashboardPage className="pb-24">
      <header className="dashboard-detail-header">
        <div className="dashboard-detail-header-copy">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24 rounded-md" />
            <Skeleton className="h-5 w-full max-w-xl rounded-md sm:h-6" />
            <Skeleton className="h-4 w-full max-w-2xl rounded-md" />
          </div>
          <div className="dashboard-detail-header-meta">
            {Array.from({
              length:
                variant === "inquiry" ? 4 : variant === "payment" ? 1 : 3,
            }).map((_, index) => (
              <Skeleton
                className={cn(
                  "h-8 rounded-full",
                  index === 0 ? "w-28" : index === 1 ? "w-32" : "w-36",
                )}
                key={index}
              />
            ))}
          </div>
        </div>
        <div className="dashboard-detail-header-actions">
          {headerActionWidths.map((width, index) => (
            <Skeleton
              className={cn("h-9 w-full rounded-md sm:h-8", width)}
              key={index}
            />
          ))}
        </div>
      </header>

      {variant === "quote" ? <AlertSkeleton /> : null}
      {variant === "inquiry" ? (
        <InquiryDetailSkeleton />
      ) : variant === "quote" ? (
        <QuoteDetailSkeleton />
      ) : variant === "payment" ? (
        <PaymentDetailSkeleton />
      ) : (
        <InvoiceDetailSkeleton />
      )}
    </DashboardPage>
  );
}

export function DashboardQuoteEditorSkeleton() {
  return (
    <DashboardPage>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20 rounded-md" />
        <Skeleton className="h-6 w-full max-w-lg rounded-lg sm:h-7" />
      </div>

      <div className="dashboard-detail-layout items-start xl:grid-cols-[minmax(0,1.08fr)_0.92fr]">
        <DashboardSidebarStack className="min-w-0">
          {/* Section 1: Quote details */}
          <SectionSkeleton titleWidth="w-28">
            <FieldStack />
            <TwoFieldGrid />
            <FieldStack />
          </SectionSkeleton>

          {/* Section 2: Line items */}
          <SectionSkeleton
            action={<Skeleton className="h-9 w-24 rounded-md sm:h-8" />}
            titleWidth="w-24"
          >
            {/* Toolbar */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-32 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
            {/* Compact line item rows */}
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5"
                key={index}
              >
                <Skeleton className="size-3.5 shrink-0 rounded" />
                <Skeleton className="h-9 min-w-0 flex-1 rounded-md sm:h-8" />
                <Skeleton className="h-9 w-14 shrink-0 rounded-md sm:h-8" />
                <Skeleton className="h-9 w-24 shrink-0 rounded-md sm:h-8" />
                <Skeleton className="hidden h-4 w-16 shrink-0 rounded-md sm:block" />
                <Skeleton className="size-7 shrink-0 rounded-md" />
              </div>
            ))}
            {/* Totals */}
            <div className="mt-2 flex flex-col gap-2.5 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-16 rounded-md" />
                <Skeleton className="h-4 w-20 rounded-md" />
              </div>
              <div className="border-t border-border/60 pt-2.5">
                <div className="flex items-center justify-between gap-4">
                  <Skeleton className="h-4 w-12 rounded-md" />
                  <Skeleton className="h-5 w-24 rounded-md" />
                </div>
              </div>
            </div>
          </SectionSkeleton>

          {/* Section 3: Pricing & notes */}
          <SectionSkeleton titleWidth="w-32">
            <div className="grid gap-4 sm:grid-cols-3">
              <FieldStack />
              <FieldStack />
              <FieldStack />
            </div>
            <FieldStack area />
            <FieldStack area />
            <div className="dashboard-actions sm:justify-end">
              <Skeleton className="h-9 w-full rounded-md sm:h-8 sm:w-40" />
            </div>
          </SectionSkeleton>
        </DashboardSidebarStack>

        <QuotePreviewSkeleton className="xl:sticky xl:top-6 xl:self-start" />
      </div>
    </DashboardPage>
  );
}

export function DashboardInquiryEditorSkeleton() {
  return (
    <DashboardPage>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="h-6 w-full max-w-lg rounded-lg sm:h-7" />
        <Skeleton className="h-4 w-full max-w-2xl rounded-md" />
      </div>

      <div className="dashboard-detail-layout items-start xl:grid-cols-[minmax(0,1.08fr)_0.92fr]">
        <DashboardSidebarStack className="min-w-0">
          <SectionSkeleton
            action={
              <>
                <Skeleton className="h-9 w-24 rounded-full" />
                <Skeleton className="h-9 w-28 rounded-full" />
              </>
            }
            titleWidth="w-32"
            descriptionWidth="w-64"
          >
            <FieldStack />
          </SectionSkeleton>

          <SectionSkeleton titleWidth="w-32" descriptionWidth="w-48">
            <TwoFieldGrid />
            <FieldStack />
          </SectionSkeleton>

          <SectionSkeleton titleWidth="w-32" descriptionWidth="w-64">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldStack />
              <FieldStack />
              <FieldStack />
              <FieldStack area />
            </div>
          </SectionSkeleton>

          <SectionSkeleton titleWidth="w-28" descriptionWidth="w-52">
            <FieldStack />
          </SectionSkeleton>

          <SectionSkeleton titleWidth="w-24" descriptionWidth="w-60">
            <ContentPanel lines={2} labelWidth="w-24" />
            <div className="dashboard-actions justify-between">
              <Skeleton className="h-4 w-64 rounded-md" />
              <Skeleton className="h-9 w-full rounded-md sm:h-8 sm:w-40" />
            </div>
          </SectionSkeleton>
        </DashboardSidebarStack>

        <InquiryPreviewSkeleton className="xl:sticky xl:top-6 xl:self-start" />
      </div>
    </DashboardPage>
  );
}

function InquiryDetailSkeleton() {
  return (
    <DashboardDetailLayout className="xl:grid-cols-[1.45fr_0.95fr]">
      <DashboardSidebarStack>
        <SectionSkeleton titleWidth="w-32" descriptionWidth="w-48">
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <InfoTileSkeleton key={index} />
            ))}
          </div>
          <ContentPanel lines={1} labelWidth="w-16" />
          <ContentPanel lines={6} labelWidth="w-20" />
          <Skeleton className="h-9 w-full sm:w-48 rounded-md sm:h-8" />
        </SectionSkeleton>

        <div className="dashboard-detail-support-grid">
          <SectionSkeleton titleWidth="w-28" descriptionWidth="w-56">
            <FeedSkeleton count={1} withBody />
            <Skeleton className="h-9 w-full rounded-md sm:h-8" />
          </SectionSkeleton>

          <SectionSkeleton titleWidth="w-36" descriptionWidth="w-56">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoTileSkeleton compact />
              <InfoTileSkeleton compact />
            </div>
            <Skeleton className="h-9 w-full rounded-md sm:h-8" />
          </SectionSkeleton>

          <SectionSkeleton titleWidth="w-28" descriptionWidth="w-44">
            <FeedSkeleton count={1} />
            <Skeleton className="h-9 w-full rounded-md sm:h-8" />
          </SectionSkeleton>
        </div>
      </DashboardSidebarStack>

      <DashboardSidebarStack>
        <SectionSkeleton titleWidth="w-32" descriptionWidth="w-52">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoTileSkeleton />
            <InfoTileSkeleton />
          </div>
          <ActionsSkeleton widths={["sm:w-36", "sm:w-11"]} />
        </SectionSkeleton>

        <SectionSkeleton titleWidth="w-24" descriptionWidth="w-56">
          <ContentPanel lines={1} labelWidth="w-24" />
        </SectionSkeleton>

        <SectionSkeleton titleWidth="w-28" descriptionWidth="w-48">
          <Skeleton className="h-6 w-20 rounded-full" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <InfoTileSkeleton key={index} />
            ))}
          </div>
          <ActionsSkeleton widths={["sm:w-36"]} />
        </SectionSkeleton>
      </DashboardSidebarStack>
    </DashboardDetailLayout>
  );
}

function QuoteDetailSkeleton() {
  return (
    <DashboardDetailLayout className="xl:grid-cols-[minmax(0,1.05fr)_0.95fr]">
      <DashboardSidebarStack>
        <QuotePreviewSkeleton />

        <SectionSkeleton titleWidth="w-28" descriptionWidth="w-40">
          <FeedSkeleton count={1} />
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoTileSkeleton />
            <InfoTileSkeleton />
          </div>
        </SectionSkeleton>

        <SectionSkeleton titleWidth="w-28" descriptionWidth="w-44">
          <FeedSkeleton count={1} />
          <Skeleton className="h-9 w-full rounded-md sm:h-8" />
        </SectionSkeleton>

        <SectionSkeleton titleWidth="w-36" descriptionWidth="w-48">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoTileSkeleton />
            <InfoTileSkeleton />
          </div>
          <Skeleton className="h-9 w-full rounded-md sm:h-8" />
        </SectionSkeleton>
      </DashboardSidebarStack>

      <DashboardSidebarStack>
        <SectionSkeleton titleWidth="w-32" descriptionWidth="w-52">
          <ContentPanel lines={3} labelWidth="w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-md sm:h-8" />
            <Skeleton className="h-9 w-16 rounded-md sm:h-8" />
          </div>
        </SectionSkeleton>

        <SectionSkeleton titleWidth="w-32" descriptionWidth="w-52">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoTileSkeleton />
            <InfoTileSkeleton />
          </div>
        </SectionSkeleton>

        <SectionSkeleton titleWidth="w-24" descriptionWidth="w-56">
          <ContentPanel lines={1} labelWidth="w-24" />
        </SectionSkeleton>
      </DashboardSidebarStack>
    </DashboardDetailLayout>
  );
}

function InvoiceDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <SectionSkeleton titleWidth="w-28" descriptionWidth="w-56">
        <div className="overflow-hidden rounded-xl border border-border/75">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              className="flex items-center justify-between gap-4 border-t border-border/80 px-4 py-3 first:border-t-0"
              key={index}
            >
              <Skeleton className="h-4 w-48 rounded-md" />
              <Skeleton className="h-4 w-16 rounded-md" />
            </div>
          ))}
        </div>
        <ContentPanel lines={3} labelWidth="w-16" />
      </SectionSkeleton>

      <SectionSkeleton titleWidth="w-24" descriptionWidth="w-64">
        <div className="grid gap-3 sm:grid-cols-3">
          <InfoTileSkeleton compact />
          <InfoTileSkeleton compact />
          <InfoTileSkeleton compact />
        </div>
        <Skeleton className="h-9 w-full rounded-md sm:h-8" />
      </SectionSkeleton>

      <SectionSkeleton titleWidth="w-20" descriptionWidth="w-52">
        <ContentPanel lines={2} labelWidth="w-24" />
      </SectionSkeleton>

      <SectionSkeleton titleWidth="w-28" descriptionWidth="w-44">
        <FeedSkeleton count={1} />
        <Skeleton className="h-9 w-full rounded-md sm:h-8" />
      </SectionSkeleton>
    </div>
  );
}

function PaymentDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <SectionSkeleton titleWidth="w-32" descriptionWidth="w-56">
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <InfoTileSkeleton key={index} />
          ))}
        </div>
        <ContentPanel lines={2} labelWidth="w-16" />
      </SectionSkeleton>

      <SectionSkeleton
        action={<Skeleton className="h-6 w-20 rounded-full" />}
        descriptionWidth="w-64"
        titleWidth="w-28"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <InfoTileSkeleton compact />
          <InfoTileSkeleton compact />
          <InfoTileSkeleton compact />
        </div>
        <Skeleton className="h-9 w-full rounded-md sm:h-8 sm:w-32" />
      </SectionSkeleton>
    </div>
  );
}

function AlertSkeleton() {
  return (
    <div className="rounded-xl border border-border/85 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-56 rounded-md" />
        <Skeleton className="h-4 w-full max-w-2xl rounded-md" />
      </div>
    </div>
  );
}

function SectionSkeleton({
  children,
  action,
  titleWidth,
  descriptionWidth,
}: {
  children: ReactNode;
  action?: ReactNode;
  titleWidth: string;
  descriptionWidth?: string;
}) {
  return (
    <section className="section-panel">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Skeleton className={`h-5 ${titleWidth} rounded-md`} />
            {descriptionWidth ? (
              <Skeleton className={`mt-2 h-4 ${descriptionWidth} rounded-md`} />
            ) : null}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

function InfoTileSkeleton({ compact = false }: { compact?: boolean } = {}) {
  return (
    <div className="info-tile">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20 rounded-md" />
        <Skeleton className="h-5 w-full rounded-md" />
        {!compact ? <Skeleton className="h-4 w-24 rounded-md" /> : null}
      </div>
    </div>
  );
}

function FeedSkeleton({
  count,
  withAction = false,
  withBody = false,
}: {
  count: number;
  withAction?: boolean;
  withBody?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <div className="dashboard-detail-feed-item" key={index}>
          <div className="dashboard-detail-feed-heading">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-full max-w-sm rounded-md" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </div>
            </div>
            {withAction ? <Skeleton className="h-9 w-24 rounded-md sm:h-8" /> : null}
          </div>
          {withBody ? (
            <div className="dashboard-detail-feed-body">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-11/12 rounded-md" />
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ContentPanel({
  lines,
  labelWidth = "w-16",
}: {
  lines: number;
  labelWidth?: string;
}) {
  return (
    <div className="soft-panel shadow-none">
      <Skeleton className={`h-3 ${labelWidth} rounded-md`} />
      <div className="mt-3 flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton className="h-4 w-full rounded-md last:w-4/5" key={index} />
        ))}
      </div>
    </div>
  );
}

function FieldStack({ area = false }: { area?: boolean }) {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-4 w-24 rounded-md" />
      <Skeleton className={area ? "h-20 w-full rounded-md" : "h-9 w-full rounded-md sm:h-8"} />
    </div>
  );
}

function TwoFieldGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FieldStack />
      <FieldStack />
    </div>
  );
}

function ActionsSkeleton({ widths }: { widths: string[] }) {
  return (
    <div className="dashboard-actions sm:justify-end">
      {widths.map((width, index) => (
        <Skeleton className={cn("h-9 w-full rounded-md sm:h-8", width)} key={index} />
      ))}
    </div>
  );
}

function QuotePreviewSkeleton({ className }: { className?: string }) {
  // Document preview keeps customer-document proportions (opt-out of baked panel padding).
  return (
    <article data-padding="none" className={cn("section-panel overflow-hidden p-5 sm:p-6", className)}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 border-b border-border/80 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-9 w-56 rounded-md sm:h-8" />
              <Skeleton className="h-4 w-24 rounded-md" />
            </div>
            <ContentPanel lines={2} labelWidth="w-20" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoTileSkeleton />
            <InfoTileSkeleton />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/75 bg-background/92">
          <div className="grid grid-cols-[minmax(0,1fr)_4rem_7rem_7rem] gap-0 border-b border-border/80 bg-muted/35 px-4 py-3">
            <Skeleton className="h-4 w-16 rounded-md" />
            <Skeleton className="mx-auto h-4 w-8 rounded-md" />
            <Skeleton className="ml-auto h-4 w-14 rounded-md" />
            <Skeleton className="ml-auto h-4 w-14 rounded-md" />
          </div>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_4rem_7rem_7rem] gap-0 border-t border-border/80 px-4 py-3 first:border-t-0"
              key={index}
            >
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="mx-auto h-4 w-6 rounded-md" />
              <Skeleton className="ml-auto h-4 w-12 rounded-md" />
              <Skeleton className="ml-auto h-4 w-14 rounded-md" />
            </div>
          ))}
        </div>

        <div className="soft-panel ml-auto flex w-full max-w-sm flex-col gap-3 shadow-none">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="flex items-center justify-between gap-4" key={index}>
              <Skeleton className="h-4 w-16 rounded-md" />
              <Skeleton className="h-4 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function InquiryPreviewSkeleton({ className }: { className?: string }) {
  // Document preview keeps customer-document proportions (opt-out of baked panel padding).
  return (
    <article data-padding="none" className={cn("section-panel overflow-hidden p-5 sm:p-6", className)}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 border-b border-border/80 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-9 w-52 rounded-md sm:h-8" />
              <Skeleton className="h-4 w-36 rounded-md" />
            </div>
            <ContentPanel lines={2} labelWidth="w-20" />
          </div>
          <div className="dashboard-detail-header-meta">
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
        </div>

        <DashboardStatsGrid className="xl:!grid-cols-2">
          <InfoTileSkeleton compact />
          <InfoTileSkeleton compact />
          <InfoTileSkeleton compact />
          <InfoTileSkeleton compact />
        </DashboardStatsGrid>

        <ContentPanel lines={4} labelWidth="w-24" />

        <div className="grid gap-3 sm:grid-cols-2">
          <InfoTileSkeleton />
          <InfoTileSkeleton />
        </div>
      </div>
    </article>
  );
}
