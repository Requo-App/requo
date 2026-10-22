export const businessMemberRoles = ["owner", "manager", "staff"] as const;
export const businessMemberAssignableRoles = ["manager", "staff"] as const;
export const businessMemberInviteDurationDays = 14;

export type BusinessMemberRole = (typeof businessMemberRoles)[number];
export type BusinessMemberAssignableRole =
  (typeof businessMemberAssignableRoles)[number];

type BusinessMemberRoleMeta = {
  label: string;
  shortLabel: string;
  description: string;
};

export const businessMemberRoleMeta: Record<
  BusinessMemberRole,
  BusinessMemberRoleMeta
> = {
  owner: {
    label: "Owner",
    shortLabel: "Owner",
    description: "Full access, including members and business administration.",
  },
  manager: {
    label: "Manager",
    shortLabel: "Manager",
    description: "Can manage day-to-day operations, quotes, and workflow settings.",
  },
  staff: {
    label: "Staff",
    shortLabel: "Staff",
    description: "Can work on inquiries and quotes without admin access.",
  },
};

const businessMemberRoleWeight: Record<BusinessMemberRole, number> = {
  owner: 3,
  manager: 2,
  staff: 1,
};

export function hasBusinessRoleAccess(
  currentRole: BusinessMemberRole,
  minimumRole: BusinessMemberRole,
) {
  return (
    businessMemberRoleWeight[currentRole] >=
    businessMemberRoleWeight[minimumRole]
  );
}

export function canManageBusinessMembers(role: BusinessMemberRole) {
  return role === "owner" || role === "manager";
}

export function canManageBusinessAdministration(role: BusinessMemberRole) {
  return role === "owner";
}

export function canManageOperationalBusinessSettings(role: BusinessMemberRole) {
  return hasBusinessRoleAccess(role, "manager");
}

export function canViewBusinessAnalytics(role: BusinessMemberRole) {
  return hasBusinessRoleAccess(role, "staff");
}

export function isBusinessMember(role: BusinessMemberRole) {
  return hasBusinessRoleAccess(role, "staff");
}
