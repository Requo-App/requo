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
import { AdminUserToolbar } from "@/features/admin/components/admin-user-toolbar";
import { getAdminActionLabel } from "@/features/admin/labels";
import { getAdminBusinessDetailPath } from "@/features/admin/navigation";
import type {
  AdminAuditLogRow,
  AdminUserDetail as AdminUserDetailPayload,
  AdminUserDetailBusiness,
  AdminUserDetailCore,
} from "@/features/admin/types";
import { isBillingEnabled } from "@/lib/deployment";

type AdminUserDetailProps = {
  user: AdminUserDetailPayload;
  /** Acting admin's id, for the toolbar's self-target guard. */
  adminUserId: string;
};

const detailDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDetailDate(value: Date | null): string {
  if (!value) {
    return "Never";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Never";
  }
  return detailDateFormatter.format(date);
}

function formatPlanLabel(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

/**
 * Detail view for a user with support actions (task 12.3 / Req 3.3).
 *
 * The header carries identity (email, name) + account badges alongside
 * the action toolbar (verify, sessions, suspend, roles, impersonate,
 * delete — suspend behind a modal). The main column holds the
 * operational content (overview, owned businesses, recent audit) and
 * the sidebar holds record metadata. Plans and subscriptions live on
 * businesses only, so billing renders per business on the business
 * page — never here.
 *
 * Thin composer over the section components below (kept so the detail
 * renders identically when the full payload is already in hand, e.g.
 * tests). Route pages stream each section behind its own Suspense
 * boundary instead.
 */
export function AdminUserDetail({
  user,
  adminUserId,
}: AdminUserDetailProps) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminUserHeaderSection
        adminUserId={adminUserId}
        ownedBusinessCount={user.ownedBusinesses.length}
        user={user}
      />

      <DashboardDetailLayout className="xl:grid-cols-[minmax(0,1.1fr)_0.9fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <AdminUserOverviewSection
            ownedBusinesses={user.ownedBusinesses}
            recentAuditLogs={user.recentAuditLogs}
            user={user}
          />
          <AdminUserOwnedBusinessesSection
            ownedBusinesses={user.ownedBusinesses}
          />
          <AdminUserRecentAuditSection recentAuditLogs={user.recentAuditLogs} />
        </div>

        <AdminUserRecordSidebar user={user} />
      </DashboardDetailLayout>
    </div>
  );
}

export function AdminUserHeaderSection({
  user,
  ownedBusinessCount,
  adminUserId,
}: {
  user: AdminUserDetailCore;
  /**
   * Owned-business count for the header meta. Kept a scalar (rather than
   * the roster) so the header stays a cheap paint; the roster streams in
   * its own section below.
   */
  ownedBusinessCount: number;
  adminUserId: string;
}) {
  return (
    <DashboardDetailHeader
      actions={
        <AdminUserToolbar
          adminUserId={adminUserId}
          canDemoteTarget={user.canDemoteTarget}
          targetEmail={user.email}
          targetEmailVerified={user.emailVerified}
          targetIsAdmin={user.role === "admin"}
          targetIsSuspended={user.banned}
          targetUserId={user.id}
        />
      }
      description={user.name || "Requo user"}
      meta={
        <>
          {user.role === "admin" ? (
            <Badge variant="secondary">Admin</Badge>
          ) : (
            <Badge variant="outline">User</Badge>
          )}
          {user.banned ? (
            <Badge variant="destructive">Suspended</Badge>
          ) : (
            <Badge variant="secondary">Active</Badge>
          )}
          {user.emailVerified ? (
            <Badge variant="secondary">Verified</Badge>
          ) : (
            <Badge variant="outline">Unverified</Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {ownedBusinessCount.toLocaleString()}{" "}
            {ownedBusinessCount === 1 ? "business" : "businesses"}
            {" · "}
            {user.activeSessionCount.toLocaleString()}{" "}
            {user.activeSessionCount === 1 ? "session" : "sessions"}
          </span>
        </>
      }
      title={user.email}
    />
  );
}

export function AdminUserOverviewSection({
  user,
  ownedBusinesses,
  recentAuditLogs,
}: {
  user: AdminUserDetailCore;
  ownedBusinesses: AdminUserDetailBusiness[];
  recentAuditLogs: AdminAuditLogRow[];
}) {
  const isSelfHosted = !isBillingEnabled();
  const paidBusinesses = ownedBusinesses.filter(
    (business) => business.plan !== "free",
  ).length;
  const lastAudit = recentAuditLogs[0] ?? null;

  return (
    <DashboardSection
      description="Businesses, sessions, and admin activity at a glance."
      title="Overview"
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <AdminStatBlock
          label="Businesses"
          sub={
            ownedBusinesses.length === 0
              ? "None yet"
              : isSelfHosted
                ? "Billing disabled"
                : paidBusinesses > 0
                  ? `${paidBusinesses.toLocaleString()} on paid plans`
                  : "All on free"
          }
          value={ownedBusinesses.length.toLocaleString()}
        />
        <AdminStatBlock
          label="Active sessions"
          sub={
            user.lastSessionAt
              ? `Last ${formatDetailDate(user.lastSessionAt)}`
              : "Never signed in"
          }
          value={user.activeSessionCount.toLocaleString()}
        />
        <AdminStatBlock
          label="Admin actions"
          sub={
            lastAudit
              ? `${getAdminActionLabel(lastAudit.action)} · ${formatDetailDate(lastAudit.createdAt)}`
              : "No activity yet"
          }
          value={recentAuditLogs.length.toLocaleString()}
        />
      </div>
    </DashboardSection>
  );
}

export function AdminUserOwnedBusinessesSection({
  ownedBusinesses,
}: {
  ownedBusinesses: AdminUserDetailBusiness[];
}) {
  const isSelfHosted = !isBillingEnabled();

  return (
    <DashboardSection
      description={
        isSelfHosted
          ? "Businesses this user owns."
          : "Businesses this user owns. Plans and subscriptions are managed on each business page."
      }
      title={`Owned businesses (${ownedBusinesses.length})`}
    >
      {ownedBusinesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This user doesn&apos;t own any businesses yet.
        </p>
      ) : (
        <DashboardDetailFeed>
          {ownedBusinesses.map((business) => (
            <DashboardDetailFeedItem
              action={
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={getAdminBusinessDetailPath(business.id)}
                    prefetch={true}
                  >
                    Open
                  </Link>
                </Button>
              }
              key={business.id}
              meta={
                <>
                  <span>{business.slug}</span>
                  {isSelfHosted ? null : (
                    <>
                      <span aria-hidden="true">·</span>
                      <Badge variant="outline">
                        {formatPlanLabel(business.plan)}
                      </Badge>
                    </>
                  )}
                </>
              }
              title={business.name}
            />
          ))}
        </DashboardDetailFeed>
      )}
    </DashboardSection>
  );
}

export function AdminUserRecentAuditSection({
  recentAuditLogs,
}: {
  recentAuditLogs: AdminAuditLogRow[];
}) {
  return (
    <DashboardSection
      description="Most recent admin activity targeting this user."
      title={`Recent audit (${recentAuditLogs.length})`}
    >
      {recentAuditLogs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No admin activity yet.</p>
      ) : (
        <DashboardDetailFeed>
          {recentAuditLogs.map((entry) => (
            <DashboardDetailFeedItem
              key={entry.id}
              meta={
                <>
                  <span>{entry.adminEmail}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDetailDate(entry.createdAt)}</span>
                </>
              }
              title={getAdminActionLabel(entry.action)}
            />
          ))}
        </DashboardDetailFeed>
      )}
    </DashboardSection>
  );
}

export function AdminUserRecordSidebar({
  user,
}: {
  user: AdminUserDetailCore;
}) {
  return (
    <DashboardSidebarStack>
      <DashboardSection title="Record">
        <dl className="flex flex-col gap-5">
          <div className="min-w-0">
            <dt className="meta-label">Status</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              {user.banned ? (
                <Badge variant="destructive">Suspended</Badge>
              ) : (
                <Badge variant="secondary">Active</Badge>
              )}
              {user.banReason ? (
                <span className="text-xs text-muted-foreground">
                  {user.banReason}
                </span>
              ) : null}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="meta-label">Created</dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {formatDetailDate(user.createdAt)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="meta-label">Last session</dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {formatDetailDate(user.lastSessionAt)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="meta-label">Active sessions</dt>
            <dd className="mt-1 text-sm text-foreground">
              {user.activeSessionCount}
            </dd>
          </div>
        </dl>
      </DashboardSection>
    </DashboardSidebarStack>
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
