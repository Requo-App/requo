import type { LucideIcon } from "lucide-react";
import {
  Astroid,
  BarChart3,
  BellRing,
  FileText,
  Receipt,
  Home,
  Inbox,
  Package,
  PencilRuler,
  Wallet,
} from "lucide-react";


import {
  canViewBusinessAnalytics,
  type BusinessMemberRole,
} from "@/lib/business-members";
import {
  getBusinessAnalyticsPath,
  getBusinessAssistantPath,
  getBusinessHomePath,
  getBusinessSlugFromPathname,
  getBusinessPath,
  getBusinessFollowUpsPath,
  getBusinessServicesPath,
  getBusinessInquiriesPath,
  getBusinessMembersPath,
  getBusinessNotificationsPath,
  getBusinessNewInquiryPath,
  getBusinessProductsPath,
  getBusinessQuotesPath,
  getBusinessInvoicesPath,
  getBusinessPaymentsPath,
  getBusinessSettingsPath,
} from "@/features/businesses/routes";

export type DashboardNavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type DashboardBreadcrumbItem = {
  label: string;
  href?: string;
};

export function getDashboardNavigation(
  slug: string,
  role: BusinessMemberRole,
): DashboardNavigationItem[] {
  return [
    {
      href: getBusinessHomePath(slug),
      label: "Home",
      description: "Your home base: see what needs attention.",
      icon: Home,
    },
    {
      href: getBusinessInquiriesPath(slug),
      label: "Inquiries",
      description: "Capture, review, and move customer inquiries forward.",
      icon: Inbox,
    },
    {
      href: getBusinessQuotesPath(slug),
      label: "Quotes",
      description: "Draft, send, and track quotes from one place.",
      icon: FileText,
    },
    {
      href: getBusinessInvoicesPath(slug),
      label: "Invoices",
      description: "Track invoices, payments, and balances.",
      icon: Receipt,
    },
    {
      href: getBusinessPaymentsPath(slug),
      label: "Payments",
      description: "Review payments recorded against invoices.",
      icon: Wallet,
    },
    {
      href: getBusinessFollowUpsPath(slug),
      label: "Follow-ups",
      description: "See who needs contact next and when.",
      icon: BellRing,
    },
    {
      href: getBusinessAssistantPath(slug),
      label: "Assistant",
      description: "Chat with your business assistant.",
      icon: Astroid,
    },
    {
      href: getBusinessServicesPath(slug),
      label: "Services",
      description: "Build and manage the services that capture customer inquiries.",
      icon: PencilRuler,
    },
    {
      href: getBusinessProductsPath(slug),
      label: "Products",
      description: "Reusable blocks and packages for faster quotes.",
      icon: Package,
    },
    ...(canViewBusinessAnalytics(role)
      ? [
          {
            href: getBusinessAnalyticsPath(slug),
            label: "Analytics",
            description: "Track form performance, quote outcomes, and workflow timing.",
            icon: BarChart3,
          },
        ]
      : []),
  ];
}

function resolveDashboardActivePathname(pathname: string) {
  const slug = getBusinessSlugFromPathname(pathname);

  if (!slug) {
    return pathname;
  }

  const membersPath = getBusinessMembersPath(slug);

  // Members lives in settings now; keep it out of the main-nav active set.
  if (
    pathname === membersPath ||
    pathname.startsWith(`${membersPath}/`)
  ) {
    return membersPath;
  }

  const legacyDashboardPath = `${getBusinessPath(slug)}/dashboard`;
  const homePath = getBusinessHomePath(slug);

  if (pathname === legacyDashboardPath) {
    return homePath;
  }

  return pathname;
}

export function isDashboardNavigationItemActive(
  pathname: string,
  href: string,
) {
  const activePathname = resolveDashboardActivePathname(pathname);

  if (href.endsWith("/settings/general")) {
    const settingsRootPath = href.slice(0, -"/general".length);

    return (
      activePathname === settingsRootPath ||
      activePathname.startsWith(`${settingsRootPath}/`)
    );
  }

  if (href.endsWith("/home")) {
    return activePathname === href;
  }

  return activePathname === href || activePathname.startsWith(`${href}/`);
}

export function getActiveDashboardNavigationItem(pathname: string) {
  const activePathname = resolveDashboardActivePathname(pathname);
  const slug = getBusinessSlugFromPathname(activePathname);

  if (!slug) {
    return null;
  }

  const dashboardNavigation = getDashboardNavigation(slug, "owner");

  return (
    dashboardNavigation.find((item) =>
      isDashboardNavigationItemActive(activePathname, item.href),
    ) ?? dashboardNavigation[0]
  );
}

function formatBreadcrumbLabel(value: string) {
  const normalized = decodeURIComponent(value)
    .replace(/[-_]+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatRecordHint(value: string) {
  const decodedValue = decodeURIComponent(value).trim();

  if (!decodedValue) {
    return "";
  }

  // Keep UUID-like or opaque IDs short so breadcrumbs stay readable.
  if (/^[a-f0-9-]{12,}$/i.test(decodedValue)) {
    return decodedValue.slice(0, 8);
  }

  return formatBreadcrumbLabel(decodedValue);
}

function withHome(
  _slug: string,
  items: DashboardBreadcrumbItem[],
): DashboardBreadcrumbItem[] {
  const normalizedItems = items.map((item) => ({
    ...item,
    label: item.label
      .replace(/^Requests$/, "Inquiries")
      .replace(/^Request\b/, "Inquiry"),
  }));

  return normalizedItems;
}

export function getDashboardBreadcrumbs(pathname: string): DashboardBreadcrumbItem[] {
  const slug = getBusinessSlugFromPathname(pathname);

  if (!slug) {
    return [];
  }

  const homePath = getBusinessHomePath(slug);
  const analyticsPath = getBusinessAnalyticsPath(slug);
  const followUpsPath = getBusinessFollowUpsPath(slug);
  const inquiriesPath = getBusinessInquiriesPath(slug);
  const quotesPath = getBusinessQuotesPath(slug);
  const invoicesPath = getBusinessInvoicesPath(slug);
  const servicesPath = getBusinessServicesPath(slug);
  const membersPath = getBusinessMembersPath(slug);
  const notificationsPath = getBusinessNotificationsPath(slug);
  const productsPath = getBusinessProductsPath(slug);
  const settingsPath = getBusinessSettingsPath(slug);
  const assistantPath = getBusinessAssistantPath(slug);

  if (pathname === homePath) {
    return [{ label: "Home" }];
  }

  if (pathname === analyticsPath || pathname.startsWith(`${analyticsPath}/`)) {
    return withHome(slug, [{ label: "Analytics" }]);
  }

  if (pathname === assistantPath || pathname.startsWith(`${assistantPath}/`)) {
    const relativePath = pathname.slice(assistantPath.length);
    const segments = relativePath.split("/").filter(Boolean);

    if (segments.length === 0) {
      return withHome(slug, [{ label: "Assistant" }]);
    }

    if (segments[0] === "chat") {
      if (!segments[1]) {
        return withHome(slug, [{ label: "Assistant" }]);
      }
      return withHome(slug, [
        { label: "Assistant", href: assistantPath },
        { label: `Conversation: ${formatRecordHint(segments[1])}` },
      ]);
    }

    if (segments[0] === "settings") {
      return withHome(slug, [
        { label: "Assistant", href: assistantPath },
        { label: "Public chat settings" },
      ]);
    }

    return withHome(slug, [{ label: "Assistant" }]);
  }

  if (pathname === inquiriesPath) {
    return withHome(slug, [{ label: "Inquiries" }]);
  }

  if (pathname === getBusinessNewInquiryPath(slug)) {
    return withHome(slug, [
      {
        label: "Inquiries",
        href: inquiriesPath,
      },
      {
        label: "New inquiry",
      },
    ]);
  }

  if (pathname.startsWith(`${inquiriesPath}/`)) {
    const inquiryId = pathname.slice(`${inquiriesPath}/`.length).split("/")[0];

    return withHome(slug, [
      {
        label: "Inquiries",
        href: inquiriesPath,
      },
      {
        label: inquiryId
          ? `Inquiry: ${formatRecordHint(inquiryId)}`
          : "Inquiry details",
      },
    ]);
  }

  if (pathname === quotesPath) {
    return withHome(slug, [{ label: "Quotes" }]);
  }

  if (pathname === invoicesPath || pathname.startsWith(`${invoicesPath}/`)) {
    return withHome(slug, [{ label: "Invoices" }]);
  }

  if (pathname === followUpsPath || pathname.startsWith(`${followUpsPath}/`)) {
    return withHome(slug, [{ label: "Follow-ups" }]);
  }

  if (pathname === `${quotesPath}/new`) {
    return withHome(slug, [
      {
        label: "Quotes",
        href: quotesPath,
      },
      {
        label: "New quote",
      },
    ]);
  }

  if (pathname.startsWith(`${quotesPath}/`)) {
    const quoteId = pathname.slice(`${quotesPath}/`.length).split("/")[0];

    return withHome(slug, [
      {
        label: "Quotes",
        href: quotesPath,
      },
      {
        label: quoteId
          ? `Quote: ${formatRecordHint(quoteId)}`
          : "Quote details",
      },
    ]);
  }

  if (pathname === servicesPath) {
    return withHome(slug, [{ label: "Services" }]);
  }

  if (pathname.startsWith(`${servicesPath}/`)) {
    const serviceSlug = pathname.slice(`${servicesPath}/`.length).split("/")[0];

    return withHome(slug, [
      {
        label: "Services",
        href: servicesPath,
      },
      {
        label: serviceSlug ? formatBreadcrumbLabel(serviceSlug) : "Service details",
      },
    ]);
  }

  if (pathname === membersPath || pathname.startsWith(`${membersPath}/`)) {
    return withHome(slug, [{ label: "Members" }]);
  }

  if (pathname === notificationsPath || pathname.startsWith(`${notificationsPath}/`)) {
    return withHome(slug, [{ label: "Notifications" }]);
  }

  if (pathname === productsPath || pathname.startsWith(`${productsPath}/`)) {
    return withHome(slug, [{ label: "Products" }]);
  }

  if (pathname === settingsPath) {
    return withHome(slug, [{ label: "Settings" }]);
  }

  if (pathname.startsWith(`${settingsPath}/`)) {
    const relativePath = pathname.slice(`${settingsPath}/`.length);
    const segments = relativePath.split("/").filter(Boolean);
    const section = segments[0];
    const sectionLabels: Record<string, string> = {
      general: "Business profile",
      notifications: "Notifications",
      profile: "Profile",
      inquiry: "Services",
      quote: "Quote defaults",
      knowledge: "Knowledge",
    };
    const sectionLabel = sectionLabels[section] ?? formatBreadcrumbLabel(section);

    if (section === "inquiry" && segments[1]) {
      return withHome(slug, [
        {
          label: "Services",
          href: servicesPath,
        },
        {
          label: formatBreadcrumbLabel(segments[1]),
        },
      ]);
    }

    return withHome(slug, [
      {
        label: "Settings",
        href: getBusinessSettingsPath(slug, "general"),
      },
      {
        label: sectionLabel,
      },
    ]);
  }

  return [{ label: "Home" }];
}

