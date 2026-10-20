import Link from "next/link";

import {
  DashboardDetailFeed,
  DashboardDetailFeedItem,
  DashboardDetailHeader,
  DashboardSection,
  DashboardSidebarStack,
  DashboardTableContainer,
} from "@/components/shared/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminEmailStatusBadge } from "@/features/admin/components/primitives/admin-status-badges";
import {
  formatAdminMoney,
  getQuoteDeliverySummary,
} from "@/features/admin/components/product/admin-product-format";
import {
  getAdminBusinessDetailPath,
  getAdminInquiryDetailPath,
} from "@/features/admin/navigation";
import type {
  AdminQuoteDetailCore,
  AdminQuoteEmail,
  AdminQuoteItem,
  AdminQuoteRevisionRequest,
  AdminQuoteVersion,
} from "@/features/admin/types";
import { InquiryStatusBadge } from "@/features/inquiries/components/inquiry-status-badge";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";

function formatDateTime(value: Date | null): string {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: Date | null): string {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="meta-label">{label}</dt>
      <dd className="mt-1 text-sm text-foreground break-words">{value}</dd>
    </div>
  );
}

/**
 * Read-only admin detail view for a quote.
 *
 * Leads with the delivery question — `sentAt`, view/response timestamps,
 * and the matching `email_outbox` rows — because that is the operational
 * question support asks first. Then amounts, line items, version history,
 * and revision requests. Passive inspection only, no actions. Field
 * clusters use flat `dl` rows and rosters use `DashboardDetailFeed` —
 * the same composition as the business detail view.
 *
 * The route pages stream each section behind its own Suspense boundary
 * instead of rendering one composed panel.
 */
export function AdminQuoteHeaderSection({
  detail,
}: {
  detail: AdminQuoteDetailCore;
}) {
  return (
    <DashboardDetailHeader
      description={detail.title}
      meta={
        <>
          <QuoteStatusBadge status={detail.status} />
          <span className="text-xs text-muted-foreground">
            {formatAdminMoney(detail.totalInCents, detail.currency)} ·{" "}
            {detail.business.name} ·{" "}
            {detail.sentAt ? `Sent ${formatDate(detail.sentAt)}` : "Not sent"}
          </span>
        </>
      }
      title={detail.quoteNumber}
    />
  );
}

export function AdminQuoteDeliverySection({
  detail,
  emails,
}: {
  detail: AdminQuoteDetailCore;
  emails: AdminQuoteEmail[];
}) {
  return (
    <DashboardSection
      description="Whether this quote actually reached the customer."
      title="Delivery"
    >
      <p className="text-sm font-medium text-foreground">
        {getQuoteDeliverySummary(detail.sentAt, emails)}
      </p>
      <dl className="mt-5 grid gap-5 sm:grid-cols-3">
        <DetailRow
          label="Sent at"
          value={detail.sentAt ? formatDateTime(detail.sentAt) : "—"}
        />
        <DetailRow
          label="First viewed"
          value={
            detail.publicViewedAt
              ? formatDateTime(detail.publicViewedAt)
              : "—"
          }
        />
        <DetailRow
          label="Customer responded"
          value={
            detail.customerRespondedAt
              ? formatDateTime(detail.customerRespondedAt)
              : "—"
          }
        />
      </dl>
      {detail.customerResponseMessage ? (
        <div className="mt-5 min-w-0">
          <p className="meta-label">Response message</p>
          <p className="mt-1 text-sm leading-6 text-foreground whitespace-pre-wrap break-words">
            {detail.customerResponseMessage}
          </p>
        </div>
      ) : null}
      <div className="mt-5">
        <h3 className="meta-label">Auto follow-up</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {describeAutoFollowUp(detail)}
        </p>
      </div>
      <div className="mt-5">
        <h3 className="meta-label">Delivery emails</h3>
        {emails.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No delivery emails on record for this quote.
          </p>
        ) : (
          <DashboardDetailFeed className="mt-3">
            {emails.map((email) => (
              <DashboardDetailFeedItem
                key={email.id}
                meta={
                  <>
                    <AdminEmailStatusBadge status={email.status} />
                    {email.provider ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{email.provider}</span>
                      </>
                    ) : null}
                    <span aria-hidden="true">·</span>
                    <span>
                      {email.sentAt
                        ? `Sent ${formatDateTime(email.sentAt)}`
                        : `Recorded ${formatDateTime(email.createdAt)}`}
                    </span>
                    {email.attempts > 1 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{email.attempts} attempts</span>
                      </>
                    ) : null}
                  </>
                }
                title={email.subject}
              />
            ))}
          </DashboardDetailFeed>
        )}
      </div>
    </DashboardSection>
  );
}

export function AdminQuoteAmountsSection({
  detail,
}: {
  detail: AdminQuoteDetailCore;
}) {
  return (
    <DashboardSection
      description={`Version ${detail.version} · valid until ${detail.validUntil}.`}
      title="Amounts"
    >
      <dl className="grid gap-5 sm:grid-cols-2">
        <DetailRow
          label="Subtotal"
          value={formatAdminMoney(detail.subtotalInCents, detail.currency)}
        />
        <DetailRow
          label="Discount"
          value={formatAdminMoney(detail.discountInCents, detail.currency)}
        />
        <DetailRow
          label="Tax"
          value={formatAdminMoney(detail.taxInCents, detail.currency)}
        />
        <DetailRow
          label="Total"
          value={formatAdminMoney(detail.totalInCents, detail.currency)}
        />
      </dl>
      {detail.notes || detail.terms ? (
        <div className="mt-5 flex min-w-0 flex-col gap-5">
          {detail.notes ? (
            <div className="min-w-0">
              <p className="meta-label">Customer notes</p>
              <p className="mt-1 text-sm leading-6 text-foreground whitespace-pre-wrap break-words">
                {detail.notes}
              </p>
            </div>
          ) : null}
          {detail.terms ? (
            <div className="min-w-0">
              <p className="meta-label">Terms</p>
              <p className="mt-1 text-sm leading-6 text-foreground whitespace-pre-wrap break-words">
                {detail.terms}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </DashboardSection>
  );
}

export function AdminQuoteItemsSection({
  currency,
  items,
}: {
  currency: string;
  items: AdminQuoteItem[];
}) {
  return (
    <DashboardSection
      description={`${items.length} line items in position order.`}
      title="Items"
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No line items on this quote.
        </p>
      ) : (
        <DashboardTableContainer innerClassName="border-border/60">
          <Table className="min-w-[36rem]">
            <TableCaption className="sr-only">
              Quote line items.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="w-[5rem] text-right">Qty</TableHead>
                <TableHead className="w-[8rem] text-right">Unit</TableHead>
                <TableHead className="w-[8rem] text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-full">
                    <span className="block truncate text-sm text-foreground">
                      {item.description}
                    </span>
                  </TableCell>
                  <TableCell className="w-[5rem] text-right text-sm tabular-nums text-muted-foreground">
                    {item.quantity}
                  </TableCell>
                  <TableCell className="w-[8rem] text-right text-sm tabular-nums text-muted-foreground">
                    {formatAdminMoney(item.unitPriceInCents, currency)}
                  </TableCell>
                  <TableCell className="w-[8rem] text-right text-sm font-medium tabular-nums text-foreground">
                    {formatAdminMoney(item.lineTotalInCents, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DashboardTableContainer>
      )}
    </DashboardSection>
  );
}

export function AdminQuoteVersionsSection({
  versions,
}: {
  versions: AdminQuoteVersion[];
}) {
  return (
    <DashboardSection
      description="Prior revisions, newest first. Item snapshots are omitted to keep this view light."
      title={`Versions (${versions.length})`}
    >
      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No prior versions — this is the original.
        </p>
      ) : (
        <DashboardDetailFeed>
          {versions.map((version) => (
            <DashboardDetailFeedItem
              key={version.id}
              meta={
                <>
                  <span>
                    {formatAdminMoney(version.totalInCents, version.currency)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDateTime(version.createdAt)}</span>
                </>
              }
              title={`Version ${version.version} — ${version.title}`}
            />
          ))}
        </DashboardDetailFeed>
      )}
    </DashboardSection>
  );
}

export function AdminQuoteRevisionRequestsSection({
  revisionRequests,
}: {
  revisionRequests: AdminQuoteRevisionRequest[];
}) {
  return (
    <DashboardSection
      description="Customer revision requests, newest first."
      title={`Revision requests (${revisionRequests.length})`}
    >
      {revisionRequests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No revision requests.
        </p>
      ) : (
        <DashboardDetailFeed>
          {revisionRequests.map((request) => (
            <DashboardDetailFeedItem
              key={request.id}
              meta={
                <>
                  <Badge variant="outline">{request.status}</Badge>
                  <span aria-hidden="true">·</span>
                  <span>Version {request.version}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDateTime(request.createdAt)}</span>
                  {request.resolvedAt ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Resolved {formatDateTime(request.resolvedAt)}</span>
                    </>
                  ) : null}
                </>
              }
              title={request.message || "Revision requested"}
              titleLines={2}
            />
          ))}
        </DashboardDetailFeed>
      )}
    </DashboardSection>
  );
}

export function AdminQuoteMetaSidebar({
  detail,
}: {
  detail: AdminQuoteDetailCore;
}) {
  return (
    <DashboardSidebarStack>
      <DashboardSection title="Customer">
        <dl className="flex flex-col gap-5">
          <DetailRow label="Name" value={detail.customerName} />
          <DetailRow label="Email" value={detail.customerEmail || "—"} />
          <DetailRow
            label="Contact"
            value={`${detail.customerContactMethod || "—"}${detail.customerContactHandle ? ` · ${detail.customerContactHandle}` : ""}`}
          />
          {detail.acceptedAt ? (
            <DetailRow
              label="Accepted"
              value={formatDateTime(detail.acceptedAt)}
            />
          ) : null}
        </dl>
      </DashboardSection>

      <DashboardSection title="Source inquiry">
        {detail.linkedInquiry ? (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="min-w-0">
              <p className="meta-label">Subject</p>
              <p className="mt-1 truncate text-sm text-foreground">
                {detail.linkedInquiry.subject?.trim() || "—"}
              </p>
            </div>
            <div>
              <InquiryStatusBadge status={detail.linkedInquiry.status} />
            </div>
            <div>
              <Button asChild size="sm" variant="outline">
                <Link
                  href={getAdminInquiryDetailPath(detail.linkedInquiry.id)}
                  prefetch={true}
                >
                  Open inquiry
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No linked inquiry — this quote was created manually.
          </p>
        )}
      </DashboardSection>

      <DashboardSection title="Business">
        <dl className="flex flex-col gap-5">
          <DetailRow label="Name" value={detail.business.name} />
        </dl>
        <Button asChild className="mt-5" size="sm" variant="outline">
          <Link
            href={getAdminBusinessDetailPath(detail.businessId)}
            prefetch={true}
          >
            Open business
          </Link>
        </Button>
      </DashboardSection>
    </DashboardSidebarStack>
  );
}

function describeAutoFollowUp(detail: AdminQuoteDetailCore): string {
  const { autoFollowUp } = detail;

  if (!autoFollowUp.enabled && autoFollowUp.attempts === 0) {
    return "Disabled — no automatic follow-ups will send.";
  }

  const parts = [
    autoFollowUp.enabled ? "Enabled" : "Stopped",
    `every ${autoFollowUp.delayDays} ${autoFollowUp.delayDays === 1 ? "day" : "days"}`,
    `${autoFollowUp.attempts} of ${autoFollowUp.maxAttempts} sent`,
  ];

  if (autoFollowUp.lastSentAt) {
    parts.push(`last sent ${formatDateTime(autoFollowUp.lastSentAt)}`);
  }

  if (autoFollowUp.stoppedAt) {
    parts.push(`stopped ${formatDateTime(autoFollowUp.stoppedAt)}`);
  }

  return `${parts.join(" · ")}.`;
}
