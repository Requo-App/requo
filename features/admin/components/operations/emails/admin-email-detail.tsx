import Link from "next/link";

import {
  DashboardDetailFeed,
  DashboardDetailFeedItem,
  DashboardDetailHeader,
  DashboardDetailLayout,
  DashboardSection,
  DashboardSidebarStack,
} from "@/components/shared/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminEmailStatusBadge } from "@/features/admin/components/primitives/admin-status-badges";
import { AdminEmailRetryAction } from "@/features/admin/components/operations/emails/admin-email-retry-action";
import { EmailHtmlPreview } from "@/features/admin/components/operations/emails/email-html-preview";
import { getAdminBusinessDetailPath } from "@/features/admin/navigation";
import type {
  AdminEmailAttempt,
  AdminEmailBody,
  AdminEmailDetail,
  AdminEmailDetailCore,
} from "@/features/admin/types";

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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="meta-label">{label}</dt>
      <dd className="mt-1 text-sm text-foreground break-words">{value}</dd>
    </div>
  );
}

/**
 * Read-only admin detail view for a transactional email.
 *
 * Privacy contract (mirrored by the queries, which never select `cc`/`bcc`
 * and only load bodies for non-auth types):
 *
 * - `subject`, recipients, status, provider, attempts, errors, and
 *   timestamps always render.
 * - `html`/`textBody` render only when `type !== "auth"` — for auth
 *   emails the page shows "Body redacted for auth emails" instead, so
 *   verification codes and magic links never reach the browser.
 * - `cc`/`bcc` never render.
 *
 * Field clusters use flat `dl` rows and rosters use
 * `DashboardDetailFeed` — the same composition as the inquiry detail
 * view. The HTML preview stays in a sandboxed iframe (scripts disabled);
 * it auto-sizes to content height so short emails don't render as a
 * tall white void.
 *
 * Thin composer over the section components below (kept so the detail
 * renders identically when the full payload is already in hand, e.g.
 * tests). Route pages stream each section behind its own Suspense
 * boundary instead.
 */
export function AdminEmailDetailView({
  detail,
}: {
  detail: AdminEmailDetail;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminEmailHeaderSection detail={detail} />

      <DashboardDetailLayout className="xl:grid-cols-[minmax(0,1.1fr)_0.9fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <AdminEmailDeliverySection detail={detail} />
          <AdminEmailTimelineSection
            attempts={detail.timeline}
            status={detail.status}
          />
          <AdminEmailBodySection body={detail} subject={detail.subject} />
        </div>

        <AdminEmailMetaSidebar detail={detail} />
      </DashboardDetailLayout>
    </div>
  );
}

export function AdminEmailHeaderSection({
  detail,
}: {
  detail: AdminEmailDetailCore;
}) {
  return (
    <DashboardDetailHeader
      meta={
        <>
          <AdminEmailStatusBadge status={detail.status} />
          <Badge variant="ghost">{detail.type}</Badge>
          <span className="text-xs text-muted-foreground">
            {detail.businessName ? `${detail.businessName} · ` : ""}
            {detail.sentAt
              ? `Sent ${formatDateTime(detail.sentAt)}`
              : `Recorded ${formatDateTime(detail.createdAt)}`}
          </span>
        </>
      }
      title={detail.subject}
    />
  );
}

export function AdminEmailDeliverySection({
  detail,
}: {
  detail: AdminEmailDetailCore;
}) {
  return (
    <DashboardSection
      description="Delivery state and provider references."
      title="Delivery"
    >
      <dl className="grid gap-5 sm:grid-cols-2">
        <DetailRow label="Provider" value={detail.provider || "—"} />
        <DetailRow
          label="Provider message id"
          value={detail.providerMessageId || "—"}
        />
        <DetailRow label="Attempts" value={`${detail.attempts}`} />
        <DetailRow label="Last error" value={detail.lastError || "—"} />
        <DetailRow label="Idempotency key" value={detail.idempotencyKey} />
        <DetailRow label="Updated" value={formatDateTime(detail.updatedAt)} />
      </dl>
      <AdminEmailRetryAction
        emailId={detail.id}
        status={detail.status}
        type={detail.type}
      />
    </DashboardSection>
  );
}

export function AdminEmailTimelineSection({
  attempts,
  status,
}: {
  attempts: AdminEmailAttempt[];
  status: string;
}) {
  return (
    <DashboardSection
      description="Created → provider attempts → sent or failed, plus retryability."
      title={`Attempts (${attempts.length})`}
    >
      {attempts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No provider attempts recorded yet — the email is still {status}.
        </p>
      ) : (
        <DashboardDetailFeed>
          {attempts.map((attempt) => (
            <DashboardDetailFeedItem
              key={attempt.id}
              meta={
                <>
                  <span className="capitalize">{attempt.provider}</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{attempt.status}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDateTime(attempt.createdAt)}</span>
                  {attempt.retryable ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Retryable</span>
                    </>
                  ) : null}
                </>
              }
              title={attempt.errorMessage || "Attempt recorded"}
              titleLines={2}
            />
          ))}
        </DashboardDetailFeed>
      )}
    </DashboardSection>
  );
}

export function AdminEmailBodySection({
  body,
  subject,
}: {
  body: AdminEmailBody;
  subject: string;
}) {
  return (
    <DashboardSection
      description={
        body.bodyRedacted
          ? "Hidden by the auth-email privacy rule."
          : "Preview of what the customer received, plus the plain-text fallback."
      }
      title="Body"
    >
      {body.bodyRedacted ? (
        <p className="text-sm text-muted-foreground">
          Body redacted for auth emails.
        </p>
      ) : body.html || body.textBody ? (
        <div className="flex min-w-0 flex-col gap-5">
          {body.html ? (
            <div className="min-w-0">
              <p className="meta-label">Preview</p>
              <div className="mt-1">
                <EmailHtmlPreview
                  html={body.html}
                  title={`HTML body of "${subject}"`}
                />
              </div>
            </div>
          ) : null}
          {body.textBody ? (
            <div className="min-w-0">
              <p className="meta-label">Plain-text version</p>
              <p className="mt-1 text-sm leading-6 text-foreground whitespace-pre-wrap break-words">
                {body.textBody}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No body content stored for this email.
        </p>
      )}
    </DashboardSection>
  );
}

export function AdminEmailMetaSidebar({
  detail,
}: {
  detail: AdminEmailDetailCore;
}) {
  return (
    <DashboardSidebarStack>
      <DashboardSection title="Recipients">
        {detail.recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recipients.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.recipients.map((recipient) => (
              <li
                className="truncate text-sm font-medium text-foreground"
                key={recipient}
              >
                {recipient}
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection title="Business">
        {detail.businessId && detail.businessName ? (
          <div className="flex flex-col">
            <dl className="flex flex-col gap-5">
              <DetailRow label="Name" value={detail.businessName} />
            </dl>
            <Button asChild className="mt-5" size="sm" variant="outline">
              <Link
                href={getAdminBusinessDetailPath(detail.businessId)}
                prefetch={true}
              >
                Open business
              </Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No business attached — a system email.
          </p>
        )}
      </DashboardSection>
    </DashboardSidebarStack>
  );
}
