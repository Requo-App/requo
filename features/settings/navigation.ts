import { getBusinessSettingsPath } from "@/features/businesses/routes";
import type { BusinessMemberRole } from "@/lib/business-members";
import { canManageBusinessAdministration } from "@/lib/business-members";

// --- Unified Settings Navigation (Requirements 4.2, 4.3) ---

export type SettingsNavigationItem = {
  href: string;
  label: string;
  icon: string;
};

export type SettingsNavigationGroup = {
  label: string;
  items: SettingsNavigationItem[];
};

export function getUnifiedSettingsNavigation(
  slug: string,
): SettingsNavigationGroup[] {
  return [
    {
      label: "User",
      items: [
        { href: `/${slug}/settings/profile`, label: "Profile", icon: "user" },
        {
          href: `/${slug}/settings/appearance`,
          label: "Appearance",
          icon: "palette",
        },
        {
          href: `/${slug}/settings/notifications`,
          label: "Notifications",
          icon: "bell",
        },
      ],
    },
    {
      label: "Business",
      items: [
        {
          href: `/${slug}/settings/general`,
          label: "General",
          icon: "building",
        },
        {
          href: `/${slug}/settings/quote`,
          label: "Quotes",
          icon: "file-text",
        },
        {
          href: `/${slug}/settings/email`,
          label: "Email templates",
          icon: "mail",
        },
        {
          href: `/${slug}/settings/workflow`,
          label: "Workflow",
          icon: "file-text",
        },
        {
          href: `/${slug}/settings/ai`,
          label: "Assistant",
          icon: "astroid",
        },
        {
          href: `/${slug}/settings/billing`,
          label: "Billing",
          icon: "receipt",
        },
        {
          href: `/${slug}/settings/members`,
          label: "Members",
          icon: "users",
        },
        {
          href: `/${slug}/settings/audit-log`,
          label: "Audit log",
          icon: "scroll",
        },
      ],
    },
    {
      label: "Other",
      items: [
        {
          href: `/${slug}/settings/support`,
          label: "Help & Support",
          icon: "life-buoy",
        },
      ],
    },
  ];
}

export function getDefaultBusinessSettingsSection(role: BusinessMemberRole) {
  if (canManageBusinessAdministration(role)) {
    return "general" as const;
  }

  return "notifications" as const;
}

export function getDefaultBusinessSettingsPath(
  slug: string,
  role: BusinessMemberRole,
) {
  // Owners land on Business › General; staff land on User › Profile.
  if (canManageBusinessAdministration(role)) {
    return getBusinessSettingsPath(slug, "general");
  }

  return getBusinessSettingsPath(slug, "profile");
}
