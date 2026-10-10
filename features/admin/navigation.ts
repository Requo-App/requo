/**
 * Admin console navigation.
 *
 * Single source of truth for the admin left-rail, breadcrumbs, and route
 * helpers. Consumed by `admin-sidebar.tsx`, `admin-shell.tsx`, and pages.
 *
 * Paths are absolute from the main host (`/admin/users`) because the console
 * is served path-only at `/admin` — no subdomain rewrite. Keep every path
 * below under `/admin/*`: anything else falls through to the business
 * `[businessSlug]` routes and renders business mode instead of the console.
 */

import type { ComponentType } from "react";
import {
  RiBarChartLine,
  RiBriefcaseLine,
  RiDashboardLine,
  RiErrorWarningLine,
  RiFileList3Line,
  RiFileTextLine,
  RiHistoryLine,
  RiInboxLine,
  RiMailSendLine,
  RiPlugLine,
  RiReceiptLine,
  RiServerLine,
  RiSparklingLine,
  RiUserLine,
} from "@remixicon/react";

import type {
  DashboardNavGroup,
  DashboardNavItem,
} from "@/components/shared/dashboard-sidebar";

/** Icon shape accepted by the shared sidebar rows. */
export type AdminNavIcon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type AdminNavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: AdminNavIcon;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavigationItem[];
};

export type AdminBreadcrumbItem = {
  label: string;
  href?: string;
};

/* ── Paths ──────────────────────────────────────────────────────────────── */

export const ADMIN_ROOT_PATH = "/admin";
export const ADMIN_BUSINESSES_PATH = "/admin/businesses";
export const ADMIN_USERS_PATH = "/admin/users";
export const ADMIN_INQUIRIES_PATH = "/admin/inquiries";
export const ADMIN_QUOTES_PATH = "/admin/quotes";
export const ADMIN_INVOICES_PATH = "/admin/invoices";
export const ADMIN_AI_PATH = "/admin/ai";
export const ADMIN_AI_REQUESTS_PATH = "/admin/ai/requests";
export const ADMIN_AI_PROVIDERS_PATH = "/admin/ai/providers";
export const ADMIN_AI_ERRORS_PATH = "/admin/ai/errors";
export const ADMIN_EMAILS_PATH = "/admin/emails";
export const ADMIN_USAGE_PATH = "/admin/usage";
export const ADMIN_AUDIT_LOGS_PATH = "/admin/audit-logs";
export const ADMIN_SYSTEM_PATH = "/admin/system";

/* ── Grouped navigation ─────────────────────────────────────────────────── */

export const adminNavigationGroups: readonly AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: ADMIN_ROOT_PATH,
        label: "Overview",
        description: "What is happening in Requo right now.",
        icon: RiDashboardLine,
      },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        href: ADMIN_BUSINESSES_PATH,
        label: "Businesses",
        description: "Manage Requo businesses and their accounts.",
        icon: RiBriefcaseLine,
      },
      {
        href: ADMIN_USERS_PATH,
        label: "Users",
        description: "Search, inspect, and support Requo users.",
        icon: RiUserLine,
      },
    ],
  },
  {
    label: "Product",
    items: [
      {
        href: ADMIN_INQUIRIES_PATH,
        label: "Inquiries",
        description: "Inbound customer requests across every business.",
        icon: RiInboxLine,
      },
      {
        href: ADMIN_QUOTES_PATH,
        label: "Quotes",
        description: "Quote drafts, deliveries, and customer responses.",
        icon: RiFileTextLine,
      },
      {
        href: ADMIN_INVOICES_PATH,
        label: "Invoices",
        description: "Manual-payment invoices across every business.",
        icon: RiReceiptLine,
      },
    ],
  },
  {
    label: "AI",
    items: [
      {
        href: ADMIN_AI_PATH,
        label: "Overview",
        description: "Model usage, cost, and reliability at a glance.",
        icon: RiSparklingLine,
      },
      {
        href: ADMIN_AI_REQUESTS_PATH,
        label: "Requests",
        description: "Per-call provider, model, latency, and tokens.",
        icon: RiHistoryLine,
      },
      {
        href: ADMIN_AI_PROVIDERS_PATH,
        label: "Providers",
        description: "Configured providers, routing, and live capacity.",
        icon: RiPlugLine,
      },
      {
        href: ADMIN_AI_ERRORS_PATH,
        label: "Errors",
        description: "Failed AI calls and security events.",
        icon: RiErrorWarningLine,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: ADMIN_EMAILS_PATH,
        label: "Emails",
        description: "Transactional email delivery and failures.",
        icon: RiMailSendLine,
      },
      {
        href: ADMIN_USAGE_PATH,
        label: "Usage",
        description: "Who is consuming platform resources.",
        icon: RiBarChartLine,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: ADMIN_AUDIT_LOGS_PATH,
        label: "Audit Logs",
        description: "Every admin view and action, newest first.",
        icon: RiFileList3Line,
      },
      {
        href: ADMIN_SYSTEM_PATH,
        label: "System",
        description: "System health, admin access, and configuration.",
        icon: RiServerLine,
      },
    ],
  },
] as const;

/** Flattened navigation, derived from {@link adminNavigationGroups}. */
export const adminNavigation: readonly AdminNavigationItem[] =
  adminNavigationGroups.flatMap((group) => group.items);

/**
 * Project the admin groups onto the shared `DashboardSidebar` group shape so
 * the admin rail renders with the exact chrome the business dashboard uses.
 */
export function getAdminSidebarNavGroups(): DashboardNavGroup[] {
  return adminNavigationGroups.map((group) => ({
    label: group.label,
    items: group.items.map(
      (item): DashboardNavItem => ({
        key: item.href,
        label: item.label,
        icon: item.icon,
        href: item.href,
      }),
    ),
  }));
}

/* ── Route helpers ──────────────────────────────────────────────────────── */

export function getAdminUserDetailPath(userId: string) {
  return `${ADMIN_USERS_PATH}/${userId}`;
}

export function getAdminBusinessDetailPath(businessId: string) {
  return `${ADMIN_BUSINESSES_PATH}/${businessId}`;
}

export function getAdminInquiryDetailPath(inquiryId: string) {
  return `${ADMIN_INQUIRIES_PATH}/${inquiryId}`;
}

export function getAdminQuoteDetailPath(quoteId: string) {
  return `${ADMIN_QUOTES_PATH}/${quoteId}`;
}

export function getAdminInvoiceDetailPath(invoiceId: string) {
  return `${ADMIN_INVOICES_PATH}/${invoiceId}`;
}

export function getAdminEmailDetailPath(emailId: string) {
  return `${ADMIN_EMAILS_PATH}/${emailId}`;
}

export function getAdminStartImpersonationPath(userId: string) {
  return `${ADMIN_USERS_PATH}/${userId}/impersonate`;
}

export const ADMIN_STOP_IMPERSONATING_PATH = "/admin/stop-impersonating";

/* ── Active state ───────────────────────────────────────────────────────── */

export function isAdminNavigationItemActive(pathname: string, href: string) {
  if (href === ADMIN_ROOT_PATH) {
    return pathname === ADMIN_ROOT_PATH;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getActiveAdminNavigationItem(pathname: string) {
  // Longest match wins so `/ai/requests` beats `/ai`.
  return [...adminNavigation]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isAdminNavigationItemActive(pathname, item.href));
}

/* ── Breadcrumbs ────────────────────────────────────────────────────────── */

/** Top-level sections that own a breadcrumb trail. */
const ADMIN_SECTION_CRUMBS: Record<string, string> = {
  [ADMIN_BUSINESSES_PATH]: "Businesses",
  [ADMIN_USERS_PATH]: "Users",
  [ADMIN_INQUIRIES_PATH]: "Inquiries",
  [ADMIN_QUOTES_PATH]: "Quotes",
  [ADMIN_INVOICES_PATH]: "Invoices",
  [ADMIN_AI_PATH]: "AI",
  [ADMIN_EMAILS_PATH]: "Emails",
  [ADMIN_USAGE_PATH]: "Usage",
  [ADMIN_AUDIT_LOGS_PATH]: "Audit Logs",
  [ADMIN_SYSTEM_PATH]: "System",
};

/** Second-level pages that are real routes, not `[id]` detail pages. */
const ADMIN_NESTED_PAGE_CRUMBS: Record<string, string> = {
  [ADMIN_AI_REQUESTS_PATH]: "Requests",
  [ADMIN_AI_PROVIDERS_PATH]: "Providers",
  [ADMIN_AI_ERRORS_PATH]: "Errors",
};

/** Label used for a `[id]` detail crumb, per section. */
const ADMIN_DETAIL_CRUMBS: Record<string, string> = {
  [ADMIN_BUSINESSES_PATH]: "Business detail",
  [ADMIN_USERS_PATH]: "User detail",
  [ADMIN_INQUIRIES_PATH]: "Inquiry detail",
  [ADMIN_QUOTES_PATH]: "Quote detail",
  [ADMIN_INVOICES_PATH]: "Invoice detail",
  [ADMIN_EMAILS_PATH]: "Email detail",
};

function withOverviewHome(
  items: AdminBreadcrumbItem[],
): AdminBreadcrumbItem[] {
  return [{ label: "Overview", href: ADMIN_ROOT_PATH }, ...items];
}

export function getAdminBreadcrumbs(pathname: string): AdminBreadcrumbItem[] {
  if (pathname === ADMIN_ROOT_PATH) {
    return [{ label: "Overview" }];
  }

  // Strip the `/admin` mount point: `usePathname()` returns absolute paths
  // (`/admin/users/u1`), while the section tables below are keyed per section.
  const segments = pathname
    .replace(/^\/admin(?=\/|$)/, "")
    .split("/")
    .filter(Boolean);
  const sectionPath = `${ADMIN_ROOT_PATH}/${segments[0]}`;
  const sectionLabel = ADMIN_SECTION_CRUMBS[sectionPath];

  if (!sectionLabel) {
    return withOverviewHome([{ label: "Admin" }]);
  }

  // Single segment: a list/index page.
  if (segments.length === 1) {
    return withOverviewHome([{ label: sectionLabel }]);
  }

  // `/ai/requests`, `/ai/providers`, `/ai/errors` are real pages.
  const nestedLabel = ADMIN_NESTED_PAGE_CRUMBS[pathname];

  if (nestedLabel) {
    return withOverviewHome([
      { label: sectionLabel, href: sectionPath },
      { label: nestedLabel },
    ]);
  }

  // Anything deeper is an `[id]` detail page.
  return withOverviewHome([
    { label: sectionLabel, href: sectionPath },
    { label: ADMIN_DETAIL_CRUMBS[sectionPath] ?? "Detail" },
  ]);
}
