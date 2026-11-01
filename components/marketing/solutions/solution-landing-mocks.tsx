import Image from "next/image";
import {
  Camera,
  Clock3,
  Eye,
  FileText,
  ReceiptText,
  Send,
  ShieldCheck,
} from "lucide-react";

import {
  MockAvatar,
  MockBadge,
  MockButton,
  MockCard,
  MockCardHeader,
  MockFooterStrip,
  MockList,
  MockRow,
  mockMonoClassName,
  mockSecondaryClassName,
  mockTitleClassName,
} from "@/components/marketing/marketing-mock-primitives";
import type {
  SolutionLandingAttachmentImage,
  SolutionLandingLineItem,
  SolutionLandingSample,
  SolutionLandingWorkflowMock,
} from "@/components/marketing/solutions-data";
import { InvoiceStatusBadge } from "@/features/invoices/components/invoice-status-badge";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";
import { cn } from "@/lib/utils";

function AttachmentTiles({
  labels,
  kind,
}: {
  labels: readonly string[];
  kind: "photo" | "file";
}) {
  const Icon = kind === "photo" ? Camera : FileText;
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {labels.map((label) => (
        <div
          className="flex aspect-[4/3] min-w-0 items-center justify-center rounded-md border border-dashed border-border/80 bg-muted/40 text-muted-foreground"
          key={label}
        >
          <Icon aria-hidden="true" className="size-3.5" />
        </div>
      ))}
    </div>
  );
}

function AttachmentImages({
  images,
}: {
  images: readonly SolutionLandingAttachmentImage[];
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {images.map((image) => (
        <div
          className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted"
          key={image.src}
        >
          <Image
            alt=""
            className="h-full w-full object-cover"
            height={image.height}
            sizes="(min-width: 1024px) 135px, (min-width: 640px) 210px, 100px"
            src={image.src}
            width={image.width}
          />
        </div>
      ))}
    </div>
  );
}

function MockField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="meta-label">{label}</dt>
      <dd className="mt-0.5 line-clamp-2 text-xs leading-4 font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

function WorkflowLineItem({ item }: { item: SolutionLandingLineItem }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        <p className={cn(mockTitleClassName, "text-xs")}>{item.label}</p>
        {item.spec ? (
          <p className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
            {item.spec}
          </p>
        ) : null}
      </div>
      <p
        className={cn(
          mockMonoClassName,
          "shrink-0 text-xs font-semibold text-foreground",
        )}
      >
        {item.value}
      </p>
    </div>
  );
}

/**
 * The hero illustration: one quote record with the inquiry it was built from.
 *
 * The quote sits top-right and carries the line items, total, and activity. The
 * inquiry sits front-left, offset by the same 16px step on both axes, and holds
 * the site facts and photos. On narrow stages the pair stacks with a small
 * vertical overlap; the front card keeps a stage-coloured outline so it reads
 * as cut out of the quote behind it.
 */
function SolutionInquiryMock({ sample }: { sample: SolutionLandingSample }) {
  return (
    <MockCard>
      <MockCardHeader
        action={<MockBadge label="New" tone="info" />}
        title="Inquiry"
      />
      <div className="flex min-w-0 items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <MockAvatar initials={sample.initials} />
        <div className="min-w-0">
          <p className={mockTitleClassName}>{sample.customer}</p>
          <p className={mockSecondaryClassName}>{sample.project}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2.5 p-4">
        {sample.inquiryFields.map((field) => (
          <MockField key={field.label} label={field.label} value={field.value} />
        ))}
      </dl>
      <div className="border-t border-border/60 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="meta-label">{sample.attachmentLabel}</span>
          <span className="text-xs leading-4 text-muted-foreground">
            {sample.attachmentCount}
          </span>
        </div>
        <div className="mt-2">
          {sample.attachmentImages?.length ? (
            <AttachmentImages images={sample.attachmentImages} />
          ) : (
            <AttachmentTiles
              kind={/photo/i.test(sample.attachmentLabel) ? "photo" : "file"}
              labels={sample.attachmentTiles}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5 text-[0.6875rem] leading-4 text-muted-foreground">
        <ShieldCheck
          aria-hidden="true"
          className="size-3.5 shrink-0 text-primary-ink"
        />
        Details and files stay on the inquiry
      </div>
    </MockCard>
  );
}

function SolutionQuoteMock({ sample }: { sample: SolutionLandingSample }) {
  return (
    <MockCard>
      <MockCardHeader
        action={<QuoteStatusBadge size="sm" status="sent" />}
        title={`Quote ${sample.quoteNumber}`}
      />
      <div className="flex min-w-0 items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <MockAvatar initials={sample.initials} />
        <div className="min-w-0">
          <p className={mockTitleClassName}>{sample.customer}</p>
          <p className={mockSecondaryClassName}>{sample.project}</p>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/60 bg-muted/30 px-4 py-2">
        <span className="meta-label">Line item</span>
        <span className="meta-label">Total</span>
      </div>
      <MockList>
        {sample.lineItems.map((item) => (
          <WorkflowLineItem item={item} key={item.label} />
        ))}
      </MockList>
      <div className="flex shrink-0 items-baseline justify-between gap-3 border-t border-border/60 px-4 py-3">
        <p className="text-xs leading-4 font-medium text-muted-foreground">
          Total
        </p>
        <p className="font-mono text-sm leading-5 font-semibold tabular-nums tracking-tight text-foreground">
          {sample.total}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5 text-[0.6875rem] leading-4 text-muted-foreground">
        <span className="truncate">{sample.quoteFooter}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Eye aria-hidden="true" className="size-3.5 text-primary-ink" />
          Viewed
        </span>
      </div>
    </MockCard>
  );
}

function SolutionSendMock({ sample }: { sample: SolutionLandingSample }) {
  return (
    <MockCard>
      <MockCardHeader
        action={<QuoteStatusBadge size="sm" status="sent" />}
        title={sample.project}
      />
      <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <p className={mockTitleClassName}>For {sample.customer}</p>
          <p className={mockSecondaryClassName}>
            {sample.quoteNumber} · Valid for 30 days
          </p>
        </div>
        <p className="shrink-0 font-mono text-lg leading-6 font-semibold tabular-nums tracking-tight text-foreground">
          {sample.total}
        </p>
      </div>
      <MockList>
        {sample.lineItems.map((item) => (
          <WorkflowLineItem item={item} key={item.label} />
        ))}
      </MockList>
      <div className="flex flex-wrap items-center gap-2 border-b border-t border-border/60 px-4 py-3">
        <MockButton>Accept quote</MockButton>
        <MockButton variant="outline">Request changes</MockButton>
      </div>
      <MockList>
        <MockRow className="justify-between">
          <span className="meta-label">Customer account</span>
          <span className="text-xs leading-4 font-medium text-foreground">
            Not needed
          </span>
        </MockRow>
        <MockRow className="justify-between">
          <span className="meta-label">Opened</span>
          <span className="text-xs leading-4 font-medium text-foreground">
            Just now
          </span>
        </MockRow>
      </MockList>
      <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5 text-[0.6875rem] leading-4 text-muted-foreground">
        <Eye aria-hidden="true" className="size-3.5 shrink-0 text-primary-ink" />
        View timestamped for the owner
      </div>
    </MockCard>
  );
}

function SolutionFollowUpMock({ sample }: { sample: SolutionLandingSample }) {
  return (
    <MockCard>
      <MockCardHeader
        action={
          <MockBadge icon={Clock3} label="Due tomorrow" tone="warning" />
        }
        title="Follow-up"
      />
      <div className="flex flex-col gap-3 p-4">
        <div className="min-w-0">
          <p className={mockTitleClassName}>{sample.followUpTitle}</p>
          <p className={cn(mockSecondaryClassName, "mt-0.5")}>
            {sample.customer} · {sample.total}
          </p>
        </div>
        <MockList className="overflow-hidden rounded-lg border border-border/60">
          <MockRow className="justify-between px-3 py-2">
            <span className="inline-flex items-center gap-2 text-xs leading-4 text-foreground">
              <Send aria-hidden="true" className="size-3.5 text-muted-foreground" />
              Sent
            </span>
            <span className="text-[0.6875rem] leading-4 text-muted-foreground">
              3 days ago
            </span>
          </MockRow>
          <MockRow className="justify-between px-3 py-2">
            <span className="inline-flex items-center gap-2 text-xs leading-4 text-foreground">
              <Eye aria-hidden="true" className="size-3.5 text-primary-ink" />
              Viewed
            </span>
            <span className="text-[0.6875rem] leading-4 text-muted-foreground">
              2 days ago
            </span>
          </MockRow>
          <MockRow className="justify-between px-3 py-2">
            <span className="inline-flex items-center gap-2 text-xs leading-4 text-foreground">
              <Clock3 aria-hidden="true" className="size-3.5 text-warning" />
              Follow-up task
            </span>
            <span className="text-[0.6875rem] leading-4 font-medium text-warning-ink">
              Due tomorrow
            </span>
          </MockRow>
        </MockList>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
          <p className="meta-label">Suggested message</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {sample.followUpMessage}
          </p>
        </div>
      </div>
      <MockFooterStrip icon={Clock3}>
        Owner task · copy-paste message
      </MockFooterStrip>
    </MockCard>
  );
}

function SolutionPaymentMock({ sample }: { sample: SolutionLandingSample }) {
  return (
    <MockCard>
      <MockCardHeader
        action={<InvoiceStatusBadge status="paid" />}
        title={`Invoice ${sample.invoiceNumber}`}
      />
      <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <p className={mockTitleClassName}>Balance due</p>
          <p className={mockSecondaryClassName}>{sample.project}</p>
        </div>
        <p className="shrink-0 font-mono text-2xl leading-8 font-semibold tabular-nums tracking-tight text-foreground">
          $0
        </p>
      </div>
      <MockList>
        <MockRow className="justify-between">
          <span className="meta-label">Invoice total</span>
          <span className={cn(mockMonoClassName, "font-semibold text-foreground")}>
            {sample.total}
          </span>
        </MockRow>
        <MockRow className="justify-between">
          <span className="meta-label">Payment method</span>
          <span className="text-xs leading-4 font-medium text-foreground">
            {sample.paymentMethod}
          </span>
        </MockRow>
        <MockRow className="justify-between">
          <span className="meta-label">Recorded</span>
          <span className="text-xs leading-4 font-medium text-foreground">
            By hand
          </span>
        </MockRow>
      </MockList>
      <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5 text-[0.6875rem] leading-4 text-muted-foreground">
        <ReceiptText
          aria-hidden="true"
          className="size-3.5 shrink-0 text-primary-ink"
        />
        Manual payment · no card processing
      </div>
    </MockCard>
  );
}

export function SolutionWorkflowMock({
  mock,
  sample,
}: {
  mock: SolutionLandingWorkflowMock;
  sample: SolutionLandingSample;
}) {
  if (mock === "inquiry") return <SolutionInquiryMock sample={sample} />;
  if (mock === "quote") return <SolutionQuoteMock sample={sample} />;
  if (mock === "send") return <SolutionSendMock sample={sample} />;
  if (mock === "follow-up") return <SolutionFollowUpMock sample={sample} />;
  return <SolutionPaymentMock sample={sample} />;
}
