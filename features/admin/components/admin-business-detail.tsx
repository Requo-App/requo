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
import { getAdminUserDetailPath } from "@/features/admin/navigation";
import {
  AdminBusinessToolbar,
  type AdminBusinessToolbarStatus,
} from "@/features/admin/components/admin-business-toolbar";
import { AdminBusinessBillingSection } from "@/features/admin/components/billing/admin-business-billing-section";
import type {
  AdminBusinessBilling,
  AdminBusinessDetail,
  AdminBusinessDetailCore,
} from "@/features/admin/types";
import { BusinessStatusBadge } from "@/features/businesses/components/business-status-badge";
import { businessMemberRoleMeta } from "@/lib/business-members";
import { planMeta, type PlanTier } from "@/lib/plans";

type AdminBusinessMembers = AdminBusinessDetail["members"];

/**
 * Detail view for a business with support actions.
 *
 * The header carries identity (name, slug) + lifecycle status alongside
 * the action toolbar (change plan, cancel subscription, archive /
 * restore, delete — each behind a modal). The main column holds the
 * operational content (pipeline overview, member roster, subscription)
 * and the sidebar holds owner + record metadata. Field clusters use
 * the flat `dl` + `meta-label` rows from the user detail view — no
 * nested panels — and rosters use `DashboardDetailFeed`, matching the
 * inquiry/quote/email details.
 *
 * Thin composer over the section components below (kept so the detail
 * renders identically when the full payload is already in hand, e.g.
 * tests). Route pages stream each section behind its own Suspense
 * boundary instead.
 */
export function AdminBusinessDetail({
  detail,
  billing,
}: {
  detail: AdminBusinessDetail;
  /**
   * Every plan signal for this business, or null when the billing lookup
   * failed to resolve. The section is skipped (not errored) so a billing
   * hiccup never takes down the identity view.
   */
  billing: AdminBusinessBilling | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminBusinessHeaderSection billing={billing} detail={detail} />

      <DashboardDetailLayout className="xl:grid-cols-[minmax(0,1.1fr)_0.9fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <AdminBusinessOverviewSection detail={detail} />
          <AdminBusinessMembersSection
            memberCount={detail.memberCount}
            members={detail.members}
          />
          {billing ? <AdminBusinessBillingSection billing={billing} /> : null}
        </div>

        <AdminBusinessMetaSidebar detail={detail} />
      </DashboardDetailLayout>
    </div>
  );
}

export function AdminBusinessHeaderSection({
  detail,
  billing,
}: {
  detail: AdminBusinessDetailCore;
  billing: AdminBusinessBilling | null;
}) {
  const status = getBusinessLifecycleStatus(detail);

  return (
    <DashboardDetailHeader
      actions={
        <AdminBusinessToolbar
          businessId={detail.id}
          businessName={detail.name}
          status={status}
          subscription={
            billing?.subscription
              ? {
                  plan: billing.subscription.plan,
                  status: billing.subscription.status,
                }
              : null
          }
        />
      }
      description={`/${detail.slug}`}
      meta={
        <>
          <AdminPlanTierBadge plan={detail.plan} />
          <AdminBusinessStatusBadge status={status} />
          <span className="text-xs text-muted-foreground">
            {detail.memberCount.toLocaleString()}{" "}
            {detail.memberCount === 1 ? "member" : "members"}
            {" · "}
            {detail.inquiryCount.toLocaleString()}{" "}
            {detail.inquiryCount === 1 ? "inquiry" : "inquiries"}
            {" · "}
            {detail.quoteCount.toLocaleString()}{" "}
            {detail.quoteCount === 1 ? "quote" : "quotes"}
          </span>
        </>
      }
      title={detail.name}
    />
  );
}

export function AdminBusinessOverviewSection({
  detail,
}: {
  detail: AdminBusinessDetailCore;
}) {
  return (
    <DashboardSection
      description="Pipeline and team at a glance."
      title="Overview"
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <AdminStatBlock
          label="Members"
          sub={`${detail.memberCount.toLocaleString()} ${detail.memberCount === 1 ? "person has" : "people have"} access`}
          value={detail.memberCount.toLocaleString()}
        />
        <AdminStatBlock
          label="Inquiries"
          sub={
            detail.lastInquiryAt
              ? `Last ${formatAdminDate(detail.lastInquiryAt)}`
              : "No inquiries yet"
          }
          value={detail.inquiryCount.toLocaleString()}
        />
        <AdminStatBlock
          label="Quotes"
          sub={
            detail.lastQuoteSentAt
              ? `Last sent ${formatAdminDate(detail.lastQuoteSentAt)}`
              : "Nothing sent yet"
          }
          value={detail.quoteCount.toLocaleString()}
        />
      </div>
    </DashboardSection>
  );
}

export function AdminBusinessMembersSection({
  memberCount,
  members,
}: {
  memberCount: number;
  members: AdminBusinessMembers;
}) {
  return (
    <DashboardSection
      description={`${memberCount.toLocaleString()} ${
        memberCount === 1 ? "person has" : "people have"
      } access to this business, oldest first.`}
      title={`Members (${members.length})`}
    >
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No members have been invited yet.
        </p>
      ) : (
        <DashboardDetailFeed>
          {members.map((member) => {
            const userHref = getAdminUserDetailPath(member.userId);

            return (
              <DashboardDetailFeedItem
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href={userHref} prefetch={true}>
                      Open
                    </Link>
                  </Button>
                }
                key={member.userId}
                meta={
                  <>
                    <span className="truncate">{member.email}</span>
                    <span aria-hidden="true">·</span>
                    <Badge variant="outline">
                      {businessMemberRoleMeta[member.role].label}
                    </Badge>
                    <span aria-hidden="true">·</span>
                    <span>Joined {formatAdminDate(member.joinedAt)}</span>
                  </>
                }
                title={member.name}
              />
            );
          })}
        </DashboardDetailFeed>
      )}
    </DashboardSection>
  );
}

export function AdminBusinessMetaSidebar({
  detail,
}: {
  detail: AdminBusinessDetailCore;
}) {
  const status = getBusinessLifecycleStatus(detail);
  const ownerHref = getAdminUserDetailPath(detail.ownerUserId);

  return (
    <DashboardSidebarStack>
      <DashboardSection title="Owner">
        <dl className="flex flex-col gap-5">
          <div className="min-w-0">
            <dt className="meta-label">Name</dt>
            <dd className="mt-1 truncate text-sm font-medium text-foreground">
              {detail.ownerName}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="meta-label">Email</dt>
            <dd className="mt-1 truncate text-sm text-foreground">
              {detail.ownerEmail}
            </dd>
          </div>
        </dl>
        <Button asChild className="mt-5" size="sm" variant="outline">
          <Link href={ownerHref} prefetch={true}>
            Open owner
          </Link>
        </Button>
      </DashboardSection>

      <DashboardSection title="Record">
        <dl className="flex flex-col gap-5">
          <div className="min-w-0">
            <dt className="meta-label">Status</dt>
            <dd className="mt-1">
              <AdminBusinessStatusBadge status={status} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="meta-label">Created</dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {formatAdminDateTime(detail.createdAt)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="meta-label">Updated</dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {formatAdminDateTime(detail.updatedAt)}
            </dd>
          </div>
          {detail.archivedAt ? (
            <div className="min-w-0">
              <dt className="meta-label">Archived</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                {formatAdminDateTime(detail.archivedAt)}
              </dd>
            </div>
          ) : null}
          {detail.deletedAt ? (
            <div className="min-w-0">
              <dt className="meta-label">Deleted</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                {formatAdminDateTime(detail.deletedAt)}
              </dd>
            </div>
          ) : null}
        </dl>
      </DashboardSection>
    </DashboardSidebarStack>
  );
}

function getBusinessLifecycleStatus(
  detail: Pick<AdminBusinessDetailCore, "archivedAt" | "deletedAt">,
): AdminBusinessToolbarStatus {
  if (detail.deletedAt) {
    return "deleted";
  }

  if (detail.archivedAt) {
    return "archived";
  }

  return "active";
}

function AdminPlanTierBadge({ plan }: { plan: PlanTier }) {
  return (
    <Badge variant={plan === "free" ? "outline" : "secondary"}>
      {planMeta[plan].label}
    </Badge>
  );
}

/**
 * The toolbar's status vocabulary says "deleted" where the shared lifecycle
 * badge says "trash". Everything else lines up, labels included ("Deleted",
 * "Archived", "Active"), so this only translates that one member.
 */
function AdminBusinessStatusBadge({
  status,
}: {
  status: AdminBusinessToolbarStatus;
}) {
  return (
    <BusinessStatusBadge status={status === "deleted" ? "trash" : status} />
  );
}

function AdminStatBlock({
  label,
  sub,
  value,
}: {
  label: string;
  sub: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="meta-label">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function formatAdminDate(value: Date) {
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatAdminDateTime(value: Date) {
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
